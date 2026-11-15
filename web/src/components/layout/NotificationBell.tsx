import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, CheckCheck } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/time';
import { Modal } from '@/components/ui/overlay';

/**
 * One notification in the bell.
 *
 * `summary` is the one-line preview in the dropdown, `detail` is the full
 * text that opens when the notification is clicked.
 */
export interface BellNotification {
  id: string;
  title: string;
  summary: string;
  detail: string;
  type: string;
  createdAt: string;
  read: boolean;
}

/**
 * The notification bell.
 *
 * Clicking the bell opens a summary of the latest notifications; clicking a
 * notification in that list opens its full detail.
 */
export function NotificationBell({
  items,
  unreadCount = 0,
  viewAllTo,
  onMarkRead,
  onMarkAllRead,
  emptyLabel = 'There is no notification yet.',
  emptyHint,
}: {
  items: BellNotification[];
  unreadCount?: number;
  viewAllTo?: string;
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => void;
  emptyLabel?: string;
  emptyHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<BellNotification | null>(null);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (container.current && !container.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={container}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="btn-icon relative"
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={open}
        title="Notifications"
      >
        <Bell size={19} />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="absolute right-0 top-full z-40 mt-2 w-[300px] overflow-hidden rounded-2xl border border-line bg-surface shadow-lift sm:w-[360px]"
          >
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-ink">Notifications</p>
                <p className="text-[11.5px] text-ink-faint">
                  {unreadCount > 0 ? `${unreadCount} unread` : 'You are up to date'}
                </p>
              </div>
              {onMarkAllRead && unreadCount > 0 && (
                <button type="button" onClick={onMarkAllRead} className="btn-ghost btn-sm shrink-0">
                  <CheckCheck size={14} />
                  Read all
                </button>
              )}
            </div>

            <div className="max-h-[min(60vh,340px)] overflow-y-auto">
              {items.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-[12.5px] font-medium text-ink-muted">{emptyLabel}</p>
                  {emptyHint && <p className="mt-1 text-[12px] text-ink-faint">{emptyHint}</p>}
                </div>
              ) : (
                items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setDetail(item);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex w-full gap-2.5 border-b border-line px-4 py-3 text-left transition-colors hover:bg-surface-sunken',
                      !item.read && 'bg-brand-50/40',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                        item.read ? 'bg-transparent' : 'bg-brand-600',
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-ink">
                        {item.title}
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-muted">
                        {item.summary}
                      </span>
                      <span className="mt-1 block text-[11px] text-ink-faint">
                        {formatDateTime(item.createdAt)}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>

            {viewAllTo && (
              <Link
                to={viewAllTo}
                onClick={() => setOpen(false)}
                className="block border-t border-line px-4 py-3 text-center text-[12.5px] font-semibold text-brand-700 transition-colors hover:bg-surface-sunken"
              >
                View all notifications
              </Link>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail?.title}
        description={detail ? `${detail.type} · ${formatDateTime(detail.createdAt)}` : undefined}
        size="lg"
      >
        {detail && (
          <div className="space-y-4">
            <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink-soft">
              {detail.detail}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11.5px] uppercase tracking-[0.1em] text-ink-faint">Type</span>
              <span className="text-[12.5px] font-medium text-ink">{detail.type}</span>
              <span className="text-[11.5px] uppercase tracking-[0.1em] text-ink-faint">Sent</span>
              <span className="text-[12.5px] font-medium text-ink">
                {formatDateTime(detail.createdAt)}
              </span>
            </div>
            {!detail.read && onMarkRead && (
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => {
                  onMarkRead(detail.id);
                  setDetail(null);
                }}
              >
                <CheckCheck size={14} />
                Mark as read
              </button>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
