import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Camera, KeyRound, LogOut, PencilLine, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { formatDate } from '@/lib/time';
import { shiftLabel } from '@/lib/status';
import { useToast } from '@/components/ui/overlay';
import { Input, Select, Textarea } from '@/components/ui/forms';
import { Avatar, Badge, MetaRow, PageHeader, SectionCard } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/overlay';
import { useAuth } from '@/features/auth/AuthProvider';

export function ProfilePage() {
  const toast = useToast();
  const { user, signOut, refresh } = useAuth();
  const { data, loading } = useAsync(() => api.employeeProfile(), []);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [field, setField] = useState('Mobile Number');
  const [currentValue, setCurrentValue] = useState('');
  const [requestedValue, setRequestedValue] = useState('');
  const [reason, setReason] = useState('');

  /** The photo of the employee — it lives in the company drive. */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const url = await api.fetchProfilePhoto();
        if (!cancelled) setPhoto(url);
      } catch {
        /* no photo yet */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data]);

  async function pickPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Only an image can be uploaded');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('The photo must be smaller than 5 MB');
      return;
    }
    setPhotoBusy(true);
    try {
      const data = await fileToBase64(file);
      await api.uploadProfilePhoto({
        fileName: file.name,
        contentType: file.type,
        data,
      });
      setPhoto(await api.fetchProfilePhoto());
      await refresh();
      toast.success('Profile photo updated');
    } catch (err) {
      toast.error('Could not upload the photo', err instanceof Error ? err.message : undefined);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    setPhotoBusy(true);
    try {
      await api.removeProfilePhoto();
      setPhoto(null);
      await refresh();
      toast.success('Profile photo removed');
    } catch (err) {
      toast.error('Could not remove the photo', err instanceof Error ? err.message : undefined);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function sendCorrection() {
    if (!requestedValue.trim() || !reason.trim()) {
      toast.warning('Complete the request', 'New value and reason are required.');
      return;
    }
    setBusy(true);
    try {
      await api.submitProfileCorrection({
        field,
        currentValue,
        requestedValue: requestedValue.trim(),
        reason: reason.trim(),
      });
      toast.success('Request sent', 'HR will review your profile correction.');
      setCorrectionOpen(false);
      setRequestedValue('');
      setReason('');
    } catch (err) {
      toast.error('Could not send the request', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const profile = data;

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Profile"
        subtitle="Your employment details and account settings"
        actions={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setPasswordOpen(true)}>
              <KeyRound size={15} />
              Change password
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setCorrectionOpen(true)}>
              <PencilLine size={15} />
              Request a correction
            </button>
          </>
        }
      />

      <SectionCard>
        <div className="flex flex-wrap items-center gap-4 border-b border-line pb-5">
          <div className="relative">
            <Avatar
              name={profile?.fullName ?? user?.fullName ?? ''}
              src={photo}
              size={64}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={photoBusy}
              aria-label="Upload a profile photo"
              title="Upload a profile photo"
              className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border border-line bg-surface text-ink-muted shadow-sm transition-colors hover:text-brand-700 disabled:opacity-60"
            >
              <Camera size={13} />
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={pickPhoto}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[19px] font-semibold tracking-[-0.015em] text-ink">
              {profile?.fullName ?? user?.fullName}
            </p>
            <p className="mt-0.5 text-[13px] text-ink-muted">{profile?.designation ?? user?.designation}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone="brand">{profile?.departmentName ?? user?.departmentName}</Badge>
              {profile?.subDepartmentName && <Badge tone="neutral">{profile.subDepartmentName}</Badge>}
              <Badge tone="info" dot>
                {shiftLabel(profile?.shiftCode ?? user?.shiftCode ?? 'MORNING')}
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => fileInput.current?.click()}
              disabled={photoBusy}
            >
              <Camera size={15} />
              {photoBusy ? 'Uploading…' : photo ? 'Change photo' : 'Upload photo'}
            </button>
            {photo && (
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={removePhoto}
                disabled={photoBusy}
              >
                <Trash2 size={15} />
                Remove photo
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="mt-5 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-8 rounded-lg" />
            ))}
          </div>
        ) : (
          <dl className="mt-2">
            <MetaRow label="Name" value={profile?.fullName ?? '—'} />
            <MetaRow label="Employee ID" value={profile?.employeeId ?? '—'} />
            <MetaRow label="Mobile Number" value={profile?.mobile ?? '—'} />
            <MetaRow label="Email" value={profile?.email ?? '—'} />
            <MetaRow label="Designation" value={profile?.designation ?? '—'} />
            <MetaRow label="Department" value={profile?.departmentName ?? '—'} />
            <MetaRow label="Sub-department" value={profile?.subDepartmentName ?? 'Not applicable'} />
            <MetaRow label="Reporting Manager" value={profile?.reportingManager ?? '—'} />
            <MetaRow label="Joining Date" value={formatDate(profile?.joiningDate)} />
            <MetaRow
              label="Assigned Shift"
              value={shiftLabel(profile?.shiftCode ?? user?.shiftCode ?? 'MORNING')}
            />
            <MetaRow
              label="Account Status"
              value={<Badge tone={profile?.status === 'Active' ? 'ok' : 'warn'}>{profile?.status}</Badge>}
            />
          </dl>
        )}
      </SectionCard>

      <div className="flex justify-end">
        <button type="button" className="btn-secondary" onClick={() => void signOut()}>
          <LogOut size={15} />
          Sign out
        </button>
      </div>

      {/* Correction request */}
      <Modal
        open={correctionOpen}
        onClose={() => setCorrectionOpen(false)}
        title="Request a profile correction"
        description="HR will verify and apply the change"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setCorrectionOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={sendCorrection} disabled={busy}>
              {busy ? 'Sending…' : 'Send request'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Field"
            value={field}
            onChange={(e) => setField(e.target.value)}
          >
            {['Mobile Number', 'Official Email', 'Designation', 'Reporting Manager'].map(
              (name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ),
            )}
          </Select>
          <Input
            label="Current value"
            value={currentValue}
            onChange={(e) => setCurrentValue(e.target.value)}
            placeholder="As it appears today"
          />
          <Input
            label="Requested value"
            value={requestedValue}
            onChange={(e) => setRequestedValue(e.target.value)}
            placeholder="The corrected value"
          />
          <Textarea
            label="Reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why does this need to change?"
          />
        </div>
      </Modal>

      {/* Password change */}
      <Modal
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        title="Change password"
        description="Use “Forgot Password” on the sign-in page for a verified reset by email"
        footer={
          <button type="button" className="btn-secondary" onClick={() => setPasswordOpen(false)}>
            Close
          </button>
        }
      >
        <div className="space-y-3 text-[13.5px] leading-relaxed text-ink-muted">
          <p>
            Password resets are confirmed by email so that nobody can change the password of an
            account they do not own.
          </p>
          <p className="rounded-xl border border-line bg-surface-raised px-3.5 py-2.5">
            Go to the sign-in page, choose <span className="font-medium text-ink">Forgot Password</span>{' '}
            and verify your official email address.
          </p>
        </div>
      </Modal>
    </div>
  );
}

/** Reads a file as a base64 string — without the data url prefix. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.readAsDataURL(file);
  });
}
