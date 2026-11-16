import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, ChevronDown, LogOut, Menu, Monitor, ShieldCheck, Smartphone, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/cn';
import { formatDate, formatTimeSeconds } from '@/lib/time';
import { useViewMode } from '@/lib/view-mode';
import { Avatar, Badge } from '@/components/ui/primitives';
import { useAuth } from '@/features/auth/AuthProvider';
import { NotificationBell, type BellNotification } from './NotificationBell';

export function BdClock({ className }: { className?: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className={cn('flex flex-col items-end leading-tight', className)}>
      <span className="font-mono text-[13px] font-semibold tabular-nums text-ink">
        {formatTimeSeconds(now)}
      </span>
      <span className="text-[11px] text-ink-faint">{formatDate(now)}</span>
    </div>
  );
}

export function TopBar({
  onOpenMobileNav,
  unreadNotifications = 0,
  notificationsTo = '/employee/notifications',
  notifications,
  profilePhotoUrl,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  notificationEmptyLabel,
  notificationEmptyHint,
}: {
  onOpenMobileNav: () => void;
  unreadNotifications?: number;
  notificationsTo?: string;
  /** The notifications shown in the bell. Without them the bell only links out. */
  notifications?: BellNotification[];
  /** The profile photo of the signed-in employee. */
  profilePhotoUrl?: string | null;
  onMarkNotificationRead?: (id: string) => void;
  onMarkAllNotificationsRead?: () => void;
  notificationEmptyLabel?: string;
  notificationEmptyHint?: string;
}) {
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  // A phone can show the portal as a normal page or as the desktop layout.
  const { isDesktopView, toggle: toggleViewMode } = useViewMode();

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuOpen]);

  if (!user) return null;
  const totalUnread = unreadNotifications;

  return (
    <header className="sticky top-0 z-30 flex h-[68px] items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur-xl sm:px-6">
      <button
        type="button"
        onClick={onOpenMobileNav}
        className="btn-icon lg:hidden"
        aria-label="Open navigation"
      >
        <Menu size={19} />
      </button>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">
          {user.fullName}
        </p>
        <p className="truncate text-[11.5px] text-ink-faint">
          {user.designation} · {user.departmentName}
          {user.subDepartmentName ? ` · ${user.subDepartmentName}` : ''}
        </p>
      </div>

      <div className="hidden md:block">
        <BdClock />
      </div>

      {/* On a phone: the normal browser page, or the full desktop layout. */}
      <button
        type="button"
        onClick={toggleViewMode}
        className="view-mode-toggle btn-ghost btn-sm gap-1.5 px-2"
        aria-label={isDesktopView ? 'Switch to browser view' : 'Switch to desktop view'}
        title={isDesktopView ? 'Browser view' : 'Desktop view'}
      >
        {isDesktopView ? <Smartphone size={17} /> : <Monitor size={17} />}
        <span className="hidden sm:inline">{isDesktopView ? 'Browser view' : 'Desktop view'}</span>
      </button>

      {notifications ? (
        <NotificationBell
          items={notifications}
          unreadCount={totalUnread}
          viewAllTo={notificationsTo}
          onMarkRead={onMarkNotificationRead}
          onMarkAllRead={onMarkAllNotificationsRead}
          emptyLabel={notificationEmptyLabel}
          emptyHint={notificationEmptyHint}
        />
      ) : (
        <Link
          to={notificationsTo}
          className="btn-icon relative"
          aria-label={`Notifications${totalUnread ? ` (${totalUnread} unread)` : ''}`}
        >
          <Bell size={19} />
          {totalUnread > 0 && (
            <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
              {totalUnread > 9 ? '9+' : totalUnread}
            </span>
          )}
        </Link>
      )}

      <div className="relative">
        <button
          type="button"
          aria-label="Account menu"
          aria-expanded={menuOpen}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className="flex items-center gap-2 rounded-xl px-1.5 py-1 transition-colors hover:bg-surface-sunken"
        >
          <Avatar name={user.fullName} src={profilePhotoUrl ?? undefined} size={34} />
          <ChevronDown size={15} className="hidden text-ink-faint sm:block" />
        </button>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-2xl border border-line bg-surface shadow-lift"
            >
              <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
                <Avatar name={user.fullName} src={profilePhotoUrl ?? undefined} size={40} />
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold text-ink">{user.fullName}</p>
                  <p className="truncate text-[12px] text-ink-faint">{user.email}</p>
                </div>
              </div>
              <div className="px-4 py-2.5">
                <Badge tone="brand" dot>
                  {user.portal === 'HR' ? 'HR & Management Portal' : 'Employee Portal'}
                </Badge>
                <p className="mt-1.5 text-[11.5px] text-ink-faint">
                  Employee ID {user.employeeId} · {user.departmentName}
                </p>
              </div>
              <div className="border-t border-line py-1.5">
                <Link
                  to={user.portal === 'HR' ? '/hr/settings' : '/employee/profile'}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-ink-soft transition-colors hover:bg-surface-sunken"
                >
                  <User size={15} className="text-ink-faint" />
                  My Profile
                </Link>
                {user.portal === 'HR' && (
                  <Link
                    to="/hr/audit"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-ink-soft transition-colors hover:bg-surface-sunken"
                  >
                    <ShieldCheck size={15} className="text-ink-faint" />
                    Audit Logs
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] text-bad transition-colors hover:bg-bad-soft"
                >
                  <LogOut size={15} />
                  Sign out
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
