import { useState } from 'react';
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  KeyRound,
  LogOut,
  Mail,
  Phone,
  Send,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatBanglaDate } from '@bronee/shared';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useEmployeeDirectory, useProfile } from '@/lib/queries';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
} from '@/components/ui';
import { cn } from '@/lib/utils';

export default function ProfilePage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user, logout } = useAuth();
  const { data } = useProfile();
  const { data: directory } = useEmployeeDirectory();

  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const profile = data?.profile ?? user;

  const managers = (directory?.items ?? []).filter(
    (e) => e.id !== profile?.id && e.status === 'active',
  );

  return (
    <div className="space-y-5">
      {/* Identity */}
      <Card className="overflow-hidden">
        <div className="relative bg-gradient-to-br from-brand-50 via-white to-white p-5 sm:p-6">
          <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-brand-100/70 blur-3xl" />
          <div className="relative flex flex-wrap items-center gap-5">
            <Avatar name={profile?.fullName} src={profile?.avatarUrl} size="xl" ring />
            <div className="min-w-0 flex-1">
              <h1 className="text-[24px] font-extrabold tracking-[-0.03em] text-ink">
                {profile?.fullName}
              </h1>
              <p className="mt-1 text-[13.5px] text-ink-muted">{profile?.designation ?? '—'}</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Badge tone="brand">{profile?.employeeCode}</Badge>
                {profile?.department ? (
                  <Badge tone="neutral">
                    {profile.department}
                    {profile.subDepartment ? ` · ${profile.subDepartment}` : ''}
                  </Badge>
                ) : null}
                {profile?.mustChangePassword ? <Badge tone="warning">Change your password</Badge> : null}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Details */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Employment details"
            subtitle="Protected fields are maintained by HR"
            icon={<UserRound className="h-4 w-4" />}
            action={
              <Button size="sm" variant="outline" onClick={() => setCorrectionOpen(true)}>
                Request correction
              </Button>
            }
          />
          <CardBody>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <Detail
                icon={<Mail className="h-3.5 w-3.5" />}
                label="Official email"
                value={profile?.email}
              />
              <Detail
                icon={<Phone className="h-3.5 w-3.5" />}
                label="Mobile number"
                value={profile?.mobile}
              />
              <Detail
                icon={<Building2 className="h-3.5 w-3.5" />}
                label="Department"
                value={
                  profile?.department
                    ? `${profile.department}${profile.subDepartment ? ` · ${profile.subDepartment}` : ''}`
                    : '—'
                }
              />
              <Detail
                icon={<UserRound className="h-3.5 w-3.5" />}
                label="Reporting manager"
                value={profile?.reportingManagerName ?? 'Not assigned'}
              />
              <Detail
                icon={<CalendarDays className="h-3.5 w-3.5" />}
                label="Joining date"
                value={profile?.joiningDate ? formatBanglaDate(profile.joiningDate, { withYear: true }) : '—'}
              />
              <Detail
                icon={<BadgeCheck className="h-3.5 w-3.5" />}
                label="Account status"
                value={<Badge tone={profile?.status === 'active' ? 'success' : 'neutral'}>{profile?.status}</Badge>}
              />
            </dl>

            {data?.pendingRequests?.length ? (
              <div className="mt-5 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3">
                <p className="text-[13px] font-semibold text-brand-900">Correction request pending</p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-brand-700">
                  {data.pendingRequests[0].reason} — HR will review it and update your record.
                </p>
              </div>
            ) : null}
          </CardBody>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader title="Security" subtitle="Protect your account" icon={<ShieldCheck className="h-4 w-4" />} />
          <CardBody className="space-y-3">
            <Button block variant="outline" onClick={() => setPasswordOpen(true)} icon={<KeyRound className="h-4 w-4" />}>
              Change password
            </Button>
            <Button
              block
              variant="ghost"
              onClick={async () => {
                await logout();
                window.location.href = '/login';
              }}
              icon={<LogOut className="h-4 w-4" />}
            >
              Sign out
            </Button>
            <p className="pt-1 text-[12px] leading-relaxed text-ink-muted">
              Never share your login. BRONEE HRMS records every administrative action against your
              account.
            </p>
          </CardBody>
        </Card>
      </div>

      <CorrectionModal
        open={correctionOpen}
        onClose={() => setCorrectionOpen(false)}
        managers={managers.map((m) => ({ value: m.id, label: `${m.fullName} — ${m.designationLabel}` }))}
      />
      <PasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  );
}

function Detail({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-muted">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 text-[13.5px] font-semibold text-ink">{value}</dd>
    </div>
  );
}

function CorrectionModal({
  open,
  onClose,
  managers,
}: {
  open: boolean;
  onClose: () => void;
  managers: Array<{ value: string; label: string }>;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [mobile, setMobile] = useState('');
  const [reportingManagerId, setReportingManagerId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: () =>
      api.post('/profile/update-request', {
        fields: {
          mobile: mobile.trim() || undefined,
          reportingManagerId: reportingManagerId || null,
        },
        reason: reason.trim(),
      }),
    onSuccess: () => {
      toast.success('Request sent', 'HR will review your correction request.');
      onClose();
      setReason('');
      setMobile('');
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (caught) => {
      toast.error('Could not submit', caught instanceof ApiError ? caught.message : 'Please try again.');
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request a profile correction"
      description="HR approves every change before it is applied."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (reason.trim().length < 3) {
                setError('Please give a short reason.');
                return;
              }
              setError(null);
              submit.mutate();
            }}
            loading={submit.isPending}
            icon={<Send className="h-4 w-4" />}
          >
            Send request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="New mobile number"
          inputMode="tel"
          placeholder="01XXXXXXXXX"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          hint="Leave blank to keep your current number."
        />
        <Select
          label="Reporting manager"
          placeholder="Keep current"
          value={reportingManagerId}
          onChange={(e) => setReportingManagerId(e.target.value)}
          options={managers}
        />
        <Textarea
          label="Reason"
          placeholder="Tell HR what needs to change and why."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={error ?? undefined}
          required
        />
      </div>
    </Modal>
  );
}

function PasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: () =>
      api.post('/auth/change-password', { currentPassword, newPassword, confirmPassword }),
    onSuccess: () => {
      toast.success('Password changed', 'Use your new password the next time you sign in.');
      onClose();
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (caught) => {
      setError(caught instanceof ApiError ? caught.message : 'Unable to change the password.');
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change password"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (newPassword.length < 8) {
                setError('Password must be at least 8 characters.');
                return;
              }
              if (newPassword !== confirmPassword) {
                setError('Passwords do not match.');
                return;
              }
              setError(null);
              submit.mutate();
            }}
            loading={submit.isPending}
          >
            Update password
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
        <Input
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={error ?? undefined}
          required
        />
      </div>
    </Modal>
  );
}
