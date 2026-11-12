import { useState, type ReactNode } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { LogIn as LoginIcon, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useAttendanceStatus, useNotifications } from '@/lib/queries';
import { Sidebar } from './Sidebar';
import { BottomNav, MobileDrawer } from './BottomNav';
import { TopBar } from './TopBar';
import type { NavItem } from './nav-items';
import { FloatingAction } from '@/components/ui';
import { Coffee, LogIn } from 'lucide-react';

export function AppShell({
  items,
  mobileItems,
  brand = 'BRONEE',
  subtitle = 'HRMS',
  title,
  showClockAction = false,
}: {
  items: NavItem[];
  mobileItems: NavItem[];
  brand?: string;
  subtitle?: string;
  title?: string;
  showClockAction?: boolean;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const { data: notifications } = useNotifications();
  const { data: attendance } = useAttendanceStatus();

  const unread = notifications?.unread ?? 0;
  const unreadRoster = notifications?.unreadRoster ?? 0;

  const working = attendance?.session?.status === 'open';
  const onBreak = attendance?.activeBreak != null;

  const activeTitle =
    title ??
    items.find((item) =>
      item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
    )?.label ??
    'BRONEE HRMS';

  return (
    <div className="min-h-dvh bg-canvas">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-w)] border-r border-line lg:block">
        <Sidebar
          items={items}
          brand={brand}
          subtitle={subtitle}
          rosterBadge={unreadRoster}
          notificationBadge={unread}
        />
      </aside>

      {/* Mobile drawer */}
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        items={items}
        brand={brand}
        subtitle={subtitle}
        rosterBadge={unreadRoster}
        notificationBadge={unread}
      />

      <div className="lg:pl-[var(--sidebar-w)]">
        <TopBar
          title={activeTitle}
          subtitle={user?.department ?? undefined}
          onOpenMenu={() => setDrawerOpen(true)}
          unread={unread}
        />

        <main className="mx-auto w-full max-w-[1400px] px-4 pb-[calc(var(--bottomnav-h)+28px)] pt-5 sm:px-6 lg:pb-10 lg:pt-7">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <BottomNav
        items={mobileItems}
        rosterBadge={unreadRoster}
        notificationBadge={unread}
        action={
          showClockAction ? (
            <FloatingAction
              label={working ? 'Clock out' : 'Clock in'}
              tone={working ? 'danger' : 'success'}
              onClick={() => navigate('/app/attendance')}
            >
              {working ? <LogOut className="h-5 w-5" /> : <LoginIcon className="h-5 w-5" />}
            </FloatingAction>
          ) : undefined
        }
      />
    </div>
  );
}

export function PortalPage({ children }: { children: ReactNode }) {
  return <div className="space-y-5">{children}</div>;
}

export { Coffee };
