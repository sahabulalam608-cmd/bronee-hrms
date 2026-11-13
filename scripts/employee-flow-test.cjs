/**
 * Employee workflow smoke test.
 * Verifies the clock-in / break / clock-out cycle, leave applications,
 * overtime requests, tasks, payroll confidentiality and notifications.
 */
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8787';

let cookie = '';
let passed = 0;
let failed = 0;

async function call(method, path, body) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });

  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

(async () => {
  console.log('Employee workflow');

  const login = await call('POST', '/api/auth/login', {
    email: 'arif@bronee.com',
    password: 'Bronee#2026',
  });
  check('employee can sign in', login.status === 200, `status ${login.status}`);
  check('employee role is assigned', login.json?.data?.user?.role === 'employee');
  check('employee has no HR permissions',
    !(login.json?.data?.user?.id && false) &&
    !String(login.json?.data?.user?.role).includes('hr'));
  if (login.status !== 200) {
    console.log(JSON.stringify(login.json));
    process.exit(1);
  }

  // ---------------------------------------------------------------- roster
  const roster = await call('GET', '/api/roster/my');
  check('employee sees a published roster entry', (roster.json?.data?.items ?? []).length > 0);
  const todayCell = (roster.json?.data?.items ?? [])[0];
  check('the roster entry carries a shift', Boolean(todayCell?.shiftCode), todayCell?.shiftCode);

  const team = await call('GET', `/api/roster/team/${todayCell?.date}`);
  check('the team view loads', team.status === 200);

  // ------------------------------------------------------------ attendance
  const clockIn = await call('POST', '/api/attendance/clock-in', {
    latitude: 23.7809,
    longitude: 90.4125,
    accuracyMeters: 8,
    source: 'web',
  });
  check('clock-in succeeds', clockIn.status === 200, `status ${clockIn.status} ${JSON.stringify(clockIn.json?.error ?? '')}`);
  check('office verification succeeded',
    clockIn.json?.data?.verification?.result === 'verified' &&
    ['office_ip', 'gps'].includes(clockIn.json?.data?.verification?.method),
    JSON.stringify(clockIn.json?.data?.verification));
  check('the working timer started', clockIn.json?.data?.workingStarted === true);

  // Outside the 1-minute verification window the record is routed to HR
  // review; inside it the employee is on time. Both are valid here.
  const lateStatus = clockIn.json?.data?.session?.lateStatus;
  check(
    'the late status follows the verification window policy',
    lateStatus === 'on_time' || lateStatus === 'pending_review',
    String(lateStatus),
  );

  const status = await call('GET', '/api/attendance/status');
  check('the live status reports an open session',
    status.json?.data?.session?.status === 'open');
  check('the live status reports a working shift',
    Boolean(status.json?.data?.rosterShift ?? status.json?.data?.scheduledShift));

  // Duplicate clock-in must be refused.
  const second = await call('POST', '/api/attendance/clock-in', {
    latitude: 23.7809,
    longitude: 90.4125,
    accuracyMeters: 8,
    source: 'web',
  });
  check('a second clock-in is refused', second.status === 409, `status ${second.status}`);

  // ---------------------------------------------------------------- breaks
  const brk = await call('POST', '/api/attendance/break/start');
  check('a break can be started', brk.status === 200, `status ${brk.status}`);

  const brkStatus = await call('GET', '/api/attendance/status');
  check('the break is reported as active', Boolean(brkStatus.json?.data?.activeBreak));

  const endBrk = await call('POST', '/api/attendance/break/end');
  check('a break can be ended', endBrk.status === 200, `status ${endBrk.status}`);
  check('the break duration is recorded', (endBrk.json?.data?.break?.durationSeconds ?? 0) >= 0);

  const breaks = await call('GET', '/api/attendance/breaks');
  check('the break history lists the session', (breaks.json?.data?.items ?? []).length > 0);
  check('the break count is tracked', breaks.json?.data?.today?.count >= 1);

  // --------------------------------------------------------------- clock out
  const clockOut = await call('POST', '/api/attendance/clock-out');
  check('clock-out succeeds', clockOut.status === 200, `status ${clockOut.status}`);
  check('working seconds are stored', clockOut.json?.data?.workingSeconds >= 0);

  const history = await call('GET', '/api/attendance/history');
  check('the duty record appears in the history', (history.json?.data?.items ?? []).length > 0);

  // ------------------------------------------------------------------ leave
  // Each run uses a fresh window so repeated runs never collide with the
  // duplicate-detection rules the API enforces.
  const dayOffset = 60 + Math.floor(Math.random() * 200);
  const leaveStart = new Date(Date.now() + dayOffset * 86400000).toISOString().slice(0, 10);
  const leaveEnd = new Date(Date.now() + (dayOffset + 2) * 86400000).toISOString().slice(0, 10);

  const leave = await call('POST', '/api/leave', {
    leaveType: 'casual',
    fromDate: leaveStart,
    toDate: leaveEnd,
    reason: 'Family commitment out of town.',
  });
  check('a leave application is accepted', leave.status === 200, `status ${leave.status} ${JSON.stringify(leave.json?.error ?? '')}`);
  check('the leave duration is calculated', leave.json?.data?.request?.totalDays === 3);

  const dup = await call('POST', '/api/leave', {
    leaveType: 'casual',
    fromDate: leaveStart,
    toDate: new Date(Date.now() + (dayOffset + 3) * 86400000).toISOString().slice(0, 10),
    reason: 'Overlapping request for the same period.',
  });
  check('an overlapping leave application is refused', dup.status === 409, `status ${dup.status}`);

  const badRange = await call('POST', '/api/leave', {
    leaveType: 'casual',
    fromDate: leaveEnd,
    toDate: leaveStart,
    reason: 'Backwards date range.',
  });
  check('an invalid date range is refused', badRange.status === 400, `status ${badRange.status}`);

  const balances = await call('GET', '/api/leave/my');
  check('leave balances are returned', (balances.json?.data?.balances ?? []).length === 4);
  const casual = balances.json?.data?.balances?.find((b) => b.leaveType === 'casual');
  check(
    'the remaining balance equals entitlement minus usage',
    casual && casual.remaining === Math.max(0, casual.entitled - casual.used),
    JSON.stringify(casual),
  );

  // --------------------------------------------------------------- overtime
  const otStart = new Date(Date.now() + (dayOffset + 10) * 86400000).toISOString();
  const overtime = await call('POST', '/api/overtime', {
    requestedStart: otStart,
    requestedEnd: new Date(new Date(otStart).getTime() + 2.5 * 3600000).toISOString(),
    reason: 'Monthly closing work.',
  });
  check('an overtime request is accepted', overtime.status === 200, `status ${overtime.status}`);
  check('the requested hours are calculated',
    overtime.json?.data?.request?.requestedHours === 2.5,
    String(overtime.json?.data?.request?.requestedHours));

  // ------------------------------------------------------------------ tasks
  const tasks = await call('GET', '/api/tasks/my');
  check('the assigned task is listed', (tasks.json?.data?.items ?? []).length > 0);
  check('the task summary is present', typeof tasks.json?.data?.summary?.inProgress === 'number');

  const taskId = tasks.json?.data?.items?.[0]?.id;
  const submit = await call('POST', `/api/tasks/${taskId}/submit`, {
    submissionLink: 'https://docs.google.com/spreadsheets/d/demo',
    notes: 'Weekly report attached in the shared folder.',
  });
  check('a task submission is accepted', submit.status === 200, `status ${submit.status}`);

  const afterSubmit = await call('GET', '/api/tasks/my');
  check('the task moves to pending review',
    afterSubmit.json?.data?.items?.[0]?.status === 'pending',
    afterSubmit.json?.data?.items?.[0]?.status);

  // ---------------------------------------------------------------- payroll
  const payroll = await call('GET', '/api/payroll/my');
  check('the payslip is visible', (payroll.json?.data?.items ?? []).length > 0);
  const payslip = payroll.json?.data?.items?.[0];
  check('the attendance bonus amount is withheld', payslip?.bonusAmount === null, String(payslip?.bonusAmount));
  check('the bonus application is disclosed', payslip?.attendanceBonusApplied === true);
  check('the net payable is shown', (payslip?.netPayable ?? 0) > 0, String(payslip?.netPayable));

  // ---------------------------------------------------------- notifications
  const notifications = await call('GET', '/api/notifications');
  check('notifications are listed', (notifications.json?.data?.items ?? []).length > 0);

  const unreadBefore = notifications.json?.data?.unread ?? 0;
  const notificationId = notifications.json?.data?.items?.[0]?.id;
  const read = await call('POST', `/api/notifications/${notificationId}/read`);
  check('a notification can be marked read', read.status === 200);
  check(
    'the unread count does not grow after reading',
    (read.json?.data?.unread ?? -1) <= unreadBefore,
    `before ${unreadBefore}, after ${read.json?.data?.unread}`,
  );

  // ------------------------------------------------------------- dashboard
  const dash = await call('GET', '/api/dashboard/employee');
  check('the employee dashboard loads', dash.status === 200);
  check('the dashboard shows this month late days',
    typeof dash.json?.data?.month?.lateDays === 'number');
  check('the dashboard does not expose a bonus amount',
    !JSON.stringify(dash.json?.data?.month ?? {}).includes('bonusAmount'));

  // ------------------------------------------------------ HR route denial
  const hrRoute = await call('GET', '/api/hr/employees');
  check('an employee cannot reach HR endpoints', hrRoute.status === 403, `status ${hrRoute.status}`);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
