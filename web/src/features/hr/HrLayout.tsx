import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import {
  AlarmClockCheck,
  Award,
  BadgeCheck,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Coffee,
  FileBarChart,
  FileSpreadsheet,
  LayoutGrid,
  Megaphone,
  ScrollText,
  Settings,
  ShieldAlert,
  Users,
  Wallet,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import type { NavItem } from '@/components/layout/Sidebar';
import { api } from '@/lib/api';
import { HR_MODULES } from '@shared/constants';
import { useAuth } from '@/features/auth/AuthProvider';

import { DashboardPage } from './DashboardPage';
import { EmployeesPage } from './EmployeesPage';
import { ApprovalsPage } from './ApprovalsPage';
import { DepartmentsPage } from './DepartmentsPage';
import { DesignationsPage } from './DesignationsPage';
import { RosterPage } from './RosterPage';
import { AttendancePage } from './AttendancePage';
import { AttendanceReviewPage } from './AttendanceReviewPage';
import { BreaksPage } from './BreaksPage';
import { LeavePage } from './LeavePage';
import { OvertimePage } from './OvertimePage';
import { BonusPage } from './BonusPage';
import { PayrollPage } from './PayrollPage';
import { TasksPage } from './TasksPage';
import { AnnouncementsPage } from './AnnouncementsPage';
import { SheetsPage } from './SheetsPage';
import { ReportsPage } from './ReportsPage';
import { SettingsPage } from './SettingsPage';
import { AuditPage } from './AuditPage';

const ICONS: Record<string, ReactNode> = {
  dashboard: <LayoutGrid size={18} />,
  employees: <Users size={18} />,
  approvals: <ClipboardCheck size={18} />,
  departments: <Building2 size={18} />,
  designations: <BadgeCheck size={18} />,
  shifts: <Clock size={18} />,
  roster: <CalendarRange size={18} />,
  attendance: <CalendarCheck size={18} />,
  'attendance-review': <ShieldAlert size={18} />,
  breaks: <Coffee size={18} />,
  leave: <CalendarClock size={18} />,
  overtime: <AlarmClockCheck size={18} />,
  bonus: <Award size={18} />,
  payroll: <Wallet size={18} />,
  tasks: <ClipboardList size={18} />,
  announcements: <Megaphone size={18} />,
  sheets: <FileSpreadsheet size={18} />,
  reports: <FileBarChart size={18} />,
  settings: <Settings size={18} />,
  audit: <ScrollText size={18} />,
};

export default function HrLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // The contract exposes notifications per signed-in employee. HR accounts are
        // employees as well, so this returns the notifications addressed to the
        // signed-in HR user.
        const notifications = await api.employeeNotifications();
        if (cancelled) return;
        setUnreadNotifications(notifications.filter((notification) => !notification.read).length);
      } catch {
        /* the counter is decorative — a failure must never break the shell */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  const items: NavItem[] = HR_MODULES.filter((module) => {
    if (!module.permission) return true;
    return user?.permissions.includes(module.permission) ?? false;
  }).map((module) => ({
    key: module.key,
    label: module.label,
    to: `/hr/${module.key}`,
    icon: ICONS[module.key] ?? <LayoutGrid size={18} />,
    group: module.group,
  }));

  return (
    <AppShell
      logo="/mark.png"
      title="BRONEE HRMS"
      subtitle="HR & Management"
      items={items}
      unreadNotifications={unreadNotifications}
      notificationsTo="/hr/notifications"
    >
      <Routes>
        <Route index element={<Navigate to="/hr/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="employees" element={<EmployeesPage />} />
        <Route path="approvals" element={<ApprovalsPage />} />
        <Route path="departments" element={<DepartmentsPage />} />
        <Route path="designations" element={<DesignationsPage />} />
        <Route path="roster" element={<RosterPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="attendance-review" element={<AttendanceReviewPage />} />
        <Route path="breaks" element={<BreaksPage />} />
        <Route path="leave" element={<LeavePage />} />
        <Route path="overtime" element={<OvertimePage />} />
        <Route path="bonus" element={<BonusPage />} />
        <Route path="payroll" element={<PayrollPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="announcements" element={<AnnouncementsPage />} />
        <Route path="sheets" element={<SheetsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="*" element={<Navigate to="/hr/dashboard" replace />} />
      </Routes>
    </AppShell>
  );
}
