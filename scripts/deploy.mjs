#!/usr/bin/env node
/**
 * BRONEE HRMS — one-command deployment.
 *
 * Creates the Cloudflare resources, applies migrations and seed data, deploys
 * the Worker API and publishes the Pages site.
 *
 *   npm run deploy
 *
 * Run `npm run deploy -- --help` for the individual steps.
 */
import { execFileSync, execFileSync as run } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.join(root, 'packages', 'api');
const webDir = path.join(root, 'packages', 'web');

const PAGES_PROJECT = 'bronee-hrms';
const PAGES_URL = 'https://bronee-hrms.pages.dev';
const WORKER_NAME = 'bronee-hrms-api';

const args = process.argv.slice(2);
const only = args.find((a) => !a.startsWith('-'));

const log = (msg = '') => stdout.write(`${msg}\n`);
const step = (n, total, msg) => log(`\n[${n}/${total}] ${msg}`);

function wrangler(cmd, opts = {}) {
  return run('npx', ['wrangler', ...cmd], {
    cwd: apiDir,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...opts,
  });
}

function wranglerOrNull(cmd) {
  try {
    return wrangler(cmd);
  } catch {
    return null;
  }
}

function readWranglerToml() {
  return readFileSync(path.join(apiDir, 'wrangler.toml'), 'utf8');
}

function writeWranglerToml(contents) {
  writeFileSync(path.join(apiDir, 'wrangler.toml'), contents, 'utf8');
}

async function prompt(question, fallback = '') {
  if (!process.stdin.isTTY) return fallback;
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim() || fallback;
}

async function confirm(question) {
  if (!process.stdin.isTTY) return false;
  const answer = await prompt(`${question} (y/n) `);
  return /^y(es)?$/i.test(answer);
}

/* ------------------------------------------------------------------ steps */

function ensureAuthenticated() {
  log('Checking Cloudflare authentication…');
  let out = '';
  try {
    out = wrangler(['whoami']);
  } catch (error) {
    log('\n✖ Not signed in to Cloudflare.');
    log('  Run:  npx wrangler login');
    log('  (or set CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID)');
    process.exit(1);
  }
  const account = /Account Name\s*\|\s*(.+)/.exec(out)?.[1]?.trim();
  log(`  ✔ Signed in${account ? ` — ${account}` : ''}.`);
}

