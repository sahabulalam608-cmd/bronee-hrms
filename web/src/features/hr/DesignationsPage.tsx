import { useMemo, useState } from 'react';
import { Briefcase, Pencil, Plus, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { formatNumber } from '@/lib/format';
import { Alert, Input, Select } from '@/components/ui/forms';
import { PageHeader, SectionCard, StatCard, Toggle } from '@/components/ui/primitives';
import { DataTable, FilterBar, SearchInput } from '@/components/ui/data';
import { Modal, useToast } from '@/components/ui/overlay';
import type { Department, Designation } from '@shared/types';

type Row<T> = { [K in keyof T]: T[K] };
type DesignationRow = Row<Designation>;

interface Draft {
  id?: string;
  name: string;
  departmentId: string;
  active: boolean;
}

export function DesignationsPage() {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, loading, error, reload } = useAsync<Designation[]>(() => api.hrDesignations(), []);
  const { data: departments } = useAsync<Department[]>(() => api.hrDepartments(), []);

  const departmentName = useMemo(() => {
    const map = new Map<string, string>();
    for (const dept of departments ?? []) map.set(dept.id, dept.name);
    return map;
  }, [departments]);

  const rows = useMemo(() => {
    const all = (data ?? []) as DesignationRow[];
    const needle = query.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((designation) => designation.name.toLowerCase().includes(needle));
  }, [data, query]);

  const stats = useMemo(() => {
    const all = data ?? [];
    return {
      total: all.length,
      active: all.filter((designation) => designation.active).length,
      assigned: all.reduce((sum, designation) => sum + (designation.employeeCount ?? 0), 0),
      unassigned: all.filter((designation) => (designation.employeeCount ?? 0) === 0).length,
    };
  }, [data]);

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) {
      toast.error('Designation name is required');
      return;
    }
    setSaving(true);
    try {
      await api.saveDesignation({
        id: draft.id,
        name: draft.name.trim(),
        departmentId: draft.departmentId || null,
        active: draft.active,
      });
      toast.success(draft.id ? 'Designation updated' : 'Designation created', draft.name.trim());
      setDraft(null);
      reload();
    } catch (err) {
      toast.error('Save failed', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(designation: DesignationRow, active: boolean) {
    try {
      await api.saveDesignation({
        id: designation.id,
        name: designation.name,
        departmentId: designation.departmentId,
        active,
      });
      toast.success(active ? 'Designation activated' : 'Designation deactivated', designation.name);
      reload();
    } catch (err) {
      toast.error('Update failed', err instanceof Error ? err.message : undefined);
    }
  }

  const columns = [
    {
      key: 'name',
      header: 'Designation',
      render: (designation: DesignationRow) => (
        <span className="text-[13.5px] font-medium text-ink">{designation.name}</span>
      ),
    },
    {
      key: 'departmentId',
      header: 'Department',
      render: (designation: DesignationRow) => (
        <span className="text-[13px] text-ink-soft">
          {designation.departmentId ? departmentName.get(designation.departmentId) ?? '—' : 'All departments'}
        </span>
      ),
    },
    {
      key: 'employeeCount',
      header: 'Employees',
      align: 'right' as const,
      render: (designation: DesignationRow) => (
        <span className="text-[13px] text-ink-muted">{designation.employeeCount ?? 0}</span>
      ),
    },
    {
      key: 'toggle',
      header: 'Active',
      render: (designation: DesignationRow) => (
        <div className="w-[150px]">
          <Toggle
            checked={designation.active}
            onChange={(next) => toggleActive(designation, next)}
            label="Active"
            description={designation.active ? 'Selectable on records' : 'Hidden from new records'}
          />
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right' as const,
      render: (designation: DesignationRow) => (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="btn-icon h-8 w-8"
            onClick={() =>
              setDraft({
                id: designation.id,
                name: designation.name,
                departmentId: designation.departmentId ?? '',
                active: designation.active,
              })
            }
            aria-label={`Edit ${designation.name}`}
          >
            <Pencil size={15} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Designation Management"
        subtitle="Job designations available to employees and used across employee records and payroll."
        actions={
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={() => setDraft({ name: '', departmentId: '', active: true })}
          >
            <Plus size={15} />
            New designation
          </button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Designations" value={formatNumber(stats.total)} icon={<Briefcase size={17} />} />
        <StatCard label="Active" value={formatNumber(stats.active)} tone="ok" />
        <StatCard
          label="Employees assigned"
          value={formatNumber(stats.assigned)}
          tone="info"
          icon={<Users size={17} />}
        />
        <StatCard label="Without employees" value={formatNumber(stats.unassigned)} tone="warn" />
      </div>

      {error && (
        <Alert tone="bad" title="Could not load designations">
          {error}
        </Alert>
      )}

      <SectionCard
        title="Designation list"
        subtitle={`${rows.length} of ${stats.total} designations shown`}
        padded={false}
      >
        <div className="border-b border-line p-4">
          <FilterBar>
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search designations"
              className="min-w-[240px] flex-1"
            />
          </FilterBar>
        </div>
        <DataTable<DesignationRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={loading}
          emptyTitle="No designations found"
          emptyDescription="Create a designation so employees can be assigned to it during signup."
          emptyIcon={<Briefcase size={22} />}
        />
      </SectionCard>

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Edit designation' : 'New designation'}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setDraft(null)} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : draft?.id ? 'Save changes' : 'Create'}
            </button>
          </>
        }
      >
        {draft && (
          <div className="space-y-4">
            <Input
              label="Designation name"
              value={draft.name}
              required
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <Select
              label="Department"
              value={draft.departmentId}
              placeholder="All departments"
              options={(departments ?? [])
                .filter((dept) => !dept.parentId)
                .map((dept) => ({ value: dept.id, label: dept.name }))}
              onChange={(e) => setDraft({ ...draft, departmentId: e.target.value })}
              hint="Leave empty to make the designation available in every department."
            />
            <div className="rounded-xl border border-line px-4 py-3">
              <Toggle
                checked={draft.active}
                onChange={(active) => setDraft({ ...draft, active })}
                label="Active"
                description="Inactive designations stay on historical records but cannot be selected."
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
