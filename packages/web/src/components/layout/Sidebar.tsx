import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import type { NavItem } from './nav-items';

export function Sidebar({
  items,
  brand = 'BRONEE',
  subtitle = 'HRMS',
  onNavigate,
  rosterBadge = 0,
  notificationBadge = 0,
}: {
  items: NavItem[];
  brand?: string;
  subtitle?: string;
  onNavigate?: () => void;
  rosterBadge?: number;
  notificationBadge?: number;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const badgeFor = (item: NavItem) => {
    if (item.badge === 'roster') return rosterBadge;
    if (item.badge === 'notifications') return notificationBadge;
    return 0;
  };

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 pb-5 pt-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-bronee-600 text-[15px] font-bold text-white shadow-soft">
          B
        </span>
        <div className="leading-none">
          <p className="text-[15px] font-extrabold tracking-[-0.02em] text-ink">{brand}</p>
          <p className="mt-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-bronee-500">
            {subtitle}
          </p>
        </div>
      </div>

      <div className="rule-fade mx-5" />

      {/* Navigation */}
      <nav className="no-scrollbar flex-1 space-y-0.5 overflow-y-auto px-4 py-5">
        {items.map((item) => {
          const badge = badgeFor(item);
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) => cn('nav-item', isActive && 'nav-item-active')}
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn(
                      'h-[18px] w-[18px] shrink-0 transition-colors',
                      isActive ? 'text-brand-600' : 'text-ink-muted',
                    )}
                    strokeWidth={2.1}
                  />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {badge > 0 ? (
                    <motion.span
                      key={badge}
                      initial={{ scale: 0.6 }}
                      animate={{ scale: 1 }}
                      className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10.5px] font-bold text-white"
                    >
                      {badge > 99 ? '99+' : badge}
                    </motion.span>
                  ) : null}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Account */}
      <div className="border-t border-line px-4 py-4">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-700">
            {user?.fullName?.slice(0, 2).toUpperCase() ?? 'BR'}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-bold text-ink">{user?.fullName ?? 'Guest'}</p>
            <p className="truncate text-[11.5px] text-ink-muted">{user?.employeeCode ?? ''}</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            aria-label="Sign out"
            title="Sign out"
            className="shrink-0 rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
