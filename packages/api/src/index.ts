import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { ZodError } from 'zod';
import { cors } from './middleware/cors.js';
import { withContext } from './middleware/auth.js';
import { HttpError } from './lib/http.js';
import { authRoutes } from './routes/auth.js';
import { profileRoutes } from './routes/profile.js';
import { metaRoutes } from './routes/meta.js';
import { attendanceRoutes } from './routes/attendance.js';
import { rosterRoutes } from './routes/roster.js';
import { leaveRoutes } from './routes/leave.js';
import { overtimeRoutes } from './routes/overtime.js';
import { taskRoutes } from './routes/tasks.js';
import { payrollRoutes } from './routes/payroll.js';
import { notificationRoutes } from './routes/notifications.js';
import { fileRoutes } from './routes/files.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { hrPeopleRoutes } from './routes/hr/people.js';
import { hrDashboardRoutes } from './routes/hr/dashboard.js';
import { hrRosterRoutes } from './routes/hr/roster.js';
import { hrAttendanceRoutes } from './routes/hr/attendance.js';
import { hrRequestRoutes } from './routes/hr/requests.js';
import { hrCompensationRoutes } from './routes/hr/compensation.js';
import { hrTaskRoutes } from './routes/hr/tasks.js';
import { hrCommsRoutes } from './routes/hr/comms.js';
import { hrSheetsRoutes } from './routes/hr/sheets.js';
import { hrSystemRoutes } from './routes/hr/system.js';
import type { AppEnv } from './types.js';
const app = new Hono<AppEnv>();

app.use('*', logger());
app.use('*', secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    connectSrc: ["'self'", 'https://*.workers.dev', 'https://*.pages.dev'],
    imgSrc: ["'self'", 'data:', 'blob:'],
    styleSrc: ["'self'", "'unsafe-inline'"],
    scriptSrc: ["'self'"],
    frameAncestors: ["'none'"],
  },
}));
app.use('*', cors);
app.use('*', withContext);

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    data: { service: 'bronee-hrms-api', time: new Date().toISOString() },
  }),
);

/* ------------------------------------------------------------ employee */

app.route('/api/auth', authRoutes);
app.route('/api/profile', profileRoutes);
app.route('/api/meta', metaRoutes);
app.route('/api/dashboard', dashboardRoutes);
app.route('/api/attendance', attendanceRoutes);
app.route('/api/roster', rosterRoutes);
app.route('/api/leave', leaveRoutes);
app.route('/api/overtime', overtimeRoutes);
app.route('/api/tasks', taskRoutes);
app.route('/api/payroll', payrollRoutes);
app.route('/api/notifications', notificationRoutes);
app.route('/api/files', fileRoutes);

/* ----------------------------------------------------------------- hr */

app.route('/api/hr/dashboard', hrDashboardRoutes);
app.route('/api/hr/roster', hrRosterRoutes);
app.route('/api/hr/attendance', hrAttendanceRoutes);
app.route('/api/hr/requests', hrRequestRoutes);
app.route('/api/hr/compensation', hrCompensationRoutes);
app.route('/api/hr/tasks', hrTaskRoutes);
app.route('/api/hr/comms', hrCommsRoutes);
app.route('/api/hr/sheets', hrSheetsRoutes);
app.route('/api/hr/system', hrSystemRoutes);
app.route('/api/hr', hrPeopleRoutes);

app.notFound((c) =>
  c.json({ ok: false, error: { code: 'NOT_FOUND', message: 'The requested endpoint does not exist.' } }, 404),
);

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json(
      { ok: false, error: { code: err.code, message: err.message, details: err.details } },
      err.status as 400,
    );
  }

  // Zod validation failures are converted into the standard envelope so the
  // client always receives a readable message.
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const path = first?.path?.join('.') ?? '';
    return c.json(
      {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: first?.message ?? 'The submitted data is not valid.',
          details: { issues: err.issues },
        },
      },
      400,
    );
  }

  console.error('Unhandled error', err);
  return c.json(
    { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side.' } },
    500,
  );
});

export default app;
