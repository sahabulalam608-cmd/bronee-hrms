import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { LoginPage } from '@/features/auth/LoginPage';
import { SignupPage } from '@/features/auth/SignupPage';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { ToastProvider } from '@/components/ui/overlay';
import { PageLoader } from '@/components/ui/loaders';

const EmployeeLayout = lazy(() => import('@/features/employee/EmployeeLayout'));
const HrLayout = lazy(() => import('@/features/hr/HrLayout'));

const employeePages = [
  ['dashboard', () => import('@/features/employee/DashboardPage')],
  ['attendance', () => import('@/features/employee/AttendancePage')],
  ['roster', () => import('@/features/employee/RosterPage')],
  ['break', () => import('@/features/employee/BreakPage')],
  ['tasks', () => import('@/features/employee/TasksPage')],
  ['leave', () => import('@/features/employee/LeavePage')],
  ['overtime', () => import('@/features/employee/OvertimePage')],
  ['notifications', () => import('@/features/employee/NotificationsPage')],
  ['profile', () => import('@/features/employee/ProfilePage')],
] as const;

const hrPages = [
  ['dashboard', () => import('@/features/hr/DashboardPage')],
  ['employees', () => import('@/features/hr/EmployeesPage')],
  ['approvals', () => import('@/features/hr/ApprovalsPage')],
  ['departments', () => import('@/features/hr/DepartmentsPage')],
  ['designations', () => import('@/features/hr/DesignationsPage')],
  ['roster', () => import('@/features/hr/RosterPage')],
  ['attendance', () => import('@/features/hr/AttendancePage')],
  ['attendance-review', () => import('@/features/hr/AttendanceReviewPage')],
  ['breaks', () => import('@/features/hr/BreaksPage')],
  ['leave', () => import('@/features/hr/LeavePage')],
  ['overtime', () => import('@/features/hr/OvertimePage')],
  ['bonus', () => import('@/features/hr/BonusPage')],
  ['payroll', () => import('@/features/hr/PayrollPage')],
  ['tasks', () => import('@/features/hr/TasksPage')],
  ['announcements', () => import('@/features/hr/AnnouncementsPage')],
  ['sheets', () => import('@/features/hr/SheetsPage')],
  ['reports', () => import('@/features/hr/ReportsPage')],
  ['settings', () => import('@/features/hr/SettingsPage')],
  ['audit', () => import('@/features/hr/AuditPage')],
] as const;

function RequirePortal({
  portal,
  children,
}: {
  portal: 'EMPLOYEE' | 'HR';
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (user.portal !== portal) {
    return <Navigate to={user.portal === 'HR' ? '/hr/dashboard' : '/employee/dashboard'} replace />;
  }
  return <>{children}</>;
}

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.portal === 'HR' ? '/hr/dashboard' : '/employee/dashboard'} replace />;
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />

            <Route
              path="/employee/*"
              element={
                <RequirePortal portal="EMPLOYEE">
                  <EmployeeLayout />
                </RequirePortal>
              }
            />

            <Route
              path="/hr/*"
              element={
                <RequirePortal portal="HR">
                  <HrLayout />
                </RequirePortal>
              }
            />

            <Route path="/" element={<RootRedirect />} />
            <Route path="*" element={<RootRedirect />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </ToastProvider>
  );
}

export { employeePages, hrPages };
