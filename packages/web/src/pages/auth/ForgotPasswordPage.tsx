import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Mail, ShieldCheck } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Button, Card, Input, useToast } from '@/components/ui';

export default function ForgotPasswordPage() {
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [stage, setStage] = useState<'request' | 'reset' | 'done'>('request');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim().toLowerCase(), purpose: 'password_reset' });
      setStage('reset');
      toast.info('Code sent', `Check ${email.trim()} for the reset code.`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Unable to send the reset code.');
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', {
        email: email.trim().toLowerCase(),
        code: code.trim(),
        password,
        confirmPassword,
      });
      setStage('done');
      toast.success('Password updated', 'You can now sign in with your new password.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Unable to reset the password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <div className="aurora" />

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-[420px]"
      >
        <div className="mb-7 text-center">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-glow">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <h1 className="text-[24px] font-extrabold tracking-[-0.03em] text-ink">Reset your password</h1>
          <p className="mt-1.5 text-[13.5px] text-ink-muted">
            We will email you a verification code.
          </p>
        </div>

        <Card lift className="p-6 sm:p-7">
          {stage === 'request' ? (
            <form onSubmit={requestCode} className="space-y-4">
              <Input
                label="Official Email"
                type="email"
                inputMode="email"
                placeholder="you@bronee.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                leading={<Mail className="h-4 w-4" />}
                required
              />
              {error ? (
                <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[12.5px] font-medium text-danger-deep">
                  {error}
                </p>
              ) : null}
              <Button type="submit" block size="lg" loading={loading} iconRight={<ArrowRight className="h-4 w-4" />}>
                Send reset code
              </Button>
            </form>
          ) : null}

          {stage === 'reset' ? (
            <form onSubmit={resetPassword} className="space-y-4">
              <Input
                label="Verification Code"
                inputMode="numeric"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="text-center text-[20px] font-extrabold tracking-[0.4em]"
                required
              />
              <Input
                label="New Password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Input
                label="Confirm New Password"
                type="password"
                autoComplete="new-password"
                placeholder="Repeat your new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              {error ? (
                <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[12.5px] font-medium text-danger-deep">
                  {error}
                </p>
              ) : null}
              <Button type="submit" block size="lg" loading={loading}>
                Update password
              </Button>
              <button
                type="button"
                onClick={() => setStage('request')}
                className="flex w-full items-center justify-center gap-1.5 text-[12.5px] font-semibold text-ink-muted transition-colors hover:text-brand-700"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Use a different email
              </button>
            </form>
          ) : null}

          {stage === 'done' ? (
            <div className="py-3 text-center">
              <h2 className="text-[18px] font-bold text-ink">Password updated</h2>
              <p className="mt-1.5 text-[13.5px] text-ink-muted">
                Your password has been changed. Sign in with your new password.
              </p>
              <Link
                to="/login"
                className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
              >
                Go to sign in
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : null}
        </Card>

        <p className="mt-6 text-center">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-soft transition-colors hover:text-brand-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
