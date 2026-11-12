-- BRONEE HRMS — reference data seed
-- Departments, sub-departments, shifts and designations.
-- Idempotent: safe to re-run.

PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------ departments
INSERT OR IGNORE INTO departments (id, name, type, parent_id, display_order, is_active) VALUES
  ('dep-supply-chain',    'Supply Chain',      'regular',  NULL,            1, 1),
  ('dep-digital-marketing','Digital Marketing','regular',  NULL,            2, 1),
  ('dep-accounts',        'Accounts',          'regular',  NULL,            3, 1),
  ('dep-sales-team',      'Sales Team',        'parent',   NULL,            4, 1),
  ('dep-direct-sales',    'Direct Sales',      'regular',  'dep-sales-team', 1, 1),
  ('dep-social-media',    'Social Media',      'regular',  'dep-sales-team', 2, 1),
  ('dep-retention-team',  'Retention Team',    'regular',  'dep-sales-team', 3, 1),
  ('dep-courier-team',    'Courier Team',      'regular',  'dep-sales-team', 4, 1),
  ('dep-hr',              'HR',                'protected', NULL,           5, 1),
  ('dep-ceo',             'CEO',               'protected', NULL,           6, 1);

-- ----------------------------------------------------------- designations
INSERT OR IGNORE INTO designations (id, name, display_order, is_active) VALUES
  ('des-executive-assistant', 'Executive Assistant', 1, 1),
  ('des-senior-executive',    'Senior Executive',    2, 1),
  ('des-executive',           'Executive',           3, 1),
  ('des-manager',             'Manager',             4, 1),
  ('des-senior-officer',      'Senior Officer',      5, 1),
  ('des-officer',             'Officer',             6, 1),
  ('des-executive-officer',   'Executive Officer',   7, 1),
  ('des-officer-in-charge',   'Officer In Charge',   8, 1),
  ('des-team-leader',         'Team Leader',         9, 1),
  ('des-senior-executive-officer','Senior Executive Officer', 10, 1);

-- ----------------------------------------------------------------- shifts
INSERT OR IGNORE INTO shifts
  (id, code, name, short_name, start_time, end_time, ends_next_day, location_policy, requires_office_verification, segments, display_order, is_active)
VALUES
  ('shift-morning', 'MORNING', 'Morning Shift',    'Morning',      '09:20', '18:00', 0, 'office', 1, NULL, 1, 1),
  ('shift-e1',      'E1',      'Evening Shift E1', 'Evening E1',   '13:00', '21:00', 0, 'office', 1, NULL, 2, 1),
  ('shift-e2',      'E2',      'Evening Shift E2', 'Evening E2',   '14:00', '22:00', 0, 'office', 1, NULL, 3, 1),
  ('shift-le',      'LE',      'Late Evening Shift','Late Evening','18:00', '01:00', 1, 'wfh',    0, NULL, 4, 1),
  ('shift-ss',      'SS',      'Split Shift',      'Split Shift',  '09:20', '01:00', 1, 'split',  1,
    '[{"key":"office","label":"Office Segment","startTime":"09:20","endTime":"18:00","requiresOfficeVerification":true},{"key":"home","label":"Home / WFH Segment","startTime":"18:00","endTime":"01:00","requiresOfficeVerification":false}]',
    5, 1);

-- ------------------------------------------------------- company settings
INSERT OR IGNORE INTO company_settings (key, value, updated_by, updated_at) VALUES
  ('company.name',        '"BRONEE Limited"',            NULL, CURRENT_TIMESTAMP),
  ('company.timezone',    '"Asia/Dhaka"',                NULL, CURRENT_TIMESTAMP),
  ('attendance.bonus.ladder','[{"maxLateDays":0,"amount":2000},{"maxLateDays":1,"amount":1500},{"maxLateDays":2,"amount":1000},{"maxLateDays":3,"amount":0}]', NULL, CURRENT_TIMESTAMP),
  ('office.ip.allowlist', '[]',                          NULL, CURRENT_TIMESTAMP),
  ('leave.types',         '[{"code":"casual","name":"Casual Leave","entitlement":12,"paid":true},{"code":"sick","name":"Sick Leave","entitlement":12,"paid":true},{"code":"earned","name":"Earned Leave","entitlement":14,"paid":true},{"code":"unpaid","name":"Unpaid Leave","entitlement":0,"paid":false}]', NULL, CURRENT_TIMESTAMP),
  ('notifications.email.types','["account_approved","leave_approved","overtime_approved","task_deadline_reminder","announcement","attendance_notice"]', NULL, CURRENT_TIMESTAMP);
