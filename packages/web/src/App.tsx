import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/lib/auth';
import { useAuth } from '@/lib/auth-context';
import { ToastProvider } from '@/components/ui';
import { AppShell } from '@/components/layout/AppShell';
import { EMPLOYEE_NAV, HR_MOBILE_PRIMARY, HR_NAV, MOBILE_PRIMARY } from '@/components/layout/nav-items';
import { PageLoader } from '@/components/layout/PageLoader';

const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const SignupPage = lazy(() => import('@/pages/auth/SignupPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'));

const EmployeeDashboard = lazy(() => import('@/pages/employee/DashboardPage'));
const AttendancePage = lazy(() => import('@/pages/employee/AttendancePage'));
const RosterPage = lazy(() => import('@/pages/employee/RosterPage'));
const BreaksPage = lazy(() => import('@/pages/employee/BreaksPage'));
const TasksPage = lazy(() => import('@/pages/employee/TasksPage'));
const LeavePage = lazy(() => import('@/pages/employee/LeavePage'));
const OvertimePage = lazy(() => import('@/pages/employee/OvertimePage'));
const SalaryPage = lazy(() => import('@/pages/employee/SalaryPage'));
const NotificationsPage = lazy(() => import('@/pages/employee/NotificationsPage'));
const ProfilePage = lazy(() => import('@/pages/employee/ProfilePage'));

const HrDashboard = lazy(() => import('@/pages/hr/DashboardPage'));
const HrEmployees = lazy(() => import('@/pages/hr/EmployeesPage'));
const HrSignups = lazy(() => import('@/pages/hr/SignupsPage'));
const HrDepartments = lazy(() => import('@/pages/hr/DepartmentsPage'));
const HrShifts = lazy(() => import('@/pages/hr/ShiftsPage'));
const HrRoster = lazy(() => import('@/pages/hr/RosterPage'));
const HrAttendance = lazy(() => import('@/pages/hr/AttendancePage'));
const HrAttendanceReview = lazy(() => import('@/pages/hr/AttendanceReviewPage'));
const HrLeave = lazy(() => import('@/pages/hr/LeavePage'));
const HrOvertime = lazy(() => import('@/pages/hr/OvertimePage'));
const HrPayroll = lazy(() => import('@/pages/hr/PayrollPage'));
const HrBonus = lazy(() => import('@/pages/hr/BonusPage'));
const HrTasks = lazy(() => import('@/pages/hr/TasksPage'));
const HrAnnouncements = lazy(() => import('@/pages/hr/AnnouncementsPage'));
const HrSheets = lazy(() => import('@/pages/hr/SheetsPage'));
const HrReports = lazy(() => import('@/pages/hr/ReportsPage'));
const HrSettings = lazy(() => import('@/pages/hr/SettingsPage'));
const HrAudit = lazy(() => import('@/pages/hr/AuditPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 20_000,
    },
    mutations: { retry: 0 },
  },
});

function RootRedirect() {
  const { isLoading, isAuthenticated, isHr } = useAuth();
  if (isLoading) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Navigate to={isHr ? '/hr/dashboard' : '/app/dashboard'} replace />;
}

function RequireAuth({ children, hrOnly = false }: { children: React.ReactNode; hrOnly?: boolean }) {
  const { isLoading, isAuthenticated, isHr } = useAuth();
  const location = useLocation();

  if (isLoading) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (hrOnly && !isHr) return <Navigate to="/app/dashboard" replace />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, isHr } = useAuth();
  if (isLoading) return <PageLoader />;
  if (isAuthenticated) return <Navigate to={isHr ? '/hr/dashboard' : '/app/dashboard'} replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<RootRedirect />} />

                {/* ---------------------------------------------------------- auth */}
                <Route
                  path="/login"
                  element={
                    <GuestOnly>
                      <LoginPage />
                    </GuestOnly>
                  }
                />
                <Route
                  path="/signup"
                  element={
                    <GuestOnly>
                      <SignupPage />
                    </GuestOnly>
                  }
                />
                <Route
                  path="/forgot-password"
                  element={
                    <GuestOnly>
                      <ForgotPasswordPage />
                    </GuestOnly>
                  }
                />

                {/* ------------------------------------------------------ employee */}
                <Route
                  path="/app"
                  element={
                    <RequireAuth>
                      <AppShell items={EMPLOYEE_NAV} mobileItems={MOBILE_PRIMARY} showClockAction />
                    </RequireAuth>
                  }
                >
                  <Route index element={<Navigate to="/app/dashboard" replace />} />
                  <Route path="dashboard" element={<EmployeeDashboard />} />
                  <Route path="attendance" element={<AttendancePage />} />
                  <Route path="roster" element={<RosterPage />} />
                  <Route path="breaks" element={<BreaksPage />} />
                  <Route path="tasks" element={<TasksPage />} />
                  <Route path="leave" element={<LeavePage />} />
                  <Route path="overtime" element={<OvertimePage />} />
                  <Route path="salary" element={<SalaryPage />} />
                  <Route path="notifications" element={<NotificationsPage />} />
                  <Route path="profile" element={<ProfilePage />} />
                </Route>

                {/* ------------------------------------------------------------ hr */}
                <Route
                  path="/hr"
                  element={
                    <RequireAuth hrOnly>
                      <AppShell
                        items={HR_NAV}
                        mobileItems={HR_MOBILE_PRIMARY}
                        brand="BRONEE"
                        subtitle="HR Admin"
                      />
                    </RequireAuth>
                  }
                >
                  <Route index element={<Navigate to="/hr/dashboard" replace />} />
                  <Route path="dashboard" element={<HrDashboard />} />
                  <Route path="employees" element={<HrEmployees />} />
                  <Route path="signups" element={<HrSignups />} />
                  <Route path="departments" element={<HrDepartments />} />
                  <Route path="shifts" element={<HrShifts />} />
                  <Route path="roster" element={<HrRoster />} />
                  <Route path="attendance" element={<HrAttendance />} />
                  <Route path="attendance-review" element={<HrAttendanceReview />} />
                  <Route path="leave" element={<HrLeave />} />
                  <Route path="overtime" element={<HrOvertime />} />
                  <Route path="payroll" element={<HrPayroll />} />
                  <Route path="bonus" element={<HrBonus />} />
                  <Route path="tasks" element={<HrTasks />} />
                  <Route path="announcements" element={<HrAnnouncements />} />
                  <Route path="sheets" element={<HrSheets />} />
                  <Route path="reports" element={<HrReports />} />
                  <Route path="settings" element={<HrSettings />} />
                  <Route path="audit" element={<HrAudit />} />
                </Route>

                <Route path="*" element={<RootRedirect />} />
              </Routes>
            </Suspense>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
