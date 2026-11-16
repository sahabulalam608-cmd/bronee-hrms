import { type ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { NavItem } from './Sidebar';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import type { BellNotification } from './NotificationBell';

interface Props {
  logo: string;
  title: string;
  subtitle: string;
  items: NavItem[];
  bottomNav?: NavItem[];
  unreadNotifications?: number;
  notificationsTo?: string;
  notifications?: BellNotification[];
  profilePhotoUrl?: string | null;
  onMarkNotificationRead?: (id: string) => void;
  onMarkAllNotificationsRead?: () => void;
  notificationEmptyLabel?: string;
  notificationEmptyHint?: string;
  children: ReactNode;
}

export function AppShell({
  logo,
  title,
  subtitle,
  items,
  bottomNav,
  unreadNotifications = 0,
  notificationsTo,
  notifications,
  profilePhotoUrl,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  notificationEmptyLabel,
  notificationEmptyHint,
  children,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <div className="flex h-full min-h-screen bg-surface-sunken">
      <Sidebar
        logo={logo}
        title={title}
        subtitle={subtitle}
        items={items}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          onOpenMobileNav={() => setMobileNavOpen(true)}
          unreadNotifications={unreadNotifications}
          notificationsTo={notificationsTo}
          notifications={notifications}
          profilePhotoUrl={profilePhotoUrl}
          onMarkNotificationRead={onMarkNotificationRead}
          onMarkAllNotificationsRead={onMarkAllNotificationsRead}
          notificationEmptyLabel={notificationEmptyLabel}
          notificationEmptyHint={notificationEmptyHint}
        />

        <main className="scroll-touch flex-1 overflow-y-auto px-4 pb-28 pt-5 sm:px-6 lg:pb-10">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto w-full max-w-[1360px]"
          >
            {children}
          </motion.div>
        </main>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileNavOpen(false)}
              className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              className="absolute inset-y-0 left-0 flex w-[280px] flex-col bg-surface shadow-lift"
            >
              <div className="flex h-[68px] items-center justify-between border-b border-line px-5">
                <Link to="/" className="flex items-center gap-2.5" onClick={() => setMobileNavOpen(false)}>
                  <img src={logo} alt="BRONEE" className="h-9 w-9 rounded-lg object-contain" />
                  <span>
                    <span className="block text-[14px] font-semibold text-ink">{title}</span>
                    <span className="block text-[11px] text-ink-faint">{subtitle}</span>
                  </span>
                </Link>
                <button type="button" className="btn-icon" onClick={() => setMobileNavOpen(false)} aria-label="Close">
                  <X size={18} />
                </button>
              </div>
              <nav className="scroll-touch flex-1 overflow-y-auto px-2.5 py-3">
                <ul className="space-y-0.5">
                  {items.map((item) => {
                    const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
                    return (
                      <li key={item.key}>
                        <Link
                          to={item.to}
                          onClick={() => setMobileNavOpen(false)}
                          className={cn(
                            'flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-[14px] font-medium transition-colors',
                            active ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
                          )}
                        >
                          <span className={active ? 'text-brand-600' : 'text-ink-faint'}>{item.icon}</span>
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.badge ? (
                            <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10.5px] font-bold text-white">
                              {item.badge}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile bottom navigation */}
      {bottomNav && bottomNav.length > 0 && (
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/92 backdrop-blur-xl lg:hidden">
          <ul className="flex items-stretch justify-around">
            {bottomNav.map((item) => {
              const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
              return (
                <li key={item.key} className="flex-1">
                  <Link
                    to={item.to}
                    className={cn(
                      'relative flex flex-col items-center gap-1 px-1 pb-2 pt-2.5 text-[10.5px] font-medium transition-colors',
                      active ? 'text-brand-700' : 'text-ink-faint',
                    )}
                  >
                    <span className={cn('transition-transform', active && '-translate-y-0.5')}>{item.icon}</span>
                    <span className="max-w-full truncate px-0.5">{item.label}</span>
                    {item.badge ? (
                      <span className="absolute right-[22%] top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[9.5px] font-bold text-white">
                        {item.badge > 9 ? '9+' : item.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
