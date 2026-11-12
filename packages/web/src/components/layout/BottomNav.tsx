import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NavItem } from './nav-items';
import { Sidebar } from './Sidebar';
import { IconButton } from '@/components/ui';

/** The slide-over navigation used on small screens. */
export function MobileDrawer({
  open,
  onClose,
  items,
  brand,
  subtitle,
  rosterBadge = 0,
  notificationBadge = 0,
}: {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
  brand?: string;
  subtitle?: string;
  rosterBadge?: number;
  notificationBadge?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', handler);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <motion.div
            className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            className="absolute inset-y-0 left-0 w-[82%] max-w-[300px] bg-white shadow-xl"
          >
            <div className="absolute right-3 top-4 z-10">
              <IconButton label="Close navigation" size="sm" onClick={onClose}>
                <X className="h-4 w-4" />
              </IconButton>
            </div>
            <Sidebar
              items={items}
              brand={brand}
              subtitle={subtitle}
              onNavigate={onClose}
              rosterBadge={rosterBadge}
              notificationBadge={notificationBadge}
            />
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

/** The fixed bottom navigation for mobile devices. */
export function BottomNav({
  items,
  action,
  rosterBadge = 0,
  notificationBadge = 0,
}: {
  items: NavItem[];
  action?: ReactNode;
  rosterBadge?: number;
  notificationBadge?: number;
}) {
  const location = useLocation();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/92 backdrop-blur-xl safe-bottom lg:hidden">
      <div className="grid grid-cols-5 items-end px-2 pt-1.5">
        {items.slice(0, 2).map((item) => (
          <BottomItem key={item.to} item={item} badge={badgeFor(item, rosterBadge, notificationBadge)} />
        ))}

        <div className="flex justify-center pb-1">
          {action ?? <div className="h-12 w-12" />}
        </div>

        {items.slice(2, 5).map((item) => (
          <BottomItem key={item.to} item={item} badge={badgeFor(item, rosterBadge, notificationBadge)} />
        ))}
      </div>
    </nav>
  );
}

function badgeFor(item: NavItem, rosterBadge: number, notificationBadge: number) {
  if (item.badge === 'roster') return rosterBadge;
  if (item.badge === 'notifications') return notificationBadge;
  return 0;
}

function BottomItem({ item, badge }: { item: NavItem; badge: number }) {
  const Icon = item.icon;
  const active = item.end
    ? window.location.pathname === item.to
    : window.location.pathname.startsWith(item.to);

  return (
    <NavLink
      to={item.to}
      className={cn(
        'flex flex-col items-center gap-1 rounded-xl px-1 py-1.5 transition-colors',
        active ? 'text-brand-600' : 'text-ink-muted',
      )}
    >
      <span className="relative">
        <Icon className="h-[21px] w-[21px]" strokeWidth={active ? 2.35 : 2} />
        {badge > 0 ? (
          <span className="absolute -right-2 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
            {badge > 9 ? '9+' : badge}
          </span>
        ) : null}
      </span>
      <span className="text-[10.5px] font-semibold leading-none">{item.label}</span>
    </NavLink>
  );
}
