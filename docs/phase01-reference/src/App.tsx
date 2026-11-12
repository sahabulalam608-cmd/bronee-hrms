import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import EmployeeShell from './pages/EmployeeShell'
import DashboardPage from './pages/DashboardPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/" element={<EmployeeShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="attendance" element={<Placeholder title="Attendance" />} />
        <Route path="roster" element={<Placeholder title="Roster" />} />
        <Route path="tasks" element={<Placeholder title="My Tasks" />} />
        <Route path="leave" element={<Placeholder title="Leave" />} />
        <Route path="overtime" element={<Placeholder title="Overtime" />} />
        <Route path="salary" element={<Placeholder title="My Salary" />} />
        <Route path="notifications" element={<Placeholder title="Notifications" />} />
        <Route path="profile" element={<Placeholder title="My Profile" />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 text-center">
      <h1 className="text-lg font-semibold text-ink">{title}</h1>
      <p className="text-sm text-ink-muted">This module will be available in the next phase.</p>
    </div>
  )
}
