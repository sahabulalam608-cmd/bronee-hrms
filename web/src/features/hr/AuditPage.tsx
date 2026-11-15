import { useMemo, useState } from 'react';
import { ArrowRight, ScrollText, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { formatDateTime } from '@/lib/time';
import { formatNumber } from '@/lib/format';
import { Alert } from '@/components/ui/forms';
import { Badge, PageHeader, SectionCard, StatCard } from '@/components/ui/primitives';
import { DataTable, FilterBar, SearchInput } from '@/components/ui/data';
import { ROLE_LABELS } from '@shared/constants';
import type { AuditLog } from '@shared/types';

type Row<T> = { [K in keyof T]: T[K] };
type AuditRow = Row<AuditLog>;

export function AuditPage() {
  const [query, setQuery] = useState('');

  const { data, loading, error } = useAsync<AuditLog[]>(() => api.hrAuditLogs(), []);

  const rows = useMemo(() => {
    const all = (data ?? []) as AuditRow[];
    const needle = query.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((log) =>
      [log.actor, log.actorRole, log.action, log.entity, log.entityId, log.note, log.before, log.after]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [data, query]);

  const stats = useMemo(() => {
    const all = data ?? [];
    const today = new Date().toDateString();
    return {
      total: all.length,
      actors: new Set(all.map((log) => log.actor)).size,
      today: all.filter((log) => new Date(log.createdAt).toDateString() === today).length,
      entities: new Set(all.map((log) => log.entity)).size,
    };
  }, [data]);

  const columns = [
    {
      key: 'actor',
      header: 'Actor',
      render: (log: AuditRow) => (
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-medium text-ink">{log.actor}</p>
          <p className="truncate text-[11.5px] text-ink-faint">{ROLE_LABELS[log.actorRole] ?? log.actorRole}</p>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (log: AuditRow) => (
        <span className="rounded-md bg-surface-sunken px-2 py-1 font-mono text-[12px] text-ink-soft">
          {log.action}
        </span>
      ),
    },
    {
      key: 'entity',
      header: 'Entity',
      render: (log: AuditRow) => (
        <span className="text-[13px] text-ink-soft">
          {log.entity}
          {log.entityId && <span className="ml-1.5 font-mono text-[11.5px] text-ink-faint">{log.entityId}</span>}
        </span>
      ),
    },
    {
      key: 'change',
      header: 'Before → after',
      render: (log: AuditRow) => (
        <span className="flex items-center gap-1.5 text-[12.5px]">
          <span className="max-w-[180px] truncate text-ink-muted">{log.before ?? '—'}</span>
          <ArrowRight size={13} className="shrink-0 text-ink-faint" />
          <span className="max-w-[180px] truncate font-medium text-ink">{log.after ?? '—'}</span>
        </span>
      ),
    },
    {
      key: 'note',
      header: 'Note',
      render: (log: AuditRow) => (
        <span className="max-w-[240px] truncate text-[12.5px] text-ink-muted">{log.note ?? '—'}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Timestamp',
      render: (log: AuditRow) => (
        <span className="text-[12.5px] text-ink-muted">{formatDateTime(log.createdAt)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit Logs"
        subtitle="Every sensitive operation with the actor, role, before and after values and the timestamp."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Audit entries" value={formatNumber(stats.total)} icon={<ScrollText size={17} />} />
        <StatCard label="Recorded today" value={formatNumber(stats.today)} tone="warn" />
        <StatCard label="Distinct actors" value={formatNumber(stats.actors)} tone="info" icon={<ShieldCheck size={17} />} />
        <StatCard label="Affected entities" value={formatNumber(stats.entities)} tone="ok" />
      </div>

      {error && (
        <Alert tone="bad" title="Could not load the audit logs">
          {error}
        </Alert>
      )}

      <SectionCard
        title="Audit trail"
        subtitle={`${rows.length} of ${stats.total} entries shown`}
        padded={false}
      >
        <div className="border-b border-line p-4">
          <FilterBar>
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search actor, action, entity or note"
              className="min-w-[260px] flex-1"
            />
            <Badge tone="neutral">Newest first</Badge>
          </FilterBar>
        </div>
        <DataTable<AuditRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={loading}
          emptyTitle="No audit entries"
          emptyDescription="Administrative actions are recorded here as soon as they happen."
          emptyIcon={<ScrollText size={22} />}
        />
      </SectionCard>
    </div>
  );
}
