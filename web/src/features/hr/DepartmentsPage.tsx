import { useMemo, useState } from 'react';
import {
  Building2,
  ChevronDown,
  ChevronUp,
  FolderTree,
  Lock,
  Pencil,
  Plus,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { formatNumber } from '@/lib/format';
import { Alert, Input, Select } from '@/components/ui/forms';
import { Badge, PageHeader, SectionCard, StatCard, Toggle } from '@/components/ui/primitives';
import { Modal, useToast } from '@/components/ui/overlay';
import { useAuth } from '@/features/auth/AuthProvider';
import type { Department } from '@shared/types';

type Row<T> = { [K in keyof T]: T[K] };
type DeptRow = Row<Department>;

interface Draft {
  id?: string;
  name: string;
  parentId: string;
  displayOrder: number;
  active: boolean;
}

export function DepartmentsPage() {
  const toast = useToast();
  const { user } = useAuth();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, loading, error, reload } = useAsync<Department[]>(() => api.hrDepartments(), []);

  const canReorderProtected = user?.permissions.includes('department.protected.reorder') ?? false;

  const tree = useMemo(() => {
    const all = (data ?? []) as DeptRow[];
    const parents = all
      .filter((dept) => !dept.parentId)
      .sort((a, b) => a.displayOrder - b.displayOrder);
    const children = all
      .filter((dept) => dept.parentId)
      .sort((a, b) => a.displayOrder - b.displayOrder);
    return parents.map((parent) => ({
      parent,
      children: children.filter((child) => child.parentId === parent.id),
    }));
  }, [data]);

  const stats = useMemo(() => {
    const all = data ?? [];
    return {
      total: all.filter((dept) => !dept.parentId).length,
      sub: all.filter((dept) => dept.parentId).length,
      inactive: all.filter((dept) => !dept.active).length,
      employees: all.reduce((sum, dept) => sum + (dept.employeeCount ?? 0), 0),
    };
  }, [data]);

  /** Flat order used by the backend: parents first, then each parent's sub-departments. */
  function flatOrder(parents: DeptRow[], childrenByParent: Map<string, DeptRow[]>): string[] {
    const ids: string[] = [];
    for (const parent of parents) {
      ids.push(parent.id);
      for (const child of childrenByParent.get(parent.id) ?? []) ids.push(child.id);
    }
    return ids;
  }

  function normaliseProtected(parents: DeptRow[]): DeptRow[] {
    const protectedDepts = parents.filter((dept) => dept.protected);
    const regular = parents.filter((dept) => !dept.protected);
    const ordered = [...protectedDepts].sort((a, b) => a.displayOrder - b.displayOrder);
    return [...regular, ...ordered];
  }

  async function move(kind: 'parent' | 'child', id: string, direction: -1 | 1) {
    const parents = tree.map((node) => node.parent);
    const childrenByParent = new Map<string, DeptRow[]>(
      tree.map((node) => [node.parent.id, node.children] as const),
    );

    if (kind === 'parent') {
      const target = parents.find((dept) => dept.id === id);
      if (!target) return;
      if (target.protected && !canReorderProtected) {
        toast.warning('Protected ordering', 'HR and CEO can only be reordered with the Super Admin permission.');
        return;
      }
      const index = parents.indexOf(target);
      const next = index + direction;
      if (next < 0 || next >= parents.length) return;
      const swap = [...parents];
      [swap[index], swap[next]] = [swap[next], swap[index]];
      const ordered = normaliseProtected(swap);
      const orderedChildren = new Map(childrenByParent);
      await persist(ordered, orderedChildren);
      return;
    }

    for (const [parentId, siblings] of childrenByParent) {
      const index = siblings.findIndex((dept) => dept.id === id);
      if (index === -1) continue;
      const next = index + direction;
      if (next < 0 || next >= siblings.length) return;
      const swap = [...siblings];
      [swap[index], swap[next]] = [swap[next], swap[index]];
      const orderedChildren = new Map(childrenByParent);
      orderedChildren.set(parentId, swap);
      await persist(parents, orderedChildren);
      return;
    }
  }

  async function persist(parents: DeptRow[], childrenByParent: Map<string, DeptRow[]>) {
    try {
      await api.reorderDepartments(flatOrder(parents, childrenByParent));
      toast.success('Display order updated');
      reload();
    } catch (err) {
      toast.error('Reorder failed', err instanceof Error ? err.message : undefined);
    }
  }

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) {
      toast.error('Department name is required');
      return;
    }
    setSaving(true);
    try {
      await api.saveDepartment({
        id: draft.id,
        name: draft.name.trim(),
        parentId: draft.parentId || null,
        displayOrder: draft.displayOrder,
        active: draft.active,
      });
      toast.success(draft.id ? 'Department updated' : 'Department created', draft.name.trim());
      setDraft(null);
      reload();
    } catch (err) {
      toast.error('Save failed', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(dept: DeptRow, active: boolean) {
    try {
      await api.saveDepartment({
        id: dept.id,
        name: dept.name,
        parentId: dept.parentId,
        displayOrder: dept.displayOrder,
        active,
      });
      toast.success(active ? 'Department activated' : 'Department deactivated', dept.name);
      reload();
    } catch (err) {
      toast.error('Update failed', err instanceof Error ? err.message : undefined);
    }
  }

  const parentOptions = tree.map((node) => ({ value: node.parent.id, label: node.parent.name }));

  function renderRow(
    dept: DeptRow,
    isChild: boolean,
    index: number,
    siblingCount: number,
    serial: string,
  ) {
    const locked = dept.protected && !canReorderProtected;
    return (
      <li
        key={dept.id}
        className={`flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 ${isChild ? 'bg-surface-raised/60' : ''}`}
      >
        {isChild ? (
          <span className="w-5 shrink-0 text-ink-faint" aria-hidden="true">
            ↳
          </span>
        ) : (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
            <Building2 size={15} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[13.5px] font-medium text-ink">
            <span className="truncate">{dept.name}</span>
            {dept.protected && (
              <Badge tone="brand">
                <Lock size={11} />
                Protected
              </Badge>
            )}
            {!dept.active && <Badge tone="neutral">Inactive</Badge>}
          </p>
          <p className="mt-0.5 text-[12px] text-ink-faint">
            {isChild ? 'Sub-department' : 'Department'} · order {serial} ·{' '}
            {dept.employeeCount ?? 0} employees
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="w-[230px]">
            <Toggle
              checked={dept.active}
              onChange={(next) => toggleActive(dept, next)}
              label="Active"
              description={dept.active ? 'Visible on signup forms' : 'Hidden from signup forms'}
              disabled={dept.protected}
            />
          </div>
          <button
            type="button"
            className="btn-icon h-8 w-8"
            onClick={() => move(isChild ? 'child' : 'parent', dept.id, -1)}
            disabled={index === 0 || locked}
            aria-label={`Move ${dept.name} up`}
          >
            <ChevronUp size={16} />
          </button>
          <button
            type="button"
            className="btn-icon h-8 w-8"
            onClick={() => move(isChild ? 'child' : 'parent', dept.id, 1)}
            disabled={index === siblingCount - 1 || locked}
            aria-label={`Move ${dept.name} down`}
          >
            <ChevronDown size={16} />
          </button>
          <button
            type="button"
            className="btn-icon h-8 w-8"
            onClick={() =>
              setDraft({
                id: dept.id,
                name: dept.name,
                parentId: dept.parentId ?? '',
                displayOrder: dept.displayOrder,
                active: dept.active,
              })
            }
            aria-label={`Edit ${dept.name}`}
          >
            <Pencil size={15} />
          </button>
        </div>
      </li>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Department Management"
        subtitle="Department and sub-department structure, display order and activation state."
        actions={
          <>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() =>
                setDraft({
                  name: '',
                  parentId: parentOptions[0]?.value ?? '',
                  displayOrder: tree.length + 1,
                  active: true,
                })
              }
            >
              <FolderTree size={15} />
              Add sub-department
            </button>
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() =>
                setDraft({ name: '', parentId: '', displayOrder: tree.length + 1, active: true })
              }
            >
              <Plus size={15} />
              Add department
            </button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Departments" value={formatNumber(stats.total)} icon={<Building2 size={17} />} />
        <StatCard
          label="Sub-departments"
          value={formatNumber(stats.sub)}
          tone="info"
          hint="Under their parent department"
        />
        <StatCard label="Inactive" value={formatNumber(stats.inactive)} tone="warn" hint="Hidden from signup" />
        <StatCard
          label="Employees covered"
          value={formatNumber(stats.employees)}
          tone="ok"
          icon={<Users size={17} />}
        />
      </div>

      {error && (
        <Alert tone="bad" title="Could not load departments">
          {error}
        </Alert>
      )}

      <SectionCard
        title="Department structure"
        subtitle="Reorder with the arrows — the display order is used on the employee signup form."
        padded={false}
      >
        {loading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-12 w-full" />
            ))}
          </div>
        ) : tree.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-ink-faint">No departments configured yet.</p>
        ) : (
          <ul>
            {tree.map((node, parentIndex) => (
              <li key={node.parent.id}>
                <ul>
                  {renderRow(node.parent, false, parentIndex, tree.length, String(node.parent.displayOrder))}
                </ul>
                {node.children.length > 0 && (
                  <ul>
                    {node.children.map((child, childIndex) =>
                      renderRow(
                        child,
                        true,
                        childIndex,
                        node.children.length,
                        `${node.parent.displayOrder}.${childIndex + 1}`,
                      ),
                    )}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Edit department' : 'New department'}
        description="Departments with employees are deactivated instead of deleted, so historical records stay intact."
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
              label="Name"
              value={draft.name}
              required
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <Select
              label="Parent department"
              value={draft.parentId}
              placeholder="None — top-level department"
              options={parentOptions}
              onChange={(e) => setDraft({ ...draft, parentId: e.target.value })}
              hint="Leave empty to create a top-level department."
            />
            {!draft.id && (
              <Input
                label="Display order"
                type="number"
                min={1}
                value={draft.displayOrder}
                onChange={(e) => setDraft({ ...draft, displayOrder: Number(e.target.value) || 1 })}
                hint="You can also reorder later with the up and down arrows."
              />
            )}
            <div className="rounded-xl border border-line px-4 py-3">
              <Toggle
                checked={draft.active}
                onChange={(active) => setDraft({ ...draft, active })}
                label="Active"
                description="Only active departments and sub-departments appear on the employee signup form."
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
