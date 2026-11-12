import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Mail,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useDepartments, useEmployeeDirectory } from '@/lib/queries';
import { Button, Card, Input, Select, useToast } from '@/components/ui';
import { cn } from '@/lib/utils';

type Step = 'details' | 'otp' | 'done';

const EMAIL_DOMAIN = import.meta.env.VITE_SIGNUP_EMAIL_DOMAIN ?? 'gmail.com';

export default function SignupPage() {
  const toast = useToast();
  const { data: departmentData, isLoading: departmentsLoading } = useDepartments();
  const { data: directory } = useEmployeeDirectory();

  const [step, setStep] = useState<Step>('details');
  const [otp, setOtp] = useState('');
  const [otpToken, setOtpToken] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    fullName: '',
    mobile: '',
    employeeCode: '',
    designation: '',
    email: '',
    departmentId: '',
    subDepartmentId: '',
    reportingManagerId: '',
    joiningDate: '',
    password: '',
    confirmPassword: '',
  });

  const departments = useMemo(
    () => (departmentData?.items ?? []).filter((d) => !d.parentId),
    [departmentData],
  );
  const subDepartments = useMemo(
    () =>
      form.departmentId
        ? (departmentData?.items ?? []).filter((d) => d.parentId === form.departmentId)
        : [],
    [departmentData, form.departmentId],
  );

  const selectedDepartment = departments.find((d) => d.id === form.departmentId);
  const requiresSubDepartment = selectedDepartment?.type === 'parent';

  const set = (key: keyof typeof form) => (value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  // Switching department clears an incompatible sub-department.
  useEffect(() => {
    if (!requiresSubDepartment && form.subDepartmentId) {
      setForm((current) => ({ ...current, subDepartmentId: '' }));
    }
  }, [requiresSubDepartment, form.subDepartmentId]);

  const managers = useMemo(
    () => (directory?.items ?? []).filter((e) => e.role !== 'employee' || e.designationLabel?.toLowerCase().includes('manager')),
    [directory],
  );

  function validateDetails(): boolean {
    const errors: Record<string, string> = {};
    if (form.fullName.trim().length < 2) errors.fullName = 'Enter your full name.';
    if (!/^(\+?88)?0?1[3-9]\d{8}$/.test(form.mobile.trim())) errors.mobile = 'Enter a valid Bangladeshi mobile number.';
    if (form.employeeCode.trim().length < 2) errors.employeeCode = 'Enter your Employee ID.';
    if (form.designation.trim().length < 2) errors.designation = 'Enter your designation.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) errors.email = 'Enter a valid email address.';
    else if (!form.email.toLowerCase().endsWith(`@${EMAIL_DOMAIN}`)) {
      errors.email = `Use your ${EMAIL_DOMAIN} address as the official email.`;
    }
    if (!form.departmentId) errors.departmentId = 'Select your department.';
    if (requiresSubDepartment && !form.subDepartmentId) {
      errors.subDepartmentId = 'Select the team you work in.';
    }
    if (!form.joiningDate) errors.joiningDate = 'Select your joining date.';
    if (form.password.length < 8) errors.password = 'Password must be at least 8 characters.';
    else if (!/[a-zA-Z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      errors.password = 'Password must contain a letter and a number.';
    }
    if (form.password !== form.confirmPassword) errors.confirmPassword = 'Passwords do not match.';

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function requestOtp(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!validateDetails()) return;

    setSending(true);
    try {
      await api.post('/auth/signup/request-otp', { email: form.email.trim().toLowerCase(), purpose: 'signup' });
      const verified = await api.post<{ verified: boolean; otpToken: string }>('/auth/signup/verify-otp', {
        email: form.email.trim().toLowerCase(),
        code: otp,
        purpose: 'signup',
      });
      setOtpToken(verified.otpToken);
      setStep('otp');
      toast.info('Verification code sent', `We sent a 6-digit code to ${form.email.trim()}.`);
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'Unable to send the verification code.';
      setError(message);
    } finally {
      setSending(false);
    }
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (otp.length !== 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setSending(true);
    try {
      const verified = await api.post<{ verified: boolean; otpToken: string }>('/auth/signup/verify-otp', {
        email: form.email.trim().toLowerCase(),
        code: otp,
        purpose: 'signup',
      });
      setOtpToken(verified.otpToken);
      setSubmitting(true);
      await api.post('/auth/signup', {
        fullName: form.fullName.trim(),
        mobile: form.mobile.trim(),
        employeeCode: form.employeeCode.trim().toUpperCase(),
        designation: form.designation.trim(),
        email: form.email.trim().toLowerCase(),
        departmentId: form.departmentId,
        subDepartmentId: form.subDepartmentId || null,
        reportingManagerId: form.reportingManagerId || null,
        joiningDate: form.joiningDate,
        password: form.password,
        confirmPassword: form.confirmPassword,
        otpToken: verified.otpToken,
      });
      setStep('done');
      toast.success('Registration submitted', 'HR will review your account shortly.');
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'Verification failed.';
      setError(message);
    } finally {
      setSending(false);
      setSubmitting(false);
    }
  }

  const managerOptions = useMemo(
    () =>
      managers.map((m) => ({
        value: m.id,
        label: `${m.fullName} — ${m.designationLabel ?? m.employeeCode}`,
      })),
    [managers],
  );

  return (
    <div className="relative min-h-dvh overflow-hidden px-4 py-8 sm:py-12">
      <div className="aurora" />

      <div className="relative mx-auto w-full max-w-[680px]">
        <div className="mb-7 flex items-center justify-between">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-soft transition-colors hover:text-brand-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1.5 text-[11.5px] font-semibold text-ink-soft backdrop-blur">
            <ShieldCheck className="h-3.5 w-3.5 text-brand-500" />
            Secure registration
          </span>
        </div>

        <div className="mb-7 text-center">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-glow">
            <Sparkles className="h-6 w-6" />
          </span>
          <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-ink">Create your employee account</h1>
          <p className="mx-auto mt-1.5 max-w-md text-[13.5px] leading-relaxed text-ink-muted">
            BRONEE Limited · Your details are reviewed by HR before you can sign in.
          </p>
        </div>

        {/* Progress */}
        <div className="mb-6 flex items-center gap-2">
          {(['details', 'otp', 'done'] as Step[]).map((s, index) => {
            const order = ['details', 'otp', 'done'];
            const currentIndex = order.indexOf(step);
            const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo';
            return (
              <div key={s} className="flex flex-1 items-center gap-2">
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold transition-colors',
                    state === 'done'
                      ? 'bg-success text-white'
                      : state === 'current'
                        ? 'bg-brand-600 text-white'
                        : 'bg-line text-ink-muted',
                  )}
                >
                  {state === 'done' ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                </span>
                <span
                  className={cn(
                    'hidden text-[12.5px] font-semibold sm:block',
                    state === 'todo' ? 'text-ink-muted' : 'text-ink',
                  )}
                >
                  {s === 'details' ? 'Your details' : s === 'otp' ? 'Verify email' : 'Under review'}
                </span>
                {index < 2 ? <span className="h-px flex-1 bg-line" /> : null}
              </div>
            );
          })}
        </div>

        <Card lift className="p-6 sm:p-7">
          <AnimatePresence mode="wait">
            {step === 'details' ? (
              <motion.form
                key="details"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.22 }}
                onSubmit={requestOtp}
                className="space-y-4"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Full Name"
                    placeholder="e.g. Arif Hossain"
                    value={form.fullName}
                    onChange={(e) => set('fullName')(e.target.value)}
                    error={fieldErrors.fullName}
                    required
                  />
                  <Input
                    label="Mobile Number"
                    inputMode="tel"
                    placeholder="01XXXXXXXXX"
                    value={form.mobile}
                    onChange={(e) => set('mobile')(e.target.value)}
                    error={fieldErrors.mobile}
                    required
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Employee ID"
                    placeholder="BRN-0001"
                    value={form.employeeCode}
                    onChange={(e) => set('employeeCode')(e.target.value.toUpperCase())}
                    error={fieldErrors.employeeCode}
                    required
                  />
                  <Input
                    label="Designation"
                    placeholder="e.g. Officer"
                    value={form.designation}
                    onChange={(e) => set('designation')(e.target.value)}
                    error={fieldErrors.designation}
                    required
                  />
                </div>

                <Input
                  label="Official Email"
                  type="email"
                  inputMode="email"
                  placeholder={`you@${EMAIL_DOMAIN}`}
                  value={form.email}
                  onChange={(e) => set('email')(e.target.value)}
                  error={fieldErrors.email}
                  hint={`A verification code is sent to this ${EMAIL_DOMAIN} address.`}
                  leading={<Mail className="h-4 w-4" />}
                  required
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <Select
                    label="Department"
                    placeholder={departmentsLoading ? 'Loading departments…' : 'Select a department'}
                    value={form.departmentId}
                    onChange={(e) => set('departmentId')(e.target.value)}
                    error={fieldErrors.departmentId}
                    options={departments.map((d) => ({ value: d.id, label: d.name }))}
                    required
                  />
                  {requiresSubDepartment ? (
                    <Select
                      label="Sub-department"
                      placeholder="Select your team"
                      value={form.subDepartmentId}
                      onChange={(e) => set('subDepartmentId')(e.target.value)}
                      error={fieldErrors.subDepartmentId}
                      options={subDepartments.map((d) => ({ value: d.id, label: d.name }))}
                      required
                    />
                  ) : (
                    <div className="hidden sm:block" />
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Select
                    label="Reporting Manager / Supervisor"
                    placeholder="Optional"
                    value={form.reportingManagerId}
                    onChange={(e) => set('reportingManagerId')(e.target.value)}
                    options={[{ value: '', label: 'None' }, ...managerOptions]}
                  />
                  <Input
                    label="Joining Date"
                    type="date"
                    value={form.joiningDate}
                    onChange={(e) => set('joiningDate')(e.target.value)}
                    error={fieldErrors.joiningDate}
                    required
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    value={form.password}
                    onChange={(e) => set('password')(e.target.value)}
                    error={fieldErrors.password}
                    required
                  />
                  <Input
                    label="Confirm Password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Repeat your password"
                    value={form.confirmPassword}
                    onChange={(e) => set('confirmPassword')(e.target.value)}
                    error={fieldErrors.confirmPassword}
                    required
                  />
                </div>

                {error ? (
                  <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[12.5px] font-medium text-danger-deep">
                    {error}
                  </p>
                ) : null}

                <Button type="submit" block size="lg" loading={sending} iconRight={<ArrowRight className="h-4 w-4" />}>
                  Send verification code
                </Button>
              </motion.form>
            ) : null}

            {step === 'otp' ? (
              <motion.form
                key="otp"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.22 }}
                onSubmit={verifyOtp}
                className="space-y-5"
              >
                <div className="rounded-2xl bg-brand-50 px-4 py-3.5">
                  <p className="text-[13px] font-semibold text-brand-900">
                    We sent a 6-digit code to {form.email}
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-brand-700">
                    Enter it below to verify your email and finish registration.
                  </p>
                </div>

                <Input
                  label="Verification Code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="text-center text-[22px] font-extrabold tracking-[0.4em]"
                  required
                />

                {error ? (
                  <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[12.5px] font-medium text-danger-deep">
                    {error}
                  </p>
                ) : null}

                <div className="flex flex-col gap-2 sm:flex-row-reverse">
                  <Button type="submit" size="lg" block loading={submitting || sending}>
                    Verify &amp; submit registration
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={() => setStep('details')}
                    icon={<ArrowLeft className="h-4 w-4" />}
                  >
                    Back
                  </Button>
                </div>
              </motion.form>
            ) : null}

            {step === 'done' ? (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.28 }}
                className="py-4 text-center"
              >
                <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-success-soft text-success">
                  <CheckCircle2 className="h-7 w-7" />
                </span>
                <h2 className="text-[19px] font-bold tracking-[-0.02em] text-ink">Registration submitted</h2>
                <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-ink-muted">
                  Your account is now in the HR approval queue. You will receive an email once a
                  reviewer has approved it — after that you can sign in with your official email.
                </p>
                <div className="mx-auto mt-6 flex max-w-sm items-start gap-2.5 rounded-2xl border border-line bg-canvas px-4 py-3.5 text-left">
                  <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                  <p className="text-[12.5px] leading-relaxed text-ink-soft">
                    <span className="font-semibold text-ink">{form.fullName}</span> · {form.employeeCode} ·{' '}
                    {selectedDepartment?.name}
                    {subDepartments.find((s) => s.id === form.subDepartmentId)?.name
                      ? ` / ${subDepartments.find((s) => s.id === form.subDepartmentId)?.name}`
                      : ''}
                  </p>
                </div>
                <Link
                  to="/login"
                  className="mt-6 inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
                >
                  Go to sign in
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </Card>
      </div>
    </div>
  );
}
