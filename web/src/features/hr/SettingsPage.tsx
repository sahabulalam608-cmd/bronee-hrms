import { useEffect, useState } from 'react';
import { Building2, Clock, Globe2, MapPin, Save, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { formatMoney, formatNumber } from '@/lib/format';
import { Alert, Input, Select, Textarea } from '@/components/ui/forms';
import { PageHeader, SectionCard, StatCard } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/overlay';
import type { CompanySettings } from '@shared/types';

const TIMEZONES = [
  'Asia/Dhaka',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Europe/London',
  'America/New_York',
];

export function SettingsPage() {
  const toast = useToast();
  const [form, setForm] = useState<CompanySettings | null>(null);
  const [ips, setIps] = useState('');
  const [saving, setSaving] = useState(false);

  const { data, loading, error, reload } = useAsync<CompanySettings>(() => api.hrSettings(), []);

  useEffect(() => {
    if (!data) return;
    setForm(data);
    setIps(data.officePublicIps.join('\n'));
  }, [data]);

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const saved = await api.saveSettings({
        ...form,
        officePublicIps: ips
          .split('\n')
          .map((value) => value.trim())
          .filter(Boolean),
      });
      setForm(saved);
      setIps(saved.officePublicIps.join('\n'));
      toast.success('Settings saved', 'Company settings are now active for the whole platform.');
      reload();
    } catch (err) {
      toast.error('Could not save the settings', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Company Settings"
        subtitle="Office verification, overtime rate, payroll approver and attendance grace period."
        actions={
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={save}
            disabled={saving || !form}
          >
            <Save size={15} />
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        }
      />

      {error && (
        <Alert tone="bad" title="Could not load the company settings">
          {error}
        </Alert>
      )}

      {loading && <div className="skeleton h-64 w-full rounded-2xl" />}

      {form && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Company" value={form.companyName} icon={<Building2 size={17} />} />
            <StatCard label="Timezone" value={form.timezone} tone="info" icon={<Globe2 size={17} />} />
            <StatCard
              label="Geofence radius"
              value={`${formatNumber(form.geofenceRadiusM)} m`}
              tone="warn"
              icon={<MapPin size={17} />}
            />
            <StatCard
              label="Overtime rate"
              value={`${formatMoney(form.otRatePerHour)}/h`}
              tone="ok"
              icon={<Wallet size={17} />}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title="Company" subtitle="Identity and time zone used by every calculation">
              <div className="space-y-4">
                <Input
                  label="Company name"
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                />
                <Select
                  label="Timezone"
                  value={form.timezone}
                  options={TIMEZONES.map((value) => ({ value, label: value }))}
                  onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                  hint="All attendance, roster and payroll calculations use this time zone."
                />
                <Input
                  label="Payroll approver"
                  value={form.payrollApprovedBy}
                  onChange={(e) => setForm({ ...form, payrollApprovedBy: e.target.value })}
                  hint="The HR member whose approval is required before a payroll is published."
                />
              </div>
            </SectionCard>

            <SectionCard title="Office verification" subtitle="Public IPs and GPS geofence used for attendance verification">
              <div className="space-y-4">
                <Textarea
                  label="Office public IPs"
                  rows={4}
                  value={ips}
                  onChange={(e) => setIps(e.target.value)}
                  hint="One IP address per line. A clock-in from a matching network verifies the attendance."
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Office latitude"
                    type="number"
                    step="0.00001"
                    value={form.officeLat}
                    onChange={(e) => setForm({ ...form, officeLat: Number(e.target.value) })}
                  />
                  <Input
                    label="Office longitude"
                    type="number"
                    step="0.00001"
                    value={form.officeLng}
                    onChange={(e) => setForm({ ...form, officeLng: Number(e.target.value) })}
                  />
                </div>
                <Input
                  label="Geofence radius (metres)"
                  type="number"
                  min={0}
                  value={form.geofenceRadiusM}
                  onChange={(e) => setForm({ ...form, geofenceRadiusM: Number(e.target.value) })}
                  hint="An employee inside this radius of the office passes the GPS check."
                />
              </div>
            </SectionCard>

            <SectionCard title="Attendance" subtitle="Grace period applied before an arrival counts as late">
              <div className="space-y-4">
                <Input
                  label="Late grace period (minutes)"
                  type="number"
                  min={0}
                  value={form.lateGraceMinutes}
                  onChange={(e) => setForm({ ...form, lateGraceMinutes: Number(e.target.value) })}
                  hint="An arrival inside this window after the shift start is not counted as a late day."
                />
                <p className="flex items-start gap-2 rounded-xl border border-line bg-surface-sunken px-4 py-3 text-[12.5px] leading-relaxed text-ink-muted">
                  <Clock size={14} className="mt-0.5 shrink-0 text-brand-600" />
                  The attendance verification window itself stays one minute from the scheduled shift start.
                  The grace period only affects the late day calculation.
                </p>
              </div>
            </SectionCard>

            <SectionCard title="Overtime" subtitle="Rate used when approved overtime is added to payroll">
              <div className="space-y-4">
                <Input
                  label="Overtime rate per hour"
                  type="number"
                  min={0}
                  step={50}
                  value={form.otRatePerHour}
                  onChange={(e) => setForm({ ...form, otRatePerHour: Number(e.target.value) })}
                  hint={`Current rate: ${formatMoney(form.otRatePerHour)} per approved overtime hour.`}
                />
              </div>
            </SectionCard>
          </div>

        </>
      )}
    </div>
  );
}
