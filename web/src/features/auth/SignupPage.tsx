import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, CheckCircle2, Mail, ShieldCheck } from 'lucide-react';
import { AuthHeading, AuthLayout } from './AuthLayout';
import { Alert, Input, PasswordInput, Select } from '@/components/ui/forms';
import { useToast } from '@/components/ui/overlay';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { DEPARTMENTS, SIGNUP_DEPARTMENT_ORDER } from '@shared/constants';
import { formatBdMobileInput, isValidBdMobile } from '@shared/mobile';
import { stripNonLatin } from '@shared/text';
import type { SignupForm } from '@shared/types';

type Step = 'details' | 'otp' | 'password' | 'done';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Registration steps, numbered from 01. */
const STEPS = [
  { key: 'details', label: 'Your details' },
  { key: 'otp', label: 'Verify email' },
  { key: 'password', label: 'Password' },
  { key: 'done', label: 'Done' },
] as const;

const STEP_INDEX: Record<Step, number> = { details: 0, otp: 1, password: 2, done: 3 };

/**
 * Registration progress, numbered from 01.
 * The active marker slides between steps and the connector fills as the
 * registration advances.
 */
function SignupSteps({ current }: { current: Step }) {
  const active = STEP_INDEX[current];
  return (
    <ol className="mb-6 flex items-center gap-2" aria-label="Registration progress">
      {STEPS.map((step, index) => {
        const state = index < active ? 'done' : index === active ? 'current' : 'todo';
        return (
          <li key={step.key} className="flex flex-1 items-center gap-2">
            <motion.span
              layout
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              aria-current={state === 'current' ? 'step' : undefined}
              className={cn(
                'relative grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11.5px] font-semibold tabular-nums',
                state === 'done' && 'bg-ok text-white',
                state === 'current' && 'bg-brand-600 text-white shadow-[0_0_0_4px_rgba(109,40,217,0.14)]',
                state === 'todo' && 'bg-surface-sunken text-ink-faint',
              )}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={state}
                  initial={{ opacity: 0, scale: 0.6, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.6, y: 4 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className="block"
                >
                  {String(index + 1).padStart(2, '0')}
                </motion.span>
              </AnimatePresence>
            </motion.span>
            <span
              className={cn(
                'hidden truncate text-[11.5px] font-medium transition-colors sm:inline',
                state === 'todo' ? 'text-ink-faint' : 'text-ink-soft',
              )}
            >
              {step.label}
            </span>
            {index < STEPS.length - 1 && (
              <span aria-hidden className="relative ml-auto h-[3px] flex-1 overflow-hidden rounded-full bg-line">
                <motion.span
                  className="absolute inset-y-0 left-0 rounded-full bg-brand-500"
                  initial={{ width: '0%' }}
                  animate={{ width: index < active ? '100%' : '0%' }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Wraps a step so the form slides when the registration advances. */
function StepBody({ step, children }: { step: string; children: ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={step}
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -24 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export function SignupPage() {
  const [step, setStep] = useState<Step>('details');
  const [form, setForm] = useState<SignupForm>({
    fullName: '',
    mobile: '',
    employeeId: '',
    designation: '',
    email: '',
    departmentName: '',
    subDepartmentName: null,
    reportingManager: '',
    joiningDate: '',
    password: '',
  });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  const subDepartments = useMemo(
    () => DEPARTMENTS.filter((d) => d.parentId === DEPT_PARENT_ID).map((d) => d.name),
    [],
  );

  const set = <K extends keyof SignupForm>(key: K, value: SignupForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  function validateDetails(): string | null {
    if (!form.fullName.trim()) return 'Full name is required.';
    if (!isValidBdMobile(form.mobile.trim())) {
      return 'Enter an 11-digit mobile number starting with 01 (e.g. 01711000016).';
    }
    if (!form.employeeId.trim()) return 'Employee ID is required.';
    if (!form.designation.trim()) return 'Designation is required.';
    if (!EMAIL_RE.test(form.email.trim())) return 'Enter a valid official email address.';
    if (!form.departmentName) return 'Select your department.';
    if (form.departmentName === 'Sales Team' && !form.subDepartmentName) {
      return 'Select a sub-department under Sales Team.';
    }
    if (!form.joiningDate) return 'Joining date is required.';
    return null;
  }

  async function sendOtp() {
    const validation = validateDetails();
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const challenge = await api.requestSignupOtp(form);
      setDevCode(challenge.devCode ?? null);
      setStep('otp');
      toast.success('Verification code sent', `We sent a 6-digit code to ${form.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the verification code.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    if (code.trim().length !== 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.verifySignupOtp(form.email.trim().toLowerCase(), code.trim());
      setStep('password');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code could not be verified.');
    } finally {
      setBusy(false);
    }
  }

  async function submitRegistration() {
    if (form.password.length < 8) {
      setError('Use at least 8 characters for your password.');
      return;
    }
    if (form.password !== confirmPassword) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.submitSignup(form);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration could not be submitted.');
    } finally {
      setBusy(false);
    }
  }

  /* --------------------------------- done --------------------------------- */
  if (step === 'done') {
    return (
      <AuthLayout
        headline="We Connect. We Deliver. Every Single Day."
        subtext="Complete your registration to begin your journey with BRONEE and access your personalized employee workspace once approved."
        highlights={['Connect', 'Collaborate', 'Deliver']}
      >
        <SignupSteps current="done" />
        <StepBody step="done">
        <div className="text-center">
          <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-ok-soft text-ok">
            <CheckCircle2 size={30} />
          </div>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-ink">
            Registration submitted
          </h1>
          <p className="mx-auto mt-2.5 max-w-sm text-[13.5px] leading-relaxed text-ink-muted">
            Your details are now in the HR approval queue. You will receive an email once
            HR has verified your information and approved your employee account.
          </p>
          <div className="mt-7 rounded-2xl border border-line bg-surface px-5 py-4 text-left">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
              Summary
            </p>
            <dl className="mt-2.5 space-y-1.5 text-[13px]">
              {[
                ['Name', form.fullName],
                ['Employee ID', form.employeeId],
                ['Email', form.email],
                ['Department', form.departmentName],
                ['Sub-department', form.subDepartmentName ?? '—'],
                ['Designation', form.designation],
                ['Joining date', form.joiningDate],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-ink-muted">{label}</dt>
                  <dd className="text-right font-medium text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <button
            type="button"
            onClick={() => navigate('/login', { replace: true })}
            className="btn-primary mt-6 w-full py-3"
          >
            Back to sign in
          </button>
        </div>
      </StepBody>
      </AuthLayout>
    );
  }

  /* --------------------------------- otp --------------------------------- */
  if (step === 'otp') {
    return (
      <AuthLayout
        headline="We Connect. We Deliver. Every Single Day."
        subtext="Complete your registration to begin your journey with BRONEE and access your personalized employee workspace once approved."
        highlights={['Connect', 'Collaborate', 'Deliver']}
      >
        <SignupSteps current="otp" />
        <StepBody step="otp">
        <AuthHeading title="Verify your email" subtitle={`We sent a 6-digit code to ${form.email}.`} />
        {error && <Alert tone="bad">{error}</Alert>}
        {devCode && (
          <Alert tone="info" title="Demo mode">
            No mailbox is attached to the demo. Use code{' '}
            <span className="font-mono font-semibold">{devCode}</span> to continue.
          </Alert>
        )}
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void verifyOtp();
          }}
        >
          <Input
            label="Verification Code"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            leading={<ShieldCheck size={16} />}
            className="text-center font-mono text-[18px] tracking-[0.4em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
          <button type="submit" className="btn-primary w-full py-3" disabled={busy}>
            {busy ? 'Verifying…' : 'Verify code'}
          </button>
          <button
            type="button"
            onClick={() => setStep('details')}
            className="btn-ghost w-full text-[13px]"
          >
            <ArrowLeft size={15} />
            Back to details
          </button>
        </form>
      </StepBody>
      </AuthLayout>
    );
  }

  /* --------------------------------- password --------------------------------- */
  if (step === 'password') {
    return (
      <AuthLayout
        headline="We Connect. We Deliver. Every Single Day."
        subtext="Complete your registration to begin your journey with BRONEE and access your personalized employee workspace once approved."
        highlights={['Connect', 'Collaborate', 'Deliver']}
      >
        <SignupSteps current="password" />
        <StepBody step="password">
        <AuthHeading title="Set your password" subtitle="Choose a password for your employee account." />
        {error && <Alert tone="bad">{error}</Alert>}
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submitRegistration();
          }}
        >
          <PasswordInput
            label="Password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
            hint="At least 8 characters."
          />
          <PasswordInput
            label="Confirm Password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <button type="submit" className="btn-primary w-full py-3" disabled={busy}>
            {busy ? 'Submitting…' : 'Submit registration'}
          </button>
        </form>
      </StepBody>
      </AuthLayout>
    );
  }

  /* --------------------------------- details --------------------------------- */
  return (
    <AuthLayout
      headline="We Connect. We Deliver. Every Single Day."
      subtext="Complete your registration to begin your journey with BRONEE and access your personalized employee workspace once approved."
      highlights={['Connect', 'Collaborate', 'Deliver']}
    >
      <SignupSteps current="details" />
      <StepBody step="details">
      <AuthHeading
        title="Create your employee account"
        subtitle="Fill in your details exactly as HR has them. You will verify your email and set a password next."
      />

      {error && (
        <Alert tone="bad" className="mb-4">
          {error}
        </Alert>
      )}

      <form className="space-y-4" onSubmit={(e: FormEvent) => { e.preventDefault(); void sendOtp(); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Full Name"
            name="fullName"
            placeholder="e.g. Md Ismail Hossain"
            value={form.fullName}
            onChange={(e) => set('fullName', stripNonLatin(e.target.value))}
            required
          />
          <Input
            label="Mobile Number"
            name="mobile"
            placeholder="01XXXXXXXXX"
            inputMode="tel"
            value={form.mobile}
            onChange={(e) => set('mobile', formatBdMobileInput(e.target.value))}
            hint="11 digits, starting with 01."
            required
          />
          <Input
            label="Employee ID"
            name="employeeId"
            placeholder="e.g. BRN-017"
            value={form.employeeId}
            onChange={(e) => set('employeeId', stripNonLatin(e.target.value.toUpperCase()))}
            required
          />
          <Input
            label="Designation"
            name="designation"
            placeholder="e.g. Customer Relationship Officer"
            value={form.designation}
            onChange={(e) => set('designation', stripNonLatin(e.target.value))}
            required
          />
        </div>

        <Input
          label="Official Email"
          name="email"
          type="email"
          placeholder="you@gmail.com"
          leading={<Mail size={16} />}
          value={form.email}
          onChange={(e) => set('email', e.target.value)}
          hint="A 6-digit verification code will be sent here."
          required
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Department"
            placeholder="Select department"
            value={form.departmentName}
            onChange={(e) => {
              const value = e.target.value;
              setForm((prev) => ({
                ...prev,
                departmentName: value,
                subDepartmentName:
                  value === 'Sales Team' ? prev.subDepartmentName : null,
              }));
            }}
            required
          >
            {SIGNUP_DEPARTMENT_ORDER.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>

          {form.departmentName === 'Sales Team' && (
            <Select
              label="Sub-department"
              placeholder="Select sub-department"
              value={form.subDepartmentName ?? ''}
              onChange={(e) => set('subDepartmentName', e.target.value || null)}
              required
            >
              {subDepartments.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Reporting Manager / Supervisor"
            name="reportingManager"
            placeholder="Optional"
            value={form.reportingManager ?? ''}
            onChange={(e) => set('reportingManager', stripNonLatin(e.target.value))}
          />
          <Input
            label="Joining Date"
            type="date"
            value={form.joiningDate}
            onChange={(e) => set('joiningDate', e.target.value)}
            required
          />
        </div>

        <button type="submit" className="btn-primary w-full py-3" disabled={busy}>
          {busy ? 'Sending code…' : (
            <>
              Continue
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-[12.5px] text-ink-muted">
        Already registered?{' '}
        <Link to="/login" className="font-semibold text-brand-700 hover:text-brand-800">
          Sign in
        </Link>
      </p>
      </StepBody>
    </AuthLayout>
  );
}

/** Sales Team parent id, resolved from the shared department registry. */
const DEPT_PARENT_ID = DEPARTMENTS.find((d) => d.name === 'Sales Team')?.id ?? 'dep-sales-team';
