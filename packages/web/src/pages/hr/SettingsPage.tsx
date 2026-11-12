import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CalendarClock,
  KeyRound,
  Pencil,
  Plus,
  Settings2,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/TopBar';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Input,
  Modal,
  Select,
  Skeleton,
  Switch,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useToast,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useHrDepartments, useHrOfficeNetwork, useHrSettings, useHrShifts, useHrStaffingRules, useInvalidate } from '@/lib/queries';
import { formatDhakaDateTime } from '@bronee/shared';

const WEEKDAYS = [
  { value: '', label: 'Every day' },
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
];

type SettingRow = NonNullable<ReturnType<typeof useHrSettings>['data']>['items'][number];
type StaffingRule = NonNullable<ReturnType<typeof useHrStaffingRules>['data']>['items'][number];

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

export default function HrSettingsPage() {
  const toast = useToast();
  const invalidate = useInvalidate();

  const settingsQuery = useHrSettings();
  const networkQuery = useHrOfficeNetwork();
  const rulesQuery = useHrStaffingRules();
  const departmentsQuery = useHrDepartments();
  const shiftsQuery = useHrShifts();

  const [editing, setEditing] = useState<SettingRow | null>(null);
  const [valueDraft, setValueDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const [ruleOpen, setRuleOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState({
    departmentId: '',
    shiftId: '',
    minStaff: '1',
    dayOfWeek: '',
    isActive: true,
  });
  const [deleteTarget, setDeleteTarget] = useState<StaffingRule | null>(null);

  const settings = settingsQuery.data?.items ?? [];
  const rules = rulesQuery.data?.items ?? [];
  const departments = departmentsQuery.data?.items ?? [];
  const shifts = shiftsQuery.data?.items ?? [];

  const departmentName = useMemo(() => {
    const map = new Map(departments.map((department) => [department.id, department.name]));
    return (id: string) => map.get(id) ?? 'Unknown department';
  }, [departments]);

  const shiftName = useMemo(() => {
    const map = new Map(shifts.map((shift) => [shift.id, shift.shortName]));
    return (id: string | null) => (id ? (map.get(id) ?? 'Unknown shift') : 'Any shift');
  }, [shifts]);

  useEffect(() => {
    if (!editing) return;
    setValueDraft(
      typeof editing.value === 'string' ? editing.value : JSON.stringify(editing.value, null, 2),
    );
  }, [editing]);

  async function saveSetting() {
    if (!editing) return;
    setBusy(true);
    try {
      let parsed: unknown = valueDraft;
      try {
        parsed = JSON.parse(valueDraft);
      } catch {
        parsed = valueDraft;
      }
      await api.post('/hr/system/settings', { key: editing.key, value: parsed });
      toast.success('Setting saved', `${editing.key} was updated.`);
      invalidate([['hr', 'settings']]);
      setEditing(null);
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'The setting could not be saved.';
      toast.error('Update failed', message);
    } finally {
      setBusy(false);
    }
  }

  async function createRule() {
    if (!ruleForm.departmentId) {
      toast.error('Department required', 'Choose the department this rule applies to.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/hr/system/staffing-rules', {
        departmentId: ruleForm.departmentId,
        shiftId: ruleForm.shiftId || null,
        minStaff: Number(ruleForm.minStaff) || 0,
        dayOfWeek: ruleForm.dayOfWeek === '' ? null : Number(ruleForm.dayOfWeek),
        isActive: ruleForm.isActive,
      });
      toast.success('Staffing rule saved', 'The roster builder will now flag understaffed days.');
      invalidate([['hr', 'staffing-rules'], ['hr', 'roster']]);
      setRuleOpen(false);
      setRuleForm({
        departmentId: '',
        shiftId: '',
        minStaff: '1',
        dayOfWeek: '',
        isActive: true,
      });
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : 'The staffing rule could not be saved.';
      toast.error('Save failed', message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteRule() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api.delete(`/hr/system/staffing-rules/${deleteTarget.id}`);
      toast.success('Staffing rule removed', 'The rule no longer applies.');
      invalidate([['hr', 'staffing-rules'], ['hr', 'roster']]);
      setDeleteTarget(null);
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : 'The staffing rule could not be removed.';
      toast.error('Delete failed', message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Company Settings"
        description="BRONEE configuration — office verification thresholds, company keys and roster staffing rules."
        action={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setRuleOpen(true)}>
            New staffing rule
          </Button>
        }
      />

      {/* --------------------------------------------------- office verification */}
      <Card>
        <CardHeader
          title="Office verification"
          subtitle="Thresholds applied to every punch-in attempt across the workforce."
          icon={<ShieldCheck className="h-4 w-4" />}
        />
        <CardBody>
          {networkQuery.isLoading ? (
            <Skeleton className="h-24" />
          ) : networkQuery.isError ? (
            <p className="rounded-xl bg-warning-soft/60 px-3.5 py-3 text-[12.5px] font-medium text-warning-deep">
              Office verification settings are managed by a Super Admin. The values are read from
              the platform configuration and cannot be edited from this screen.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: 'Geofence radius',
                  value: `${networkQuery.data?.geofenceMeters ?? 0} m`,
                  hint: 'Maximum distance from the office coordinates.',
                },
                {
                  label: 'GPS accuracy limit',
                  value: `${networkQuery.data?.maxAccuracyMeters ?? 0} m`,
                  hint: 'Fixes wider than this fail verification.',
                },
                {
                  label: 'Verification window',
                  value: `${networkQuery.data?.verificationWindowMinutes ?? 0} min`,
                  hint: 'Measured from the scheduled shift start.',
                },
                {
                  label: 'Office coordinates',
                  value: `${networkQuery.data?.latitude ?? 0}, ${networkQuery.data?.longitude ?? 0}`,
                  hint: 'Centre point of the BRONEE office geofence.',
                },
              ].map((tile) => (
                <div key={tile.label} className="rounded-xl bg-canvas px-3.5 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-muted">
                    {tile.label}
                  </p>
                  <p className="mt-1 text-[16px] font-extrabold text-ink">{tile.value}</p>
                  <p className="mt-0.5 text-[11.5px] text-ink-muted">{tile.hint}</p>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* -------------------------------------------------------- company settings */}
      <Card className="mt-4">
        <CardHeader
          title="Company settings"
          subtitle="Key-value configuration shared by the API and the employee portal."
          icon={<Settings2 className="h-4 w-4" />}
        />
        {settingsQuery.isLoading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-11" />
            ))}
          </div>
        ) : settingsQuery.isError ? (
          <EmptyState
            title="Settings unavailable"
            description="Only a Super Admin can read and change company settings."
            icon={<KeyRound className="h-5 w-5" />}
          />
        ) : settings.length === 0 ? (
          <EmptyState
            title="No settings configured"
            description="Company settings appear here once they are seeded."
            icon={<KeyRound className="h-5 w-5" />}
          />
        ) : (
          <Table>
            <THead>
              <TH>Key</TH>
              <TH>Value</TH>
              <TH>Last updated</TH>
              <TH align="right">Edit</TH>
            </THead>
            <TBody>
              {settings.map((setting) => (
                <TR key={setting.key}>
                  <TD>
                    <span className="font-mono text-[12.5px] font-semibold text-ink">
                      {setting.key}
                    </span>
                  </TD>
                  <TD>
                    <pre className="max-w-[420px] overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed text-ink-soft">
                      {displayValue(setting.value)}
                    </pre>
                  </TD>
                  <TD className="whitespace-nowrap text-[12px] text-ink-muted">
                    {formatDhakaDateTime(setting.updatedAt)}
                  </TD>
                  <TD align="right">
                    <Button
                      size="xs"
                      variant="outline"
                      icon={<Pencil className="h-3.5 w-3.5" />}
                      onClick={() => setEditing(setting)}
                    >
                      Edit
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {/* ---------------------------------------------------------- staffing rules */}
      <Card className="mt-4">
        <CardHeader
          title="Staffing rules"
          subtitle="Minimum staffing per department, shift and weekday — surfaced as roster conflicts."
          icon={<Building2 className="h-4 w-4" />}
          action={
            <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => setRuleOpen(true)}>
              Add rule
            </Button>
          }
        />
        {rulesQuery.isLoading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-11" />
            ))}
          </div>
        ) : rules.length === 0 ? (
          <EmptyState
            title="No staffing rules yet"
            description="Add a rule so the roster builder warns when a department is understaffed."
            icon={<CalendarClock className="h-5 w-5" />}
            action={
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => setRuleOpen(true)}>
                Add rule
              </Button>
            }
          />
        ) : (
          <Table>
            <THead>
              <TH>Department</TH>
              <TH>Shift</TH>
              <TH>Weekday</TH>
              <TH align="right">Minimum staff</TH>
              <TH>Status</TH>
              <TH align="right">Delete</TH>
            </THead>
            <TBody>
              {rules.map((rule) => (
                <TR key={rule.id}>
                  <TD>{departmentName(rule.departmentId)}</TD>
                  <TD>{shiftName(rule.shiftId)}</TD>
                  <TD>
                    {rule.dayOfWeek == null
                      ? 'Every day'
                      : (WEEKDAYS.find((day) => day.value === String(rule.dayOfWeek))?.label ??
                        'Every day')}
                  </TD>
                  <TD align="right">{rule.minStaff}</TD>
                  <TD>
                    <Badge tone={rule.isActive ? 'success' : 'neutral'} dot>
                      {rule.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TD>
                  <TD align="right">
                    <Button
                      size="xs"
                      variant="ghost"
                      icon={<Trash2 className="h-3.5 w-3.5" />}
                      onClick={() => setDeleteTarget(rule)}
                    >
                      Remove
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {/* ---------------------------------------------------------- setting modal */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Edit setting"
        description={editing?.key}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button size="sm" loading={busy} onClick={saveSetting}>
              Save setting
            </Button>
          </>
        }
      >
        <Input
          label="Value"
          value={valueDraft}
          onChange={(event) => setValueDraft(event.target.value)}
          hint="Plain text is stored as a string. Valid JSON is stored as structured data."
        />
      </Modal>

      {/* ------------------------------------------------------------ rule modal */}
      <Modal
        open={ruleOpen}
        onClose={() => setRuleOpen(false)}
        title="New staffing rule"
        description="Warn the roster builder when a department drops below its minimum."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setRuleOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={busy} onClick={createRule}>
              Save rule
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label="Department"
            value={ruleForm.departmentId}
            onChange={(event) => setRuleForm({ ...ruleForm, departmentId: event.target.value })}
            options={[
              { value: '', label: 'Select a department' },
              ...departments.map((department) => ({
                value: department.id,
                label: department.name,
              })),
            ]}
          />
          <Select
            label="Shift"
            value={ruleForm.shiftId}
            onChange={(event) => setRuleForm({ ...ruleForm, shiftId: event.target.value })}
            options={[
              { value: '', label: 'Any shift' },
              ...shifts.map((shift) => ({ value: shift.id, label: shift.shortName })),
            ]}
          />
          <Input
            label="Minimum staff"
            type="number"
            min={0}
            max={999}
            value={ruleForm.minStaff}
            onChange={(event) => setRuleForm({ ...ruleForm, minStaff: event.target.value })}
          />
          <Select
            label="Weekday"
            value={ruleForm.dayOfWeek}
            onChange={(event) => setRuleForm({ ...ruleForm, dayOfWeek: event.target.value })}
            options={WEEKDAYS}
          />
          <div className="flex items-center justify-between rounded-xl border border-line px-3.5 py-2.5 sm:col-span-2">
            <span className="text-[13px] font-semibold text-ink">Active</span>
            <Switch
              checked={ruleForm.isActive}
              onChange={(next) => setRuleForm({ ...ruleForm, isActive: next })}
            />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteRule}
        loading={busy}
        tone="danger"
        title="Remove this staffing rule?"
        confirmLabel="Remove rule"
        message={
          deleteTarget ? (
            <span className="block">
              {departmentName(deleteTarget.departmentId)} will no longer have a minimum staffing
              requirement for {shiftName(deleteTarget.shiftId)}.
            </span>
          ) : null
        }
      />
    </div>
  );
}
