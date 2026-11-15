import { useMemo, useState } from 'react';
import { BellRing, CheckCheck } from 'lucide-react';
import { NumberingBar } from '@/components/ui/list-numbering';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { formatDateTime } from '@/lib/time';
import { cn } from '@/lib/cn';
import { useToast } from '@/components/ui/overlay';
import { Badge, EmptyState, PageHeader, SectionCard } from '@/components/ui/primitives';
import { Tabs } from '@/components/ui/data';
import type { Notification } from '@shared/types';

export function NotificationsPage() {
  const toast = useToast();
  const [tab, setTab] = useState('all');
  const { data, loading, reload } = useAsync(() => api.employeeNotifications(), []);

  const items = data ?? [];
  const counts = useMemo(
    () => ({
      all: items.length,
      unread: items.filter((n) => !n.read).length,
      roster: items.filter((n) => n.category === 'roster').length,
    }),
    [items],
  );

  const filtered = useMemo(() => {
    if (tab === 'unread') return items.filter((n) => !n.read);
    if (tab === 'roster') return items.filter((n) => n.category === 'roster');
    return items;
  }, [items, tab]);

  async function markRead(id: string) {
    await api.markNotificationRead(id);
    reload();
  }

  async function markAll() {
    await api.markAllNotificationsRead();
    toast.success('All caught up', 'Every notification is marked as read.');
    reload();
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications"
        subtitle="Announcements, approvals, roster changes and reminders"
        actions={
          counts.unread > 0 ? (
            <button type="button" className="btn-secondary btn-sm" onClick={markAll}>
              <CheckCheck size={15} />
              Mark all read
            </button>
          ) : undefined
        }
      />

      <Tabs
        tabs={[
          { key: 'all', label: 'All', count: counts.all },
          { key: 'unread', label: 'Unread', count: counts.unread },
          { key: 'roster', label: 'Roster updates', count: counts.roster },
        ]}
        active={tab}
        onChange={setTab}
      />

      <SectionCard padded={false}>
        {loading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton h-16 rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<BellRing size={24} />}
            title="Nothing here"
            description="You have no notifications in this view."
          />
        ) : (
                    <div>
            <NumberingBar className="mb-2" />
            <ul className="serial-list divide-y divide-line">
            {filtered.map((notification: Notification) => (
            <li
            key={notification.id}
            className={cn(
            'flex gap-3 px-5 py-4 transition-colors',
            !notification.read && 'bg-brand-50/40',
            )}
            >
            <span
            className={cn(
            'mt-1.5 h-2 w-2 shrink-0 rounded-full',
            notification.read ? 'bg-transparent' : 'bg-brand-600',
            )}
            />
            <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
            <p
            className={cn(
            'text-[13.5px]',
            notification.read ? 'font-medium text-ink-soft' : 'font-semibold text-ink',
            )}
            >
            {notification.title}
            </p>
            <Badge tone={notification.category === 'roster' ? 'brand' : 'neutral'}>
            {notification.type}
            </Badge>
            {notification.emailStatus === 'Sent' && <Badge tone="ok">Email sent</Badge>}
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">{notification.message}</p>
            <p className="mt-1.5 text-[11.5px] text-ink-faint">
            {formatDateTime(notification.createdAt)}
            </p>
            </div>
            {!notification.read && (
            <button
            type="button"
            onClick={() => markRead(notification.id)}
            className="btn-ghost btn-sm h-fit shrink-0"
            >
            Mark read
            </button>
            )}
            </li>
            ))}
            </ul>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
