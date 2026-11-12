#!/usr/bin/env node
/**
 * Deploy the BRONEE HRMS Worker with its D1 database and R2 bucket.
 * Idempotent: existing resources are reused.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const apiDir = path.resolve('packages/api');
const repoRoot = path.resolve('.');
const WRANGLER_BIN = path.join(repoRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const ACCOUNT = 'ef65d314e159ffbaeb998b4f4552a221';
const DB_NAME = 'bronee_hrms';
const BUCKET = 'bronee-files';

const log = (m = '') => process.stdout.write(`${m}\n`);

function wrangler(args, opts = {}) {
  return execFileSync(process.execPath, [WRANGLER_BIN, ...args], {
    cwd: apiDir,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...opts,
  });
}

function tryWrangler(args) {
  try {
    return { ok: true, out: wrangler(args) };
  } catch (error) {
    return { ok: false, err: String(error?.stderr ?? error?.message ?? error) };
  }
}

function toml() {
  return readFileSync(path.join(apiDir, 'wrangler.toml'), 'utf8');
}
function writeToml(c) {
  writeFileSync(path.join(apiDir, 'wrangler.toml'), c, 'utf8');
}

/* ------------------------------------------------------------------- D1 */

log('=== D1 ===');
const listed = tryWrangler(['d1', 'list', '--json']);
let databases = [];
if (listed.ok) {
  try {
    databases = JSON.parse(listed.out.slice(listed.out.indexOf('[')));
  } catch {
    databases = [];
  }
}
let db = databases.find((d) => d.name === DB_NAME);

if (!db) {
  log(`  creating ${DB_NAME}…`);
  const created = wrangler(['d1', 'create', DB_NAME]);
  const uuid = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(created)?.[1];
  if (!uuid) {
    log('  ✖ could not read the new database id');
    process.exit(1);
  }
  db = { uuid };
  log(`  created ${uuid}`);
} else {
  log(`  ${DB_NAME} exists → ${db.uuid}`);
}

const current = toml();
const patched = current.replace(/(database_id\s*=\s*")[^"]*(")/, `$1${db.uuid}$2`);
if (patched !== current) {
  writeToml(patched);
  log('  ✔ wrangler.toml updated with the database id');
}

/* ------------------------------------------------------------------- R2 */

log('\n=== R2 ===');
const buckets = tryWrangler(['r2', 'bucket', 'list', '--json']);
const r2Enabled = buckets.ok;
const hasBucket = r2Enabled && buckets.out.includes(BUCKET);

if (!r2Enabled) {
  log('  ⚠ R2 is not activated on this account yet.');
  log('    Enable it once at https://dash.cloudflare.com → R2 → "Enable R2",');
  log('    then run: npm run deploy -- r2');
  log('    Deploying without the storage binding — file uploads will answer');
  log('    with a clear "storage not enabled" message until then.');
} else if (!hasBucket) {
  log(`  creating ${BUCKET}…`);
  const r = tryWrangler(['r2', 'bucket', 'create', BUCKET]);
  log(r.ok ? '  ✔ created' : `  ✖ ${r.err.slice(0, 300)}`);
} else {
  log(`  ${BUCKET} already exists`);
}

// Re-enable the binding as soon as the bucket is really there.
const tomlNow = toml();
const bindingCommented = tomlNow.includes('# [[r2_buckets]]');
if (!bindingCommented) {
  log('  ✔ storage binding already enabled');
} else {
  const bucketExists = tryWrangler(['r2', 'bucket', 'list', '--json']);
  if (bucketExists.ok && bucketExists.out.includes(BUCKET)) {
    writeToml(
      tomlNow
        .replace('# [[r2_buckets]]', '[[r2_buckets]]')
        .replace('# binding = "FILES"', 'binding = "FILES"')
        .replace('# bucket_name = "bronee-files"', 'bucket_name = "bronee-files"'),
    );
    log('  ✔ storage binding enabled in wrangler.toml');
  }
}

/* ------------------------------------------------------- APP_URL + secrets */

log('\n=== Worker configuration ===');
const t2 = toml();
const t3 = t2.replace(/APP_URL\s*=\s*"[^"]*"/, 'APP_URL = "https://bronee-hrms.pages.dev"');
if (t3 !== t2) {
  writeToml(t3);
  log('  ✔ APP_URL → https://bronee-hrms.pages.dev');
}

const secretList = tryWrangler(['secret', 'list']);
const existingSecrets = new Set(
  (secretList.ok ? secretList.out : '')
    .split('\n')
    .map((l) => l.trim().split(/\s+/)[0])
    .filter(Boolean),
);

if (!existingSecrets.has('SESSION_SECRET')) {
  const secret = Buffer.from(
    `${Date.now()}-${Math.random()}-${crypto.randomUUID()}-${crypto.randomUUID()}`,
  ).toString('base64url');
  const r = tryWrangler(['secret', 'put', 'SESSION_SECRET'], { input: secret });
  log(r.ok ? '  ✔ SESSION_SECRET set (generated)' : `  ✖ ${r.err.slice(0, 300)}`);
} else {
  log('  ✔ SESSION_SECRET already set');
}

if (!existingSecrets.has('RESEND_API_KEY')) {
  log('  ⚠ RESEND_API_KEY not set — signup OTP emails will not be delivered.');
  log('    Add it later with:  npx wrangler secret put RESEND_API_KEY');
}

/* ------------------------------------------------------ migrations + seed */

log('\n=== Database ===');
const mig = tryWrangler(['d1', 'migrations', 'apply', DB_NAME, '--remote']);
log(mig.ok ? '  ✔ migrations applied' : `  ✖ ${mig.err.slice(0, 500)}`);

const seed = tryWrangler(['d1', 'execute', DB_NAME, '--remote', '--file', './scripts/seed.sql']);
log(seed.ok ? '  ✔ reference data seeded' : `  ✖ ${seed.err.slice(0, 500)}`);

/* ---------------------------------------------------------------- deploy */

log('\n=== Worker deploy ===');
const dep = tryWrangler(['deploy']);
if (dep.ok) {
  const url = /https:\/\/[^\s]+\.workers\.dev/.exec(dep.out)?.[0];
  log(`  ✔ deployed${url ? ` → ${url}` : ''}`);
} else {
  log(`  ✖ deploy failed:\n${dep.err.slice(0, 1200)}`);
  process.exit(1);
}
