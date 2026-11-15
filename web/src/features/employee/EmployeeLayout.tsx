import { useCallback, useEffect, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import {
  Bell,
  CalendarDays,
  ClipboardList,
  Coffee,
  Gauge,
  LayoutGrid,
  Receipt,
  Timer,
  UserCircle2,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import type { NavItem } from '@/components/layout/Sidebar';
import type { BellNotification } from '@/components/layout/NotificationBell';
import { api } from '@/lib/api';
import { EMPLOYEE_MODULES } from '@shared/constants';
import { useAuth } from '@/features/auth/AuthProvider';
import type { Notification } from '@shared/types';

import { DashboardPage } from './DashboardPage';
import { AttendancePage } from './AttendancePage';
import { RosterPage } from './RosterPage';
import { BreakPage } from './BreakPage';
import { TasksPage } from './TasksPage';
import { LeavePage } from './LeavePage';
import { OvertimePage } from './OvertimePage';
import { NotificationsPage } from './NotificationsPage';
import { ProfilePage } from './ProfilePage';

const ICONS: Record<string, React.ReactNode> = {
  dashboard: <LayoutGrid size={18} />,
  attendance: <Timer size={18} />,
  roster: <CalendarDays size={18} />,
  break: <Coffee size={18} />,
  tasks: <ClipboardList size={18} />,
  leave: <Bell size={18} />,
  overtime: <Gauge size={18} />,
  notifications: <Bell size={18} />,
  profile: <UserCircle2 size={18} />,
};

export default function EmployeeLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [notifications, setNotifications] = useState<BellNotification[]>([]);

  const load = useCallback(async () => {
    try {
      const rows = await api.employeeNotifications();
      setNotifications(rows.map(toBellNotification));
      setUnreadNotifications(rows.filter((n) => !n.read).length);
    } catch {
      /* the bell is decorative — a failure must never break the shell */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, load]);

  async function markRead(id: string) {
    try {
      await api.markNotificationRead(id);
      await load();
    } catch {
      /* keep the list as it is when the write fails */
    }
  }

  async function markAllRead() {
    try {
      await api.markAllNotificationsRead();
      await load();
    } catch {
      /* keep the list as it is when the write fails */
    }
  }

  const items: NavItem[] = EMPLOYEE_MODULES.map((module) => ({
    key: module.key,
    label: module.label,
    to: `/employee/${module.key}`,
    icon: ICONS[module.key] ?? <LayoutGrid size={18} />,
    badge: module.key === 'notifications' ? unreadNotifications || undefined : undefined,
  }));

  const bottomNav: NavItem[] = items.filter((item) =>
    ['dashboard', 'attendance', 'roster', 'tasks', 'leave', 'notifications'].includes(item.key),
  );

  return (
    <AppShell
      logo="/mark.png"
      title="BRONEE HRMS"
      subtitle={user?.portal === 'HR' ? 'HR & Management' : 'Employee Portal'}
      items={items}
      bottomNav={bottomNav}
      unreadNotifications={unreadNotifications}
      notificationsTo="/employee/notifications"
      notifications={notifications}
      onMarkNotificationRead={markRead}
      onMarkAllNotificationsRead={markAllRead}
      notificationEmptyLabel="There is no notification yet."
      notificationEmptyHint="Announcements, approvals and roster changes arrive here."
    >
      <Routes>
        <Route index element={<NavigateToDashboard />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="roster" element={<RosterPage />} />
        <Route path="break" element={<BreakPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="leave" element={<LeavePage />} />
        <Route path="overtime" element={<OvertimePage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<DashboardPage />} />
      </Routes>
    </AppShell>
  );
}

function NavigateToDashboard() {
  return <DashboardPage />;
}

/** A notification of the employee portal, ready for the bell. */
function toBellNotification(notification: Notification): BellNotification {
  return {
    id: notification.id,
    title: notification.title,
    summary: notification.message,
    detail: notification.message,
    type: notification.type,
    createdAt: notification.createdAt,
    read: notification.read,
  };
}

export { Receipt };