function ensureD1() {
  step(1, 7, 'Cloudflare D1 database');
  const listing = wrangler(['d1', 'list', '--json']);
  let databases = [];
  try {
    databases = JSON.parse(listing);
  } catch {
    databases = [];
  }

  let db = databases.find((d) => d.name === 'bronee_hrms');
  let created = false;

  if (!db) {
    log('  Creating bronee_hrms…');
    const out = wrangler(['d1', 'create', 'bronee_hrms']);
    const uuid = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(out)?.[1];
    if (!uuid) {
      log('  ✖ Could not read the new database id — paste it into wrangler.toml manually.');
      process.exit(1);
    }
    db = { uuid };
    created = true;
  }

  const toml = readWranglerToml();
  const updated = toml.replace(
    /(database_id\s*=\s*")[^"]*(")/,
    `$1${db.uuid}$2`,
  );
  if (updated !== toml) writeWranglerToml(updated);
  log(`  ✔ bronee_hrms → ${db.uuid}${created ? ' (created)' : ''}`);
  return db.uuid;
}

function ensureR2() {
  step(2, 7, 'Cloudflare R2 bucket');
  const listing = wranglerOrNull(['r2', 'bucket', 'list', '--json']) ?? '';
  if (listing.includes('bronee-files')) {
    log('  ✔ bronee-files already exists.');
    return;
  }
  log('  Creating bronee-files…');
  wrangler(['r2', 'bucket', 'create', 'bronee-files']);
  log('  ✔ bronee-files created.');
}

function applyMigrations() {
  step(3, 7, 'Database migrations + reference data');
  wrangler(['d1', 'migrations', 'apply', 'bronee_hrms', '--remote']);
  wrangler(['d1', 'execute', 'bronee_hrms', '--remote', '--file', './scripts/seed.sql']);
  log('  ✔ Schema applied, departments / shifts / designations seeded.');
}

async function configureSecrets() {
  step(4, 7, 'Worker secrets');

  const hasSecret = wranglerOrNull(['secret', 'list']) ?? '';
  const existing = new Set(
    hasSecret
      .split('\n')
      .map((line) => line.trim().split(/\s+/)[0])
      .filter((name) => name && name !== 'name'),
  );

  if (!existing.has('SESSION_SECRET')) {
    const secret = await prompt(
      '  SESSION_SECRET (leave blank to auto-generate a strong one): ',
    );
    const value =
      secret || Buffer.from(`${Date.now()}${Math.random()}${crypto.randomUUID()}`).toString('base64url').slice(0, 64);
    const tmp = path.join(apiDir, '.secret.tmp');
    writeFileSync(tmp, value, 'utf8');
    wrangler(['secret', 'put', 'SESSION_SECRET', '--name', 'bronee_hrms-api'], {
      input: readFileSync(tmp),
    });
    log('  ✔ SESSION_SECRET set.');
  } else {
    log('  ✔ SESSION_SECRET already set.');
  }

  if (!existing.has('RESEND_API_KEY')) {
    const key = await prompt(
      '  RESEND_API_KEY (blank = email stays disabled; signup OTP will not be delivered): ',
    );
    if (key) {
      const tmp = path.join(apiDir, '.secret.tmp');
      writeFileSync(tmp, key, 'utf8');
      wrangler(['secret', 'put', 'RESEND_API_KEY', '--name', 'bronee-hrms-api'], {
        input: readFileSync(tmp),
      });
      log('  ✔ RESEND_API_KEY set.');
    } else {
      log('  ⚠ RESEND_API_KEY skipped — employees will not be able to complete signup.');
    }
  } else {
    log('  ✔ RESEND_API_KEY already set.');
  }
}

function pointAppUrl() {
  step(5, 7, 'Worker configuration');
  const toml = readWranglerToml();
  const updated = toml.replace(/APP_URL\s*=\s*"[^"]*"/, `APP_URL = "${PAGES_URL}"`);
  if (updated !== toml) {
    writeWranglerToml(updated);
    log(`  ✔ APP_URL → ${PAGES_URL}`);
  } else {
    log(`  ✔ APP_URL already ${PAGES_URL}`);
  }
}

function deployWorker() {
  step(6, 7, 'Worker API');
  wrangler(['deploy']);
  log('  ✔ Worker deployed.');
}

function deployPages() {
  step(7, 7, 'Pages site');
  log('  Building the web client…');
  run('npm', ['run', 'build', '-w', '@bronee/web'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const dist = path.join(webDir, 'dist');
  if (!existsSync(path.join(dist, 'index.html'))) {
    log('  ✖ Build output missing — aborting Pages deploy.');
    process.exit(1);
  }

  try {
    wrangler(['pages', 'deploy', dist, '--project-name', PAGES_PROJECT], { cwd: root });
    log(`  ✔ Pages deployed → ${PAGES_URL}`);
  } catch (error) {
    const message = String(error?.stderr ?? error?.message ?? '');
    if (message.includes('project') && message.includes('not found')) {
      log(`  ⚠ The Pages project "${PAGES_PROJECT}" was not found in this account.`);
      log(`    Create it once at https://dash.cloudflare.com/pages then re-run: npm run deploy`);
    } else {
      log('  ✖ Pages deploy failed:');
      log(message.slice(0, 800));
    }
  }
}

/* ------------------------------------------------------------------- main */

const ALL_STEPS = {
  d1: ensureD1,
  r2: ensureR2,
  migrate: applyMigrations,
  secrets: configureSecrets,
  config: pointAppUrl,
  worker: deployWorker,
  pages: deployPages,
};

async function main() {
  if (args.includes('--help') || args.includes('-h')) {
    log(`
BRONEE HRMS deployment

  npm run deploy              full deployment
  npm run deploy -- d1        create the D1 database
  npm run deploy -- r2        create the R2 bucket
  npm run deploy -- migrate   apply migrations + seed data
  npm run deploy -- secrets   set SESSION_SECRET / RESEND_API_KEY
  npm run deploy -- worker    deploy the Worker API only
  npm run deploy -- pages     build + publish the Pages site only
`);
    return;
  }

  log('BRONEE HRMS deployment');
  log('='.repeat(52));
  ensureAuthenticated();

  if (only && ALL_STEPS[only]) {
    await ALL_STEPS[only]();
    return;
  }

  ensureD1();
  ensureR2();
  applyMigrations();
  await configureSecrets();
  pointAppUrl();
  deployWorker();
  deployPages();

  log('\n' + '='.repeat(52));
  log('✔ Deployment complete');
  log(`  Web   ${PAGES_URL}`);
  log(`  API   https://${WORKER_NAME}.workers.dev`);
  log('\nNext:');
  log('  1. Open Company Settings → Office Network and enter the real');
  log('     office GPS coordinates and public IP.');
  log('  2. Create the first Super Admin (see README).');
  log('  3. Test the signup flow on a real phone.');
}

main().catch((error) => {
  log(`\n✖ Deployment failed: ${error?.message ?? error}`);
  process.exit(1);
});
