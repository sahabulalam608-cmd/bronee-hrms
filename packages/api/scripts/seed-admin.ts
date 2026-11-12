/**
 * Create the first HR / Super Admin account.
 *
 * Usage:
 *   npm run seed:admin -w @bronee/api -- --email hr@bronee.com --password "..." --name "HR Admin"
 *
 * The password is hashed with the exact same PBKDF2 routine the Worker uses,
 * so the account can sign in immediately.
 */
import { randomId, hashPassword } from '../src/lib/crypto.js';

function arg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

async function main() {
  const email = (arg('email', 'hr@bronee.com') ?? 'hr@bronee.com').toLowerCase();
  const password = arg('password');
  const fullName = arg('name', 'BRONEE HR Admin') ?? 'BRONEE HR Admin';
  const role = (arg('role', 'super_admin') ?? 'super_admin').toLowerCase();
  const roleColumn = ['employee', 'hr', 'super_admin'].includes(role) ? role : 'super_admin';
  const employeeCode = (arg('code', 'BRN-HR-0001') ?? 'BRN-HR-0001').toUpperCase();
  const mobile = (arg('mobile', '01700000000') ?? '01700000000').replace(/'/g, "''");
  const departmentId = arg('department', 'dep-hr') ?? 'dep-hr';
  const designation = arg('designation', 'Administrator') ?? 'Administrator';

  if (!password || password.length < 8) {
    console.error('A password of at least 8 characters is required.');
    process.exit(1);
  }

  const { hash, salt } = await hashPassword(password);
  const id = randomId();
  const now = new Date().toISOString();

  const sql = `INSERT OR REPLACE INTO users
  (id, email, password_hash, password_salt, role, status, full_name, mobile, employee_code, designation_label, department_id, joining_date, must_change_password, created_at, updated_at)
VALUES (
  '${id}',
  '${email}',
  '${hash}',
  '${salt}',
  '${roleColumn}',
  'active',
  '${fullName.replace(/'/g, "''")}',
  '${(arg('mobile', '01700000000') ?? '01700000000').replace(/'/g, "''")}',
  '${employeeCode}',
  '${designation}',
  '${departmentId}',
  '${now.slice(0, 10)}',
  1,
  '${now}',
  '${now}'
);`;

  console.log(sql);
}

main();
