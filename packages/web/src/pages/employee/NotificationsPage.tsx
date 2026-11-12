import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell,
  BellOff,
  CalendarDays,
  CheckCheck,
  ClipboardList,
  Coins,
  Info,
  Megaphone,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { relativeTime } from '@/lib/utils';
import { api, ApiError } from '@/lib/api';
import { useNotifications } from '@/lib/queries';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Segmented,
  Skeleton,
  useToast,
} from '@/components/ui';
import { cn } from '@/lib/utils';

const TYPE_META: Record<string, { icon: typeof Bell; label: string; tone: string }> = {
  account_approved: { icon: ShieldCheck, label: 'Account', tone: 'bg-success-soft text-success-deep' },
  account_declined: { icon: ShieldCheck, label: 'Account', tone: 'bg-danger-soft text-danger-deep' },
  leave_approved: { icon: CheckCheck, label: 'Leave', tone: 'bg-success-soft text-success-deep' },
  leave_declined: { icon: CheckCheck, label: 'Leave', tone: 'bg-danger-soft text-danger-deep' },
  overtime_approved: { icon: Coins, label: 'Overtime', tone: 'bg-success-soft text-success-deep' },
  overtime_declined: { icon: Coins, label: 'Overtime', tone: 'bg-danger-soft text-danger-deep' },
  task_assigned: { icon: ClipboardList, label: 'Task', tone: 'bg-brand-50 text-brand-700' },
  task_deadline_reminder: { icon: ClipboardList, label: 'Task', tone: 'bg-warning-soft text-warning-deep' },
  task_feedback: { icon: ClipboardList, label: 'Task', tone: 'bg-brand-50 text-brand-700' },
  salary_published: { icon: Coins, label: 'Salary', tone: 'bg-brand-50 text-brand-700' },
  announcement: { icon: Megaphone, label: 'Announcement', tone: 'bg-brand-50 text-brand-700' },
  holiday_notice: { icon: CalendarDays, label: 'Holiday', tone: 'bg-brand-50 text-brand-700' },
  attendance_notice: { icon: Info, label: 'Attendance', tone: 'bg-warning-soft text-warning-deep' },
  roster_update: { icon: CalendarDays, label: 'Roster', tone: 'bg-brand-50 text-brand-700' },
  shift_change: { icon: CalendarDays, label: 'Roster', tone: 'bg-brand-50 text-brand-700' },
  off_day_change: { icon: CalendarDays, label: 'Roster', tone: 'bg-brand-50 text-brand-700' },
  individual_message: { icon: UserRound, label: 'Message', tone: 'bg-brand-50 text-brand-700' },
  profile_request: { icon: ShieldCheck, label: 'Profile', tone: 'bg-slate-100 text-slate-600' },
};

export default function NotificationsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useNotifications();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error) => {
      toast.error('Could not update', error instanceof ApiError ? error.message : 'Please try again.');
    },
  });

  const markAll = useMutation({
    mutationFn: (scope?: string) => api.post(`/notifications/read-all${scope ? `?scope=${scope}` : ''}`),
    onSuccess: () => {
      toast.success('Notifications marked as read');
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const items = (data?.items ?? []).filter((item) => (filter === 'unread' ? !item.readAt : true));

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <CountCard
          icon={<Bell className="h-4 w-4" />}
          label="Unread notifications"
          value={data?.unread ?? 0}
          tone="brand"
        />
        <CountCard
          icon={<CalendarDays className="h-4 w-4" />}
          label="Roster updates"
          value={data?.unreadRoster ?? 0}
          tone="warning"
        />
        <CountCard
          icon={<BellOff className="h-4 w-4" />}
          label="Total received"
          value={data?.items.length ?? 0}
          tone="neutral"
        />
      </div>

      <Card>
        <CardHeader
          title="Notification centre"
          subtitle="Everything HR has sent you"
          icon={<Bell className="h-4 w-4" />}
          action={
            <div className="flex items-center gap-2">
              <Segmented
                size="sm"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'unread', label: 'Unread' },
                ]}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => markAll.mutate(undefined)}
                loading={markAll.isPending}
                icon={<CheckCheck className="h-3.5 w-3.5" />}
              >
                Mark all read
              </Button>
            </div>
          }
        />
        <CardBody className="px-0 pb-0 sm:px-0">
          {isLoading ? (
            <div className="space-y-2 px-5 pb-5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-16 w-full" />
              ))}
            </div>
          ) : !items.length ? (
            <EmptyState
              title="Nothing new"
              description="Roster changes, leave decisions and announcements will appear here."
              icon={<Bell className="h-5 w-5" />}
            />
          ) : (
            <ul className="divide-y divide-line/70">
              <AnimatePresence initial={false}>
                {items.map((item) => {
                  const meta = TYPE_META[item.type] ?? {
                    icon: Bell,
                    label: 'Notice',
                    tone: 'bg-slate-100 text-slate-600',
                  };
                  const Icon = meta.icon;
                  const unread = !item.readAt;
                  return (
                    <motion.li
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className={cn('flex gap-3 px-5 py-4 transition-colors', unread && 'bg-brand-50/40')}
                    >
                      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', meta.tone)}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[13.5px] font-bold text-ink">{item.title}</p>
                          <Badge tone="neutral">{meta.label}</Badge>
                          {unread ? <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> : null}
                        </div>
                        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">{item.body}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11.5px] text-ink-muted">
                          <span>{relativeTime(item.publishedAt)}</span>
                          {item.emailSent ? (
                            <span className="text-success-deep">Emailed</span>
                          ) : item.emailStatus === 'not_required' ? null : (
                            <span>Portal only</span>
                          )}
                        </div>
                      </div>
                      {unread ? (
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => markRead.mutate(item.id)}
                          loading={markRead.isPending && markRead.variables === item.id}
                        >
                          Read
                        </Button>
                      ) : null}
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function CountCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: 'brand' | 'warning' | 'neutral';
}) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    warning: 'bg-warning-soft text-warning-deep',
    neutral: 'bg-slate-100 text-slate-600',
  } as const;
  return (
    <div className="card card-lift p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-xl', tones[tone])}>{icon}</span>
        <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted">{label}</p>
      </div>
      <p className="mt-3 text-[24px] font-extrabold leading-none tracking-[-0.03em] text-ink tabular-nums">
        {value}
      </p>
    </div>
  );
}
