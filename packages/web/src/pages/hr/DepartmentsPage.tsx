import { useMemo, useState } from 'react';
import {
  Building2,
  ChevronRight,
  FolderPlus,
  Layers,
  Lock,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/TopBar';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  Modal,
  Select,
  Skeleton,
  Switch,
  useToast,
  type BadgeTone,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useHrDepartments, useInvalidate } from '@/lib/queries';
import { PROTECTED_DEPARTMENT_NAMES } from '@bronee/shared';
import { cn } from '@/lib/utils';

type DepartmentRow = {
  id: string;
  name: string;
  type: 'regular' | 'parent' | 'protected';
  parentId: string | null;
  displayOrder: number;
  isActive: boolean;
  employeeCount: number;
};

type DepartmentForm = {
  name: string;
  type: 'regular' | 'parent' | 'protected';
  parentId: string;
  displayOrder: string;
  isActive: boolean;
};

const TYPE_TONE: Record<string, BadgeTone> = {
  regular: 'neutral',
  parent: 'brand',
  protected: 'warning',
};

const TYPE_LABEL: Record<string, string> = {
  regular: 'Department',
  parent: 'Parent department',
  protected: 'Protected',
};

export default function HrDepartmentsPage() {
  const toast = useToast();
  const invalidate = useInvalidate();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';

  const departmentsQuery = useHrDepartments();
  const tree = departmentsQuery.data?.tree ?? [];

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<DepartmentRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DepartmentRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [createForm, setCreateForm] = useState<DepartmentForm>({
    name: '',
    type: 'regular',
    parentId: '',
    displayOrder: '99',
    isActive: true,
  });
  const [editForm, setEditForm] = useState<DepartmentForm | null>(null);

  const parentOptions = useMemo(
    () =>
      tree.map((department) => ({
        value: department.id,
        label: department.name,
      })),
    [tree],
  );

  function isProtected(name: string): boolean {
    return (PROTECTED_DEPARTMENT_NAMES as readonly string[]).includes(name);
  }

  async function createDepartment() {
    if (!createForm.name.trim()) {
      toast.error('Department name is required', 'Give the department a name before saving.');
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        name: createForm.name.trim(),
        type: createForm.type,
        isActive: createForm.isActive,
      };
      if (createForm.parentId) body.parentId = createForm.parentId;
      const order = Number(createForm.displayOrder);
      if (Number.isFinite(order)) body.displayOrder = order;

      await api.post('/hr/departments', body);
      toast.success('Department created', `${createForm.name.trim()} is now part of the org chart.`);
      invalidate([['hr', 'departments'], ['hr', 'dashboard']]);
      setCreateOpen(false);
      setCreateForm({
        name: '',
        type: 'regular',
        parentId: '',
        displayOrder: '99',
        isActive: true,
      });
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : 'The department could not be created.';
      toast.error('Create failed', message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editing || !editForm) return;
    const order = Number(editForm.displayOrder);
    const orderChanged = Number.isFinite(order) && order !== editing.displayOrder;
    const renamingToProtected =
      isProtected(editing.name) && editForm.name.trim() !== editing.name && isProtected(editForm.name);

    if ((isProtected(editing.name) || renamingToProtected) && orderChanged && !isSuperAdmin) {
      toast.error(
        'Protected department',
        'Only a Super Admin can change the display order of HR and CEO.',
      );
      return;
    }

    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        name: editForm.name.trim(),
        type: editForm.type,
        isActive: editForm.isActive,
      };
      if (Number.isFinite(order)) body.displayOrder = order;

      await api.patch(`/hr/departments/${editing.id}`, body);
      toast.success('Department updated', `${editForm.name.trim()} has been saved.`);
      invalidate([['hr', 'departments'], ['hr', 'dashboard']]);
      setEditing(null);
      setEditForm(null);
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : 'The department could not be updated.';
      toast.error('Update failed', message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(department: DepartmentRow, next: boolean) {
    try {
      await api.patch(`/hr/departments/${department.id}`, { isActive: next });
      toast.success(
        next ? 'Department activated' : 'Department deactivated',
        `${department.name} is now ${next ? 'active' : 'inactive'}.`,
      );
      invalidate([['hr', 'departments']]);
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : 'The department status could not be changed.';
      toast.error('Update failed', message);
    }
  }

  async function updateOrder(department: DepartmentRow, raw: string) {
    const order = Number(raw);
    if (!Number.isFinite(order) || order === department.displayOrder) return;
    if (isProtected(department.name) && !isSuperAdmin) {
      toast.error(
        'Protected department',
        'Only a Super Admin can change the display order of HR and CEO.',
      );
      return;
    }
    try {
      await api.patch(`/hr/departments/${department.id}`, { displayOrder: order });
      toast.success('Display order updated', `${department.name} now sits at position ${order}.`);
      invalidate([['hr', 'departments']]);
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : 'The display order could not be changed.';
      toast.error('Update failed', message);
    }
  }

  async function deleteDepartment() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api.delete(`/hr/departments/${deleteTarget.id}`);
      toast.success('Department deleted', `${deleteTarget.name} has been removed.`);
      invalidate([['hr', 'departments']]);
      setDeleteTarget(null);
    } catch (caught) {
      const message =
        caught instanceof ApiError
          ? caught.message
          : 'The department could not be deleted.';
      toast.error('Delete failed', message);
    } finally {
      setBusy(false);
    }
  }

  function openEdit(department: DepartmentRow) {
    setEditing(department);
    setEditForm({
      name: department.name,
      type: department.type,
      parentId: department.parentId ?? '',
      displayOrder: String(department.displayOrder),
      isActive: department.isActive,
    });
  }

  function renderRow(department: DepartmentRow, depth: number) {
    const protectedRow = isProtected(department.name);
    const orderLocked = protectedRow && !isSuperAdmin;

    return (
      <div
        key={department.id}
        className={cn(
          'rounded-2xl border border-line bg-white p-4',
          depth > 0 && 'bg-canvas/40',
        )}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div
            className={cn(
              'flex min-w-0 items-start gap-3',
              depth > 0 && 'pl-1',
            )}
          >
            {depth > 0 ? (
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink-muted" />
            ) : (
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Building2 className="h-4 w-4" />
              </span>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-[14.5px] font-bold text-ink">{department.name}</p>
                <Badge tone={TYPE_TONE[department.type] ?? 'neutral'}>
                  {TYPE_LABEL[department.type] ?? department.type}
                </Badge>
                {!department.isActive ? <Badge tone="danger">Inactive</Badge> : null}
                {protectedRow ? (
                  <Badge tone="warning" dot>
                    Protected
                  </Badge>
                ) : null}
              </div>
              <p className="mt-0.5 text-[12.5px] text-ink-muted">
                {department.employeeCount} employee{department.employeeCount === 1 ? '' : 's'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2">
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
                Order
              </span>
              <input
                type="number"
                min={0}
                max={999}
                defaultValue={department.displayOrder}
                disabled={orderLocked}
                onBlur={(event) => updateOrder(department, event.target.value)}
                className={cn(
                  'h-9 w-[72px] rounded-xl border border-line bg-white px-2.5 text-[13px] font-semibold text-ink',
                  'focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100',
                  orderLocked && 'cursor-not-allowed bg-canvas text-ink-muted',
                )}
              />
            </label>
            <Switch
              checked={department.isActive}
              onChange={(next) => toggleActive(department, next)}
              label={`${department.name} active`}
            />
            <Button
              size="sm"
              variant="outline"
              icon={<Pencil className="h-3.5 w-3.5" />}
              onClick={() => openEdit(department)}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 className="h-3.5 w-3.5" />}
              onClick={() => setDeleteTarget(department)}
              aria-label={`Delete ${department.name}`}
            >
              Delete
            </Button>
          </div>
        </div>

        {orderLocked ? (
          <p className="mt-2 flex items-center gap-1.5 text-[11.5px] font-medium text-warning-deep">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            HR and CEO are protected — only a Super Admin can change their display order.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Department Management"
        description="The BRONEE org chart — top-level departments and their sub-departments."
        action={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
            New department
          </Button>
        }
      />

      {departmentsQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
      ) : tree.length === 0 ? (
        <Card>
          <EmptyState
            title="No departments yet"
            description="Create the first department to start building the org chart."
            icon={<Layers className="h-5 w-5" />}
            action={
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
                New department
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {tree.map((department) => (
            <div key={department.id} className="space-y-2">
              {renderRow(department, 0)}
              {department.children.length ? (
                <div className="space-y-2 border-l-2 border-line pl-3">
                  {department.children.map((child) => renderRow(child, 1))}
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setCreateForm({
                    name: '',
                    type: 'regular',
                    parentId: department.id,
                    displayOrder: String(department.children.length + 1),
                    isActive: true,
                  });
                  setCreateOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] font-semibold text-brand-700 transition-colors hover:bg-brand-50"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                Add sub-department to {department.name}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ---------------------------------------------------------- create modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={createForm.parentId ? 'New sub-department' : 'New department'}
        description="Departments drive rosters, staffing rules and payroll groupings."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={busy} onClick={createDepartment}>
              Create department
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="Department name"
            value={createForm.name}
            onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })}
            placeholder="e.g. Courier Team"
            required
          />
          <Select
            label="Type"
            value={createForm.type}
            onChange={(event) =>
              setCreateForm({ ...createForm, type: event.target.value as DepartmentForm['type'] })
            }
            options={[
              { value: 'regular', label: 'Department' },
              { value: 'parent', label: 'Parent department (holds sub-departments)' },
              { value: 'protected', label: 'Protected (HR / CEO)' },
            ]}
          />
          <Select
            label="Parent department"
            value={createForm.parentId}
            onChange={(event) => setCreateForm({ ...createForm, parentId: event.target.value })}
            options={[{ value: '', label: 'None — top level' }, ...parentOptions]}
            hint="Leave empty to create a top-level department."
          />
          <Input
            label="Display order"
            type="number"
            min={0}
            max={999}
            value={createForm.displayOrder}
            onChange={(event) => setCreateForm({ ...createForm, displayOrder: event.target.value })}
            hint="Lower numbers appear first in every department picker."
          />
          <div className="flex items-center justify-between rounded-xl border border-line px-3.5 py-3">
            <div>
              <p className="text-[13px] font-semibold text-ink">Active</p>
              <p className="text-[12px] text-ink-muted">Inactive departments cannot be selected.</p>
            </div>
            <Switch
              checked={createForm.isActive}
              onChange={(next) => setCreateForm({ ...createForm, isActive: next })}
            />
          </div>
        </div>
      </Modal>

      {/* ----------------------------------------------------------- edit modal */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Edit department"
        description={editing?.name}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button size="sm" loading={busy} onClick={saveEdit}>
              Save changes
            </Button>
          </>
        }
      >
        {editForm ? (
          <div className="space-y-3">
            <Input
              label="Department name"
              value={editForm.name}
              onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
              required
            />
            <Select
              label="Type"
              value={editForm.type}
              onChange={(event) =>
                setEditForm({ ...editForm, type: event.target.value as DepartmentForm['type'] })
              }
              options={[
                { value: 'regular', label: 'Department' },
                { value: 'parent', label: 'Parent department (holds sub-departments)' },
                { value: 'protected', label: 'Protected (HR / CEO)' },
              ]}
            />
            <Input
              label="Display order"
              type="number"
              min={0}
              max={999}
              value={editForm.displayOrder}
              onChange={(event) => setEditForm({ ...editForm, displayOrder: event.target.value })}
              disabled={isProtected(editing?.name ?? '') && !isSuperAdmin}
              hint={
                isProtected(editing?.name ?? '') && !isSuperAdmin
                  ? 'HR and CEO are protected — only a Super Admin can change their display order.'
                  : undefined
              }
            />
            <div className="flex items-center justify-between rounded-xl border border-line px-3.5 py-3">
              <div>
                <p className="text-[13px] font-semibold text-ink">Active</p>
                <p className="text-[12px] text-ink-muted">
                  Deactivate instead of deleting to keep historical records intact.
                </p>
              </div>
              <Switch
                checked={editForm.isActive}
                onChange={(next) => setEditForm({ ...editForm, isActive: next })}
              />
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteDepartment}
        loading={busy}
        tone="danger"
        title="Delete this department?"
        confirmLabel="Delete department"
        message={
          deleteTarget ? (
            <span className="block">
              {deleteTarget.name} will be removed permanently. If it still has employees assigned, the
              API will refuse the deletion and you should deactivate it instead.
            </span>
          ) : null
        }
      />
    </div>
  );
}
