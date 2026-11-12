import { useMemo, useState } from 'react';
import {
  CalendarClock,
  Clock,
  Home,
  MapPin,
  Pencil,
  Plus,
  Split,
  Sunrise,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/TopBar';
import {
  Badge,
  Button,
  Card,
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
import { useHrShifts, useInvalidate } from '@/lib/queries';
import type { Shift } from '@bronee/shared';
import { cn, shiftColor } from '@/lib/utils';

type ShiftForm = {
  code: string;
  name: string;
  shortName: string;
  startTime: string;
  endTime: string;
  endsNextDay: boolean;
  locationPolicy: 'office' | 'wfh' | 'split';
  requiresOfficeVerification: boolean;
  displayOrder: string;
  isActive: boolean;
};

const LOCATION_META: Record<string, { label: string; tone: BadgeTone; icon: typeof MapPin }> = {
  office: { label: 'Office', tone: 'brand', icon: MapPin },
  wfh: { label: 'Work from home', tone: 'info', icon: Home },
  split: { label: 'Split shift', tone: 'warning', icon: Split },
};

const EMPTY_FORM: ShiftForm = {
  code: '',
  name: '',
  shortName: '',
  startTime: '09:20',
  endTime: '18:00',
  endsNextDay: false,
  locationPolicy: 'office',
  requiresOfficeVerification: true,
  displayOrder: '99',
  isActive: true,
};

function toForm(shift: Shift): ShiftForm {
  return {
    code: shift.code,
    name: shift.name,
    shortName: shift.shortName,
    startTime: shift.startTime,
    endTime: shift.endTime,
    endsNextDay: shift.endsNextDay,
    locationPolicy: shift.locationPolicy,
    requiresOfficeVerification: shift.requiresOfficeVerification,
    displayOrder: String(shift.displayOrder),
    isActive: shift.isActive,
  };
}

export default function HrShiftsPage() {
  const toast = useToast();
  const invalidate = useInvalidate();
  const shiftsQuery = useHrShifts();

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Shift | null>(null);
  const [createForm, setCreateForm] = useState<ShiftForm>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<ShiftForm | null>(null);
  const [busy, setBusy] = useState(false);

  const shifts = shiftsQuery.data?.items ?? [];

  const sorted = useMemo(
    () => [...shifts].sort((a, b) => a.displayOrder - b.displayOrder),
    [shifts],
  );

  async function createShift() {
    if (!createForm.code.trim() || !createForm.name.trim() || !createForm.shortName.trim()) {
      toast.error(
        'Shift details missing',
        'A shift needs a code, a full name and a short name before it can be saved.',
      );
      return;
    }
    setBusy(true);
    try {
      const order = Number(createForm.displayOrder);
      await api.post('/hr/shifts', {
        code: createForm.code.trim(),
        name: createForm.name.trim(),
        shortName: createForm.shortName.trim(),
        startTime: createForm.startTime,
        endTime: createForm.endTime,
        endsNextDay: createForm.endsNextDay,
        locationPolicy: createForm.locationPolicy,
        requiresOfficeVerification: createForm.requiresOfficeVerification,
        displayOrder: Number.isFinite(order) ? order : 99,
        isActive: createForm.isActive,
      });
      toast.success('Shift created', `${createForm.name.trim()} is available in the roster builder.`);
      invalidate([['hr', 'shifts'], ['meta', 'shifts']]);
      setCreateOpen(false);
      setCreateForm(EMPTY_FORM);
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'The shift could not be created.';
      toast.error('Create failed', message);
    } finally {
      setBusy(false);
    }
  }

  async function saveShift() {
    if (!editing || !editForm) return;
    setBusy(true);
    try {
      const order = Number(editForm.displayOrder);
      await api.patch(`/hr/shifts/${editing.id}`, {
        name: editForm.name.trim(),
        shortName: editForm.shortName.trim(),
        startTime: editForm.startTime,
        endTime: editForm.endTime,
        endsNextDay: editForm.endsNextDay,
        locationPolicy: editForm.locationPolicy,
        requiresOfficeVerification: editForm.requiresOfficeVerification,
        displayOrder: Number.isFinite(order) ? order : editing.displayOrder,
        isActive: editForm.isActive,
      });
      toast.success('Shift updated', `${editForm.name.trim()} now runs ${editForm.startTime}–${editForm.endTime}.`);
      invalidate([['hr', 'shifts'], ['meta', 'shifts']]);
      setEditing(null);
      setEditForm(null);
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'The shift could not be updated.';
      toast.error('Update failed', message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Shift Management"
        description="The BRONEE shift catalogue — timings, location policy and office verification rules."
        action={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
            New shift
          </Button>
        }
      />

      {shiftsQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-40" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <Card>
          <EmptyState
            title="No shifts configured"
            description="Create the shift catalogue before building rosters."
            icon={<CalendarClock className="h-5 w-5" />}
            action={
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
                New shift
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {sorted.map((shift) => {
            const colors = shiftColor(shift.code);
            const location = LOCATION_META[shift.locationPolicy] ?? LOCATION_META.office;
            const LocationIcon = location.icon;
            return (
              <Card key={shift.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[12px] font-extrabold',
                        colors.bg,
                        colors.text,
                      )}
                    >
                      {shift.code}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[14.5px] font-bold text-ink">{shift.name}</p>
                      <p className="truncate text-[12.5px] text-ink-muted">{shift.shortName}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Badge tone={location.tone}>
                      <LocationIcon className="h-3 w-3" />
                      {location.label}
                    </Badge>
                    {!shift.isActive ? <Badge tone="danger">Inactive</Badge> : null}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-canvas px-3 py-2.5">
                    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.07em] text-ink-muted">
                      <Clock className="h-3.5 w-3.5" />
                      Timing
                    </p>
                    <p className="mt-1 text-[14px] font-bold text-ink">
                      {shift.startTime} – {shift.endTime}
                    </p>
                    <p className="text-[11.5px] text-ink-muted">
                      {shift.endsNextDay ? 'Runs into the next calendar day' : 'Same-day shift'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-canvas px-3 py-2.5">
                    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.07em] text-ink-muted">
                      <Sunrise className="h-3.5 w-3.5" />
                      Verification
                    </p>
                    <p className="mt-1 text-[14px] font-bold text-ink">
                      {shift.requiresOfficeVerification ? 'Office required' : 'Not required'}
                    </p>
                    <p className="text-[11.5px] text-ink-muted">
                      {shift.requiresOfficeVerification
                        ? 'Office IP or GPS geofence must pass'
                        : 'Remote attendance is accepted'}
                    </p>
                  </div>
                </div>

                {shift.segments && shift.segments.length ? (
                  <div className="mt-3 rounded-xl border border-line p-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-muted">
                      Segments
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {shift.segments.map((segment) => (
                        <li
                          key={segment.key}
                          className="flex items-center justify-between gap-2 text-[12.5px]"
                        >
                          <span className="font-semibold text-ink">{segment.label}</span>
                          <span className="text-ink-muted">
                            {segment.startTime} – {segment.endTime}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="mt-4 flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Pencil className="h-3.5 w-3.5" />}
                    onClick={() => {
                      setEditing(shift);
                      setEditForm(toForm(shift));
                    }}
                  >
                    Edit shift
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ---------------------------------------------------------- create modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New shift"
        description="Shifts become selectable options in the roster builder."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={busy} onClick={createShift}>
              Create shift
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Shift code"
            value={createForm.code}
            onChange={(event) => setCreateForm({ ...createForm, code: event.target.value })}
            placeholder="e.g. NS"
            hint="Short uppercase code used on rosters."
          />
          <Input
            label="Display order"
            type="number"
            min={0}
            max={999}
            value={createForm.displayOrder}
            onChange={(event) => setCreateForm({ ...createForm, displayOrder: event.target.value })}
          />
          <Input
            label="Full name"
            value={createForm.name}
            onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })}
            placeholder="e.g. Night Shift"
          />
          <Input
            label="Short name"
            value={createForm.shortName}
            onChange={(event) => setCreateForm({ ...createForm, shortName: event.target.value })}
            placeholder="e.g. Night"
          />
          <Input
            label="Start time"
            type="time"
            value={createForm.startTime}
            onChange={(event) => setCreateForm({ ...createForm, startTime: event.target.value })}
          />
          <Input
            label="End time"
            type="time"
            value={createForm.endTime}
            onChange={(event) => setCreateForm({ ...createForm, endTime: event.target.value })}
          />
          <Select
            label="Location policy"
            value={createForm.locationPolicy}
            onChange={(event) =>
              setCreateForm({
                ...createForm,
                locationPolicy: event.target.value as ShiftForm['locationPolicy'],
              })
            }
            options={[
              { value: 'office', label: 'Office — verification required' },
              { value: 'wfh', label: 'Work from home' },
              { value: 'split', label: 'Split shift' },
            ]}
          />
          <div className="flex items-center justify-between rounded-xl border border-line px-3.5 py-2.5">
            <span className="text-[13px] font-semibold text-ink">Ends next day</span>
            <Switch
              checked={createForm.endsNextDay}
              onChange={(next) => setCreateForm({ ...createForm, endsNextDay: next })}
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-line px-3.5 py-2.5">
            <span className="text-[13px] font-semibold text-ink">Office verification</span>
            <Switch
              checked={createForm.requiresOfficeVerification}
              onChange={(next) =>
                setCreateForm({ ...createForm, requiresOfficeVerification: next })
              }
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-line px-3.5 py-2.5">
            <span className="text-[13px] font-semibold text-ink">Active</span>
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
        title="Edit shift"
        description={editing ? `${editing.code} · ${editing.name}` : undefined}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button size="sm" loading={busy} onClick={saveShift}>
              Save changes
            </Button>
          </>
        }
      >
        {editForm ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Full name"
              value={editForm.name}
              onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
            />
            <Input
              label="Short name"
              value={editForm.shortName}
              onChange={(event) => setEditForm({ ...editForm, shortName: event.target.value })}
            />
            <Input
              label="Start time"
              type="time"
              value={editForm.startTime}
              onChange={(event) => setEditForm({ ...editForm, startTime: event.target.value })}
            />
            <Input
              label="End time"
              type="time"
              value={editForm.endTime}
              onChange={(event) => setEditForm({ ...editForm, endTime: event.target.value })}
            />
            <Select
              label="Location policy"
              value={editForm.locationPolicy}
              onChange={(event) =>
                setEditForm({
                  ...editForm,
                  locationPolicy: event.target.value as ShiftForm['locationPolicy'],
                })
              }
              options={[
                { value: 'office', label: 'Office — verification required' },
                { value: 'wfh', label: 'Work from home' },
                { value: 'split', label: 'Split shift' },
              ]}
            />
            <Input
              label="Display order"
              type="number"
              min={0}
              max={999}
              value={editForm.displayOrder}
              onChange={(event) => setEditForm({ ...editForm, displayOrder: event.target.value })}
            />
            <div className="flex items-center justify-between rounded-xl border border-line px-3.5 py-2.5">
              <span className="text-[13px] font-semibold text-ink">Ends next day</span>
              <Switch
                checked={editForm.endsNextDay}
                onChange={(next) => setEditForm({ ...editForm, endsNextDay: next })}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-line px-3.5 py-2.5">
              <span className="text-[13px] font-semibold text-ink">Office verification</span>
              <Switch
                checked={editForm.requiresOfficeVerification}
                onChange={(next) =>
                  setEditForm({ ...editForm, requiresOfficeVerification: next })
                }
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-line px-3.5 py-2.5">
              <span className="text-[13px] font-semibold text-ink">Active</span>
              <Switch
                checked={editForm.isActive}
                onChange={(next) => setEditForm({ ...editForm, isActive: next })}
              />
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
