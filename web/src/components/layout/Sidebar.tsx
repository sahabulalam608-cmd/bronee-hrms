import { type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/cn';

export interface NavItem {
  key: string;
  label: string;
  to: string;
  icon: ReactNode;
  badge?: number;
  group?: string;
}

interface Props {
  logo: string;
  title: string;
  subtitle: string;
  items: NavItem[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  footerSlot?: ReactNode;
}

export function Sidebar({
  logo,
  title,
  subtitle,
  items,
  collapsed,
  onToggleCollapse,
  footerSlot,
}: Props) {
  const { pathname } = useLocation();
  const groups = items.reduce<Record<string, NavItem[]>>((acc, item) => {
    const key = item.group ?? 'Menu';
    (acc[key] ??= []).push(item);
    return acc;
  }, {});

  return (
    <aside
      className={cn(
        'app-sidebar hidden shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-300 ease-out lg:flex',
        collapsed ? 'w-[76px]' : 'w-[264px]',
      )}
    >
      <div className={cn('flex h-[68px] items-center border-b border-line', collapsed ? 'justify-center px-2' : 'px-5')}>
        <Link to="/" className="flex min-w-0 items-center gap-2.5">
          <img
            src={logo}
            alt="BRONEE"
            className={cn(
              'shrink-0 rounded-lg object-contain transition-all duration-300',
              collapsed ? 'h-9 w-9' : 'h-9 w-9',
            )}
          />
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-semibold tracking-[-0.01em] text-ink">{title}</span>
              <span className="block truncate text-[11px] text-ink-faint">{subtitle}</span>
            </span>
          )}
        </Link>
      </div>

      <nav className="scroll-touch flex-1 overflow-y-auto px-2.5 py-3">
        {Object.entries(groups).map(([group, groupItems]) => (
          <div key={group} className="mb-4 last:mb-0">
            {!collapsed && (
              <p className="mb-1.5 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                {group}
              </p>
            )}
            {collapsed && <div className="mx-2 mb-2 h-px bg-line" />}
            <ul className="space-y-0.5">
              {groupItems.map((item) => {
                const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
                return (
                  <li key={item.key}>
                    <Link
                      to={item.to}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        'group relative flex items-center gap-3 rounded-xl px-2.5 py-2 text-[13.5px] font-medium transition-colors duration-150',
                        collapsed && 'justify-center px-0',
                        active
                          ? 'bg-brand-50 text-brand-700'
                          : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
                      )}
                    >
                      {active && !collapsed && (
                        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-600" />
                      )}
                      <span className={cn('shrink-0', active ? 'text-brand-600' : 'text-ink-faint group-hover:text-ink-muted')}>
                        {item.icon}
                      </span>
                      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                      {!collapsed && item.badge ? (
                        <span className="shrink-0 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10.5px] font-bold text-white">
                          {item.badge > 99 ? '99+' : item.badge}
                        </span>
                      ) : null}
                      {collapsed && item.badge ? (
                        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand-600 ring-2 ring-surface" />
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-line p-2.5">
        {footerSlot}
        <button
          type="button"
          onClick={onToggleCollapse}
          className={cn(
            'mt-1 flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-[13px] font-medium text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink',
            collapsed && 'justify-center px-0',
          )}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span className="shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <path d="M9 3v18" />
              <path d={collapsed ? 'm16 15-3-3 3-3' : 'm14 15 3-3-3-3'} />
            </svg>
          </span>
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
