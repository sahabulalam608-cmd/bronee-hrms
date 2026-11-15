import { useCallback, useEffect, useState, type ReactNode } from 'react';
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
import type { BellNotification } from '@/components/layout/NotificationBell';
import { api } from '@/lib/api';
import { HR_MODULES } from '@shared/constants';
import { useAuth } from '@/features/auth/AuthProvider';
import type { Notification } from '@shared/types';

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

export default function HrLayout() {  const { user } = useAuth();
  const location = useLocation();
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [notifications, setNotifications] = useState<BellNotification[]>([]);

  const load = useCallback(async () => {
    try {
      // The bell of the HR portal shows the notifications that are published
      // for everybody, plus the notifications addressed to the signed-in HR user.
      const [announcements, personal] = await Promise.all([
        api.hrAnnouncements(),
        api.employeeNotifications(),
      ]);
      const seen = new Set(readSeenAnnouncements());
      const published = announcements
        .filter((announcement) => announcement.status === 'Published' && announcement.audience === 'all')
        .map((announcement) => ({
          id: announcement.id,
          title: announcement.title,
          summary: summarise(announcement.body),
          detail: announcement.body,
          type: announcement.type,
          createdAt: announcement.publishedAt ?? announcement.createdAt,
          read: seen.has(announcement.id),
        }));
      const own = personal.map((notification) => toBellNotification(notification));
      const items = [...published, ...own];
      setNotifications(items);
      setUnreadNotifications(items.filter((item) => !item.read).length);
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

  function markRead(id: string) {
    const seen = new Set(readSeenAnnouncements());
    seen.add(id);
    writeSeenAnnouncements(Array.from(seen));
    void load();
  }

  function markAllRead() {
    const seen = new Set(readSeenAnnouncements());
    for (const item of notifications) seen.add(item.id);
    writeSeenAnnouncements(Array.from(seen));
    void load();
  }

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
      notificationsTo="/hr/announcements"
      notifications={notifications}
      onMarkNotificationRead={markRead}
      onMarkAllNotificationsRead={markAllRead}
      notificationEmptyLabel="Nothing published yet."
      notificationEmptyHint="Announcements published for everybody show up here."
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

/* ------------------------------------------------------------------ *
 * Notification bell helpers
 * ------------------------------------------------------------------ */

const SEEN_KEY = 'bronee.hrms.hr-announcement-seen.v1';

/** The announcements the signed-in HR user has already opened. */
function readSeenAnnouncements(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function writeSeenAnnouncements(ids: string[]): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
  } catch {
    /* the seen list is a convenience — the page still works without it */
  }
}

/** The one-line preview of an announcement. */
function summarise(body: string): string {
  const text = body.replace(/\s+/g, ' ').trim();
  return text.length > 150 ? `${text.slice(0, 150)}…` : text;
}

/** A notification addressed to the signed-in HR user. */
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
