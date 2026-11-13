/**
 * Verifies the cross-origin session flow exactly as a browser performs it:
 * the Pages origin calls the Worker, the Worker answers with a
 * SameSite=None; Secure session cookie, and every later request carries it.
 */
const APP_ORIGIN = 'https://bronee-hrms.pages.dev';
const API = 'https://bronee-hrms-api.sahabulalam608.workers.dev/api';

let cookie = '';
let passed = 0;
let failed = 0;

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

(async () => {
  console.log('Cross-origin session flow (browser behaviour)');

  // 1. Login from the Pages origin.
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: APP_ORIGIN },
    body: JSON.stringify({ email: 'hr@bronee.com', password: 'Bronee#2026' }),
  });
  const setCookie = login.headers.get('set-cookie') ?? '';
  cookie = setCookie.split(';')[0];

  check('login returns 200', login.status === 200, `status ${login.status}`);
  check('CORS allows the Pages origin', login.headers.get('access-control-allow-origin') === APP_ORIGIN);
  check('CORS allows credentials', login.headers.get('access-control-allow-credentials') === 'true');
  check('cookie is HttpOnly', /HttpOnly/i.test(setCookie));
  check('cookie is Secure', /Secure/i.test(setCookie));
  check('cookie is SameSite=None (cross-site capable)', /SameSite=None/i.test(setCookie), setCookie.split(';').slice(-2).join(';'));

  // 2. A preflighted GET must be accepted too.
  const preflight = await fetch(`${API}/auth/me`, {
    method: 'OPTIONS',
    headers: {
      Origin: APP_ORIGIN,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  check('preflight is answered', preflight.status === 204 || preflight.status === 200, `status ${preflight.status}`);

  // 3. The session must now be accepted on a cross-origin request.
  const me = await fetch(`${API}/auth/me`, {
    headers: { Origin: APP_ORIGIN, Cookie: cookie },
  });
  check('session is accepted cross-origin', me.status === 200, `status ${me.status}`);
  const meBody = await me.json();
  check('the session resolves the user', meBody?.data?.user?.email === 'hr@bronee.com');

  // 4. And on a protected data route.
  const dash = await fetch(`${API}/hr/dashboard`, {
    headers: { Origin: APP_ORIGIN, Cookie: cookie },
  });
  check('protected HR route accepts the session', dash.status === 200, `status ${dash.status}`);

  // 5. An anonymous request must still be rejected.
  const anon = await fetch(`${API}/hr/dashboard`, { headers: { Origin: APP_ORIGIN } });
  check('anonymous requests are still rejected', anon.status === 401, `status ${anon.status}`);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
