import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, ChevronDown, Menu, Search, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { Avatar, IconButton } from '@/components/ui';
import { LiveClock } from './Clock';

export function TopBar({
  title,
  subtitle,
  onOpenMenu,
  actions,
  unread = 0,
}: {
  title?: string;
  subtitle?: string;
  onOpenMenu?: () => void;
  actions?: ReactNode;
  unread?: number;
}) {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/85 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        {onOpenMenu ? (
          <IconButton label="Open navigation" size="sm" onClick={onOpenMenu} className="lg:hidden">
            <Menu className="h-[18px] w-[18px]" />
          </IconButton>
        ) : null}

        <div className="min-w-0 flex-1">
          {title ? (
            <h1 className="truncate text-[16px] font-bold tracking-[-0.01em] text-ink sm:text-[17px]">
              {title}
            </h1>
          ) : null}
          {subtitle ? (
            <p className="truncate text-[12.5px] text-ink-muted">{subtitle}</p>
          ) : null}
        </div>

        {actions}

        <div className="hidden items-center gap-3 md:flex">
          <LiveClock compact />
          <div className="h-7 w-px bg-line" />
        </div>

        <Link
          to="/app/notifications"
          aria-label="Notifications"
          className="relative rounded-xl p-2 text-ink-soft transition-colors hover:bg-canvas hover:text-ink"
        >
          <Bell className="h-[18px] w-[18px]" />
          {unread > 0 ? (
            <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[9.5px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </Link>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 transition-colors hover:bg-canvas"
          >
            <Avatar name={user?.fullName} src={user?.avatarUrl} size="sm" />
            <span className="hidden max-w-[130px] truncate text-[13px] font-semibold text-ink lg:block">
              {user?.fullName?.split(' ')[0] ?? 'Account'}
            </span>
            <ChevronDown className="hidden h-3.5 w-3.5 text-ink-muted lg:block" />
          </button>

          <AnimatePresence>
            {menuOpen ? (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.16 }}
                className="absolute right-0 top-full z-40 mt-2 w-60 overflow-hidden rounded-2xl border border-line bg-white shadow-lg"
              >
                <div className="border-b border-line px-4 py-3">
                  <p className="truncate text-[13.5px] font-bold text-ink">{user?.fullName}</p>
                  <p className="truncate text-[12px] text-ink-muted">{user?.email}</p>
                  <p className="mt-1.5 inline-flex rounded-md bg-brand-50 px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-brand-700">
                    {user?.department ?? 'BRONEE'} · {user?.employeeCode}
                  </p>
                </div>
                <div className="p-1.5">
                  <Link
                    to="/app/profile"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-ink-soft transition-colors hover:bg-canvas hover:text-ink"
                  >
                    <Search className="h-3.5 w-3.5" />
                    My profile
                  </Link>
                  <Link
                    to="/app/notifications"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-ink-soft transition-colors hover:bg-canvas hover:text-ink"
                  >
                    <Bell className="h-3.5 w-3.5" />
                    Notifications
                  </Link>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}

/** A mobile top bar with just the brand and a menu button. */
export function MobileTopBar({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur-xl safe-top">
      <div className="flex h-14 items-center justify-between px-4">
        <h1 className="truncate text-[15px] font-bold tracking-[-0.01em] text-ink">{title}</h1>
        <Link
          to="/app/notifications"
          aria-label="Notifications"
          className="relative rounded-lg p-1.5 text-ink-soft"
        >
          <Bell className="h-[18px] w-[18px]" />
        </Link>
      </div>
    </header>
  );
}

export function SearchButton({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 items-center gap-2 rounded-xl border border-line bg-white px-3 text-[13px] font-medium text-ink-muted transition-colors hover:border-brand-300 hover:text-ink-soft"
    >
      <Search className="h-4 w-4" />
      <span className="hidden sm:block">Search</span>
    </button>
  );
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <IconButton label="Close" size="sm" onClick={onClick} className="text-ink-muted">
      <X className="h-4 w-4" />
    </IconButton>
  );
}

export function PageHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-5 flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="text-[22px] font-extrabold tracking-[-0.025em] text-ink sm:text-[25px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
