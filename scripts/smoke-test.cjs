/**
 * End-to-end smoke test against a locally running Worker.
 * Exercises: health, login, session, reference data, signup, and the
 * employee + HR dashboards.
 */
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8787';

let cookie = '';
let passed = 0;
let failed = 0;

async function call(method, path, body, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (cookie) headers.Cookie = cookie;
  if (body && !options.raw) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: options.raw ? body : body ? JSON.stringify(body) : undefined,
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

async function section(title, fn) {
  console.log(`\n${title}`);
  try {
    await fn();
  } catch (error) {
    failed += 1;
    console.log(`  FAIL  ${title} threw — ${error.message}`);
  }
}

(async () => {
  await section('Health', async () => {
    const res = await call('GET', '/api/health');
    check('GET /api/health returns 200', res.status === 200, `status ${res.status}`);
    check('health payload has a service name', res.json?.data?.service === 'bronee-hrms-api');
  });

  await section('Login', async () => {
    const bad = await call('POST', '/api/auth/login', {
      email: 'hr@bronee.com',
      password: 'wrong-password',
    });
    check('wrong password is rejected', bad.status === 401, `status ${bad.status}`);

    const missing = await call('POST', '/api/auth/login', {
      email: 'nobody@bronee.com',
      password: 'whatever',
    });
    check(
      'unregistered email returns the signup message',
      String(missing.json?.error?.message ?? '').includes('Not a registered employee'),
      missing.json?.error?.message,
    );

    const res = await call('POST', '/api/auth/login', {
      email: 'hr@bronee.com',
      password: 'Bronee#2026',
    });
    check('valid login returns 200', res.status === 200, `status ${res.status}`);
    check('login returns the user profile', Boolean(res.json?.data?.user?.email));
    check('login sets a session cookie', cookie.includes('bronee_session'), cookie);
  });

  await section('Session', async () => {
    const me = await call('GET', '/api/auth/me');
    check('GET /api/auth/me returns the profile', me.status === 200 && me.json?.data?.user?.email === 'hr@bronee.com');
    check('permissions are attached', Array.isArray(me.json?.data?.permissions) && me.json.data.permissions.length > 0);
    check('super admin has the protected-order permission',
      me.json?.data?.permissions?.includes('admin.protected.department.order'));
  });

  await section('Reference data', async () => {
    const dept = await call('GET', '/api/meta/departments');
    const names = (dept.json?.data?.items ?? []).map((d) => d.name);
    check('ten seeded departments exist', names.length === 10, `got ${names.length}`);
    check('Sales Team is a parent department', (dept.json?.data?.items ?? []).some((d) => d.name === 'Sales Team' && d.type === 'parent'));
    check('Courier Team is a sub-department', (dept.json?.data?.items ?? []).some((d) => d.name === 'Courier Team' && d.parentId));

    const shifts = await call('GET', '/api/meta/shifts');
    const shiftCodes = (shifts.json?.data?.items ?? []).map((s) => s.code);
    check('all five shifts are present',
      ['MORNING', 'E1', 'E2', 'LE', 'SS'].every((c) => shiftCodes.includes(c)),
      shiftCodes.join(','));
    const split = (shifts.json?.data?.items ?? []).find((s) => s.code === 'SS');
    check('split shift has two segments', (split?.segments ?? []).length === 2);
  });

  await section('HR dashboard', async () => {
    const res = await call('GET', '/api/hr/dashboard');
    check('GET /api/hr/dashboard returns 200', res.status === 200, `status ${res.status}`);
    check('kpi totalEmployees is a number', typeof res.json?.data?.kpi?.totalEmployees === 'number');
    check('leave distribution is an array', Array.isArray(res.json?.data?.leaveTypeDistribution));
  });

  await section('Protected ordering', async () => {
    const list = await call('GET', '/api/hr/departments');
    const ceo = (list.json?.data?.items ?? []).find((d) => d.name === 'CEO');
    check('CEO is marked protected', ceo?.type === 'protected');
    const res = await call('PATCH', '/api/hr/departments/' + ceo.id, { displayOrder: 1 });
    check('super admin may reorder a protected department', res.status === 200, `status ${res.status}`);
    // restore
    await call('PATCH', '/api/hr/departments/' + ceo.id, { displayOrder: 6 });
  });

  await section('Employee dashboard', async () => {
    const res = await call('GET', '/api/dashboard/employee');
    check('GET /api/dashboard/employee returns 200', res.status === 200, `status ${res.status}`);
    check('dashboard carries a profile', Boolean(res.json?.data?.profile?.email));
    check('dashboard has month + quick blocks',
      Boolean(res.json?.data?.month) && Boolean(res.json?.data?.quick));
  });

  await section('Attendance', async () => {
    const status = await call('GET', '/api/attendance/status');
    check('GET /api/attendance/status returns 200', status.status === 200);

    const in1 = await call('POST', '/api/attendance/clock-in', {
      latitude: null,
      longitude: null,
      accuracyMeters: null,
      source: 'web',
    });
    // No shift published -> a friendly error rather than a crash.
    check('clock-in without a published roster is handled', in1.status === 400 || in1.status === 409, `status ${in1.status}`);
  });

  await section('Signup request', async () => {
    const otp = await call('POST', '/api/auth/signup/request-otp', {
      email: 'new.joiner@gmail.com',
      purpose: 'signup',
    });
    check('OTP request is accepted', otp.status === 200, `status ${otp.status}`);
    check('the OTP code is never echoed back', otp.json?.data?.code === undefined);
  });

  await section('Authorization', async () => {
    const saved = cookie;
    cookie = '';
    const res = await call('GET', '/api/dashboard/employee');
    check('protected endpoints reject anonymous callers', res.status === 401, `status ${res.status}`);
    cookie = saved;
  });

  await section('Audit trail', async () => {
    const res = await call('GET', '/api/hr/system/audit');
    check('audit log returns entries', Array.isArray(res.json?.data?.items));
    check('the department edit was audited',
      (res.json?.data?.items ?? []).some((a) => a.action === 'department.updated'));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
