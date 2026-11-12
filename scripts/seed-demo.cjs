/**
 * Seeds a small but complete demo dataset into the local D1 database so the
 * employee workflow can be exercised end to end:
 *
 *   - an employee (AR-0001)
 *   - a published roster covering today
 *   - the office IP allow-list (so office verification succeeds locally)
 *   - a task, a published payslip and a notification
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const apiDir = path.join(__dirname, '..', 'packages', 'api');
const wranglerBin = path.join(__dirname, '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js');

function wrangler(args, opts = {}) {
  return execFileSync(
    process.execPath,
    [wranglerBin, ...args],
    { cwd: apiDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts },
  );
}

function sql(query) {
  const out = wrangler(['d1', 'execute', 'bronee_hrms', '--local', '--command', query]);
  return out;
}

/** Wrangler prints a banner before its JSON payload — extract just the JSON. */
function parseWranglerJson(output) {
  const start = output.indexOf('[');
  if (start < 0) throw new Error(`Unexpected wrangler output:\n${output}`);
  return JSON.parse(output.slice(start));
}

const today = new Date();
const dateKey = today.toISOString().slice(0, 10);
const nowIso = new Date().toISOString();

const employeeId = 'seed-emp-0001';
const rosterId = 'seed-roster-0001';

console.log('Seeding demo data for', dateKey);

// 1. Employee (password hash is produced by the same routine the Worker uses).
const esbuild = require('esbuild');
const tmp = path.join(require('node:os').tmpdir(), 'seed-admin.mjs');
esbuild.buildSync({
  entryPoints: [path.join(apiDir, 'scripts', 'seed-admin.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: tmp,
  logLevel: 'error',
});
const adminSql = execFileSync(
  process.execPath,
  [
    tmp,
    '--email', 'arif@bronee.com',
    '--password', 'Bronee#2026',
    '--name', 'Arif Hossain',
    '--role', 'employee',
    '--code', 'AR-0001',
    '--department', 'dep-sales-team',
    '--designation', 'Officer',
    '--mobile', '01700000001',
  ],
  { encoding: 'utf8' },
);
const fs = require('node:fs');
const adminSqlFile = path.join(require('node:os').tmpdir(), 'seed-employee.sql');
fs.writeFileSync(adminSqlFile, adminSql, 'utf8');
// The seed uses a random id — grab it and align the roster entry.
// Reuse the existing demo employee when it already exists, so repeated
// seeding keeps the attendance, task and payroll history intact.
const existingRows = parseWranglerJson(
  wrangler(['d1', 'execute', 'bronee_hrms', '--local', '--command',
    "SELECT id FROM users WHERE email = 'arif@bronee.com';"]),
);
const existing = existingRows?.[0]?.results?.[0]?.id;

const adminId =
  existing ??
  /VALUES \(\s*'([^']+)'/.exec(adminSql)?.[1];

if (!existing) {
  wrangler(['d1', 'execute', 'bronee_hrms', '--local', '--file', adminSqlFile]);
}

console.log('employee id:', adminId);

// 2. Published roster for today with the morning shift.
const shiftId = 'shift-morning';
sql(`
  INSERT OR IGNORE INTO rosters (id, name, start_date, end_date, version, status, published_at, created_at, updated_at)
  VALUES ('${rosterId}', 'Demo week', '${dateKey}', '${dateKey}', 1, 'published', '${nowIso}', '${nowIso}', '${nowIso}');

  INSERT OR REPLACE INTO roster_entries (id, roster_id, employee_id, date, shift_id, is_off, updated_by, created_at, updated_at)
  VALUES ('seed-entry-0001', '${rosterId}', '${adminId}', '${dateKey}', '${shiftId}', 0, NULL, '${nowIso}', '${nowIso}');

  UPDATE users SET sub_department_id = 'dep-courier-team' WHERE id = '${adminId}';
`);

// 3. Office IP allow-list — 127.0.0.1 lets the local smoke test verify by IP.
sql(`
  INSERT INTO company_settings (key, value, updated_by, updated_at)
  VALUES ('office.ip.allowlist', '["127.0.0.1","::1"]', NULL, '${nowIso}')
  ON CONFLICT(key) DO UPDATE SET value = '["127.0.0.1","::1"]', updated_at = '${nowIso}';
`);

// 4. A task, a payslip and a notification for the employee.
sql(`
  INSERT OR REPLACE INTO tasks (id, task_code, name, description, department_id, assigned_employee_id, reviewer_id, priority, assigned_date, start_date, due_date, status, created_by, created_at, updated_at)
  VALUES ('seed-task-0001', 'BRN-TASK-0001', 'Prepare the weekly sales report',
          'Compile the weekly sales numbers and share them with the team.',
          'dep-sales-team', '${adminId}', NULL, 'high', '${dateKey}', '${dateKey}', '${dateKey}', 'in_progress', NULL, '${nowIso}', '${nowIso}');

  INSERT OR REPLACE INTO payroll_records (id, employee_id, year, month, basic_salary, allowances, overtime_amount, bonus_amount, deductions, net_payable, working_days, present_days, late_days, status, published_at, created_at, updated_at)
  VALUES ('seed-payroll-0001', '${adminId}', ${today.getUTCFullYear()}, ${today.getUTCMonth() + 1},
          30000, 5000, 1200, 1500, 0, 37700, 22, 20, 1, 'published', '${nowIso}', '${nowIso}', '${nowIso}');

  INSERT OR REPLACE INTO notifications (id, employee_id, type, title, body, link, email_sent, email_status, published_at, created_by)
  VALUES ('seed-notification-0001', '${adminId}', 'announcement', 'Office closed on Friday',
          'BRONEE Limited will remain closed next Friday for the annual maintenance window.',
          '/app/notifications', 0, 'not_required', '${nowIso}', NULL);

  INSERT OR REPLACE INTO leave_balances (id, employee_id, year, leave_type, entitled, used, created_at, updated_at)
  VALUES ('seed-balance-0001', '${adminId}', ${today.getUTCFullYear()}, 'casual', 12, 3, '${nowIso}', '${nowIso}');
`);

console.log('Demo data seeded.');
