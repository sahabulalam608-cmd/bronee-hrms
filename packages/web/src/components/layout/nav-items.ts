import {
  Bell,
  Briefcase,
  CalendarDays,
  CheckCheck,
  ClipboardList,
  Coffee,
  Coins,
  Gauge,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  permission?: string;
  badge?: 'roster' | 'notifications';
  end?: boolean;
};

export const EMPLOYEE_NAV: NavItem[] = [
  { to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/attendance', label: 'Attendance', icon: CheckCheck },
  { to: '/app/roster', label: 'Roster', icon: CalendarDays, badge: 'roster' },
  { to: '/app/breaks', label: 'Break Management', icon: Coffee },
  { to: '/app/tasks', label: 'My Tasks', icon: ClipboardList },
  { to: '/app/leave', label: 'Leave Management', icon: Briefcase },
  { to: '/app/overtime', label: 'Overtime', icon: Coins },
  { to: '/app/salary', label: 'My Salary', icon: Gauge },
  { to: '/app/notifications', label: 'Notifications', icon: Bell, badge: 'notifications' },
  { to: '/app/profile', label: 'My Profile', icon: UserRound },
];

export const HR_NAV: NavItem[] = [
  { to: '/hr/dashboard', label: 'HR Dashboard', icon: LayoutDashboard, end: true },
  { to: '/hr/employees', label: 'Employee Management', icon: UserRound },
  { to: '/hr/signups', label: 'Signup Approval', icon: ShieldCheck },
  { to: '/hr/departments', label: 'Department Management', icon: Settings },
  { to: '/hr/shifts', label: 'Shift Management', icon: CalendarDays },
  { to: '/hr/roster', label: 'Roster Management', icon: CalendarDays },
  { to: '/hr/attendance', label: 'Attendance Management', icon: CheckCheck },
  { to: '/hr/attendance-review', label: 'Attendance Review', icon: ShieldCheck },
  { to: '/hr/leave', label: 'Leave Management', icon: Briefcase },
  { to: '/hr/overtime', label: 'Overtime Management', icon: Coins },
  { to: '/hr/payroll', label: 'Payroll Management', icon: Gauge },
  { to: '/hr/bonus', label: 'Attendance Bonus', icon: Coins },
  { to: '/hr/tasks', label: 'Task Management', icon: ClipboardList },
  { to: '/hr/announcements', label: 'Announcements', icon: Bell },
  { to: '/hr/sheets', label: 'Google Sheets', icon: Settings },
  { to: '/hr/reports', label: 'Reports & Export', icon: ClipboardList },
  { to: '/hr/settings', label: 'Company Settings', icon: Settings },
  { to: '/hr/audit', label: 'Audit Logs', icon: ShieldCheck },
];

/** The five destinations that fit in the mobile bottom bar. */
export const MOBILE_PRIMARY: NavItem[] = [
  { to: '/app/dashboard', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/app/roster', label: 'Roster', icon: CalendarDays, badge: 'roster' },
  { to: '/app/tasks', label: 'Tasks', icon: ClipboardList },
  { to: '/app/salary', label: 'Salary', icon: Gauge },
  { to: '/app/notifications', label: 'Alerts', icon: Bell, badge: 'notifications' },
];

export const HR_MOBILE_PRIMARY: NavItem[] = [
  { to: '/hr/dashboard', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/hr/employees', label: 'People', icon: UserRound },
  { to: '/hr/roster', label: 'Roster', icon: CalendarDays },
  { to: '/hr/tasks', label: 'Tasks', icon: ClipboardList },
  { to: '/hr/announcements', label: 'Notices', icon: Bell },
];

export const LOGOUT_ICON = LogOut;
