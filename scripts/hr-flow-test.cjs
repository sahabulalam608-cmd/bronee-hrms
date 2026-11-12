/**
 * HR workflow smoke test.
 * Covers signup approval, roster build + publish, attendance review,
 * leave / overtime approval, payroll, announcements and department rules.
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
  console.log('HR workflow');

  const login = await call('POST', '/api/auth/login', {
    email: 'hr@bronee.com',
    password: 'Bronee#2026',
  });
  check('HR can sign in', login.status === 200, `status ${login.status}`);
  if (login.status !== 200) {
    console.log(JSON.stringify(login.json));
    process.exit(1);
  }

  // ------------------------------------------------------- departments
  const deptList = await call('GET', '/api/hr/departments');
  const salesTeam = (deptList.json?.data?.items ?? []).find((d) => d.name === 'Sales Team');
  check('Sales Team is a parent department', salesTeam?.type === 'parent');
  check('sub-departments are nested under Sales Team',
    (deptList.json?.data?.tree ?? []).some((d) => d.children?.length === 4));

  const newDept = await call('POST', '/api/hr/departments', {
    name: 'Quality Assurance',
    type: 'regular',
    displayOrder: 7,
  });
  check('a department can be created', newDept.status === 200, `status ${newDept.status}`);

  const hr = (deptList.json?.data?.items ?? []).find((d) => d.name === 'HR');
  const reorder = await call('PATCH', `/api/hr/departments/${hr.id}`, { displayOrder: 6 });
  check('a super admin may reorder a protected department', reorder.status === 200, `status ${reorder.status}`);
  await call('PATCH', `/api/hr/departments/${hr.id}`, { displayOrder: 5 });

  const deleteWithStaff = await call('DELETE', `/api/hr/departments/${salesTeam.id}`);
  check('a department with employees cannot be deleted', deleteWithStaff.status === 409, `status ${deleteWithStaff.status}`);

  const deactivate = await call('PATCH', `/api/hr/departments/${newDept.json?.data?.department?.id}`, { isActive: false });
  check('a department can be deactivated', deactivate.status === 200, `status ${deactivate.status}`);

  // ------------------------------------------------------------- shifts
  const shiftList = await call('GET', '/api/hr/shifts');
  check('all five shifts are managed', (shiftList.json?.data?.items ?? []).length === 5);

  // ------------------------------------------------------------ roster
  const rosterList = await call('GET', '/api/hr/roster');
  check('rosters are listed', Array.isArray(rosterList.json?.data?.items));

  const ordered = await call('GET', '/api/hr/roster/employees/ordered');
  check('employees are returned in roster order', (ordered.json?.data?.items ?? []).length >= 1);

  const employees = ordered.json?.data?.items ?? [];
  const employee = employees[0];
  const start = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);

  const created = await call('POST', '/api/hr/roster', {
    name: 'Next week roster',
    startDate: start,
    endDate: end,
    entries: [
      { employeeId: employee.id, date: start, shiftId: 'shift-morning', isOff: false },
      { employeeId: employee.id, date: end, shiftId: null, isOff: true },
    ],
  });
  check('a roster can be created', created.status === 200, `status ${created.status} ${JSON.stringify(created.json?.error ?? '')}`);
  const rosterId = created.json?.data?.roster?.id;

  const preview = await call('GET', `/api/hr/roster/${rosterId}`);
  check('the roster preview loads', preview.status === 200);
  check('the preview carries conflicts', Array.isArray(preview.json?.data?.conflicts));

  const published = await call('POST', `/api/hr/roster/${rosterId}/publish`, { publishMode: 'now' });
  check('the roster can be published', published.status === 200, `status ${published.status}`);
  check('publishing reports the affected employees', typeof published.json?.data?.changedEmployees === 'number');

  const history = await call('GET', `/api/hr/roster/${rosterId}/history`);
  check('the roster change history is recorded', Array.isArray(history.json?.data?.items));

  const scheduled = await call('POST', '/api/hr/roster', {
    name: 'Scheduled roster',
    startDate: start,
    endDate: end,
    entries: [{ employeeId: employee.id, date: start, shiftId: 'shift-e1', isOff: false }],
  });
  const scheduleResult = await call('POST', `/api/hr/roster/${scheduled.json?.data?.roster?.id}/publish`, {
    publishMode: 'schedule',
    scheduledFor: '2030-01-01T09:00:00.000Z',
  });
  check('a roster can be scheduled', scheduleResult.status === 200, `status ${scheduleResult.status}`);
  check('the scheduled roster is marked scheduled', scheduleResult.json?.data?.status === 'scheduled');

  // -------------------------------------------------------- attendance
  const attendance = await call('GET', '/api/hr/attendance');
  check('attendance for today loads', attendance.status === 200);
  const records = attendance.json?.data?.items ?? [];
  check('attendance records are returned', records.length >= 1, `${records.length}`);

  const record = records.find((r) => r.reviewStatus === 'pending') ?? records[0];
  if (record) {
    const detail = await call('GET', `/api/hr/attendance/${record.id}`);
    check('the attendance record detail loads', detail.status === 200);
    check('the record carries verification details', detail.json?.data?.record?.verificationMethod !== undefined);

    const review = await call('POST', `/api/hr/attendance/${record.id}/review`, {
      action: 'excuse_late',
      note: 'Approved by the reporting manager.',
    });
    check('HR can finalise an attendance record', review.status === 200, `status ${review.status}`);
    check('the late status is updated', review.json?.data?.record?.lateStatus === 'excused');

    const after = await call('GET', `/api/hr/attendance/${record.id}`);
    check('the exception is stored in the history',
      (after.json?.data?.record?.exceptionHistory ?? []).length > 0);
  }

  const network = await call('GET', '/api/hr/attendance/office-network');
  check('the office network settings load', network.status === 200);
  check('the geofence radius is exposed', network.json?.data?.geofenceMeters === 50);

  // ------------------------------------------------------------- leave
  const leaveList = await call('GET', '/api/hr/requests/leave?status=pending');
  check('pending leave requests load', leaveList.status === 200);
  const leave = (leaveList.json?.data?.items ?? [])[0];
  if (leave) {
    const approve = await call('POST', `/api/hr/requests/leave/${leave.id}/review`, {
      decision: 'approve',
      note: 'Approved. Enjoy the break.',
    });
    check('HR can approve a leave request', approve.status === 200, `status ${approve.status}`);
    check('the leave status is updated', approve.json?.data?.request?.status === 'approved');
  }

  // ---------------------------------------------------------- overtime
  const overtimeList = await call('GET', '/api/hr/requests/overtime?status=pending');
  check('pending overtime requests load', overtimeList.status === 200);
  const overtime = (overtimeList.json?.data?.items ?? [])[0];
  if (overtime) {
    const approve = await call('POST', `/api/hr/requests/overtime/${overtime.id}/review`, {
      decision: 'approve',
      approvedStart: overtime.requestedStart,
      approvedEnd: overtime.requestedEnd,
      note: 'Approved.',
    });
    check('HR can approve overtime', approve.status === 200, `status ${approve.status}`);
    check('the approved hours are stored', approve.json?.data?.request?.approvedHours === 2.5,
      String(approve.json?.data?.request?.approvedHours));
  }

  // ------------------------------------------------------------ tasks
  const newTask = await call('POST', '/api/hr/tasks', {
    name: 'Reconcile the courier handover sheet',
    description: 'Match the courier handover log against the delivery report.',
    priority: 'urgent',
    assignedEmployeeId: employee.id,
    dueDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
  });
  check('HR can create a task', newTask.status === 200, `status ${newTask.status}`);
  check('a task code is generated', /^BRN-TASK-\d+$/.test(newTask.json?.data?.task?.taskCode ?? ''),
    newTask.json?.data?.task?.taskCode);

  const taskList = await call('GET', '/api/hr/tasks');
  check('the task dashboard loads', taskList.status === 200);
  check('the task summary is present', typeof taskList.json?.data?.summary?.total === 'number');
  check('the priority summary is present', Array.isArray(taskList.json?.data?.prioritySummary));

  const submissions = await call('GET', '/api/hr/tasks/submissions/pending');
  check('pending submissions load', submissions.status === 200);

  // ---------------------------------------------------------- payroll
  const year = new Date().getUTCFullYear();
  const month = new Date().getUTCMonth() + 1;
  const bonus = await call('POST', '/api/hr/compensation/bonus/calculate', { year, month });
  check('the attendance bonus can be calculated', bonus.status === 200, `status ${bonus.status}`);

  const bonusList = await call('GET', `/api/hr/compensation/bonus?year=${year}&month=${month}`);
  check('the bonus snapshot loads', bonusList.status === 200);
  check('the bonus policy ladder is returned', (bonusList.json?.data?.policy ?? []).length === 4);

  const generate = await call('POST', '/api/hr/compensation/payroll/generate', { year, month });
  check('the payroll run can be generated', generate.status === 200, `status ${generate.status}`);

  const payroll = await call('GET', `/api/hr/compensation/payroll?year=${year}&month=${month}`);
  check('the payroll run loads', payroll.status === 200);
  check('payroll totals are returned', typeof payroll.json?.data?.totals?.netPayable === 'number');

  const publish = await call('POST', '/api/hr/compensation/payroll/publish', { year, month });
  check('the payroll run can be published', publish.status === 200, `status ${publish.status}`);

  const editPublished = await call('PATCH', '/api/hr/compensation/payroll/xyz', { basicSalary: 1 });
  check('an unknown payroll record is rejected', editPublished.status === 404, `status ${editPublished.status}`);

  // ----------------------------------------------------- announcements
  const announcement = await call('POST', '/api/hr/comms', {
    title: 'Annual maintenance window',
    body: 'The office will be closed on Friday for scheduled maintenance.',
    type: 'announcement',
    targetType: 'all',
    targetIds: [],
    publishMode: 'now',
    emailNotification: false,
  });
  check('an announcement can be published', announcement.status === 200, `status ${announcement.status}`);
  check('the audience is resolved', announcement.json?.data?.recipients >= 1);

  const message = await call('POST', `/api/hr/comms/message/${employee.id}`, {
    title: 'Please confirm your roster',
    body: 'Confirm that you have seen your roster for next week.',
  });
  check('an individual message can be sent', message.status === 200, `status ${message.status}`);

  const deptNotice = await call('POST', '/api/hr/comms', {
    title: 'Sales Team briefing',
    body: 'The Sales Team briefing is scheduled for Monday morning.',
    type: 'announcement',
    targetType: 'department',
    targetIds: ['dep-sales-team'],
    publishMode: 'now',
    emailNotification: false,
  });
  check('a department-targeted notice resolves its audience', deptNotice.status === 200, `status ${deptNotice.status} ${JSON.stringify(deptNotice.json?.error ?? '')}`);
  check('the department audience reaches the team', (deptNotice.json?.data?.recipients ?? 0) >= 1);

  const subDeptNotice = await call('POST', '/api/hr/comms', {
    title: 'Courier Team handover',
    body: 'The courier handover process changes from next week.',
    type: 'announcement',
    targetType: 'sub_department',
    targetIds: ['dep-courier-team'],
    publishMode: 'now',
    emailNotification: false,
  });
  check('a sub-department-targeted notice resolves', subDeptNotice.status === 200, `status ${subDeptNotice.status}`);

  const announcements = await call('GET', '/api/hr/comms');
  check('announcements are listed', (announcements.json?.data?.items ?? []).length >= 2);

  // ------------------------------------------------------------ sheets
  const sheets = await call('GET', '/api/hr/sheets/status');
  check('the sheets status loads', sheets.status === 200);
  check('the task spreadsheet is linked',
    sheets.json?.data?.sheets?.taskManagement?.url?.includes('docs.google.com'));
  check('the main spreadsheet is linked',
    sheets.json?.data?.sheets?.mainHrms?.url?.includes('docs.google.com'));

  const sync = await call('POST', '/api/hr/sheets/sync', { sheet: 'task' });
  check('a sheets export can be triggered', sync.status === 200, `status ${sync.status}`);

  // ----------------------------------------------------------- reports
  const report = await call('GET', `/api/hr/system/reports/attendance?year=${year}&month=${month}`);
  check('the attendance report downloads', report.status === 200);
  check('the report is CSV', String(report.json).startsWith('Date,'));

  const tasksReport = await call('GET', '/api/hr/system/reports/tasks');
  check('the task report downloads', tasksReport.status === 200);
  check('the task report has the expected columns',
    String(tasksReport.json).split('\n')[0].includes('Task ID') &&
    String(tasksReport.json).split('\n')[0].includes('Reference Link'));

  // ----------------------------------------------------------- audit
  const audit = await call('GET', '/api/hr/system/audit');
  check('the audit log loads', audit.status === 200);
  const actions = (audit.json?.data?.items ?? []).map((a) => a.action);
  check('roster publishing is audited', actions.includes('roster.published'));
  check('leave approval is audited', actions.includes('leave.approve'));
  check('payroll publishing is audited', actions.includes('payroll.published'));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
