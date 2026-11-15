import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, ShieldCheck } from 'lucide-react';
import { AuthHeading, AuthLayout } from './AuthLayout';
import { Alert, Input } from '@/components/ui/forms';
import { useToast } from '@/components/ui/overlay';
import { api } from '@/lib/api';

type Stage = 'request' | 'reset';

export function ForgotPasswordPage() {
  const [stage, setStage] = useState<Stage>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  async function requestCode(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return setError('Enter your official email address.');
    setBusy(true);
    setError(null);
    try {
      await api.requestPasswordReset(email.trim());
      setStage('reset');
      toast.success('Code sent', 'Check your inbox for the password reset code.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the reset code.');
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError('Use at least 8 characters for the new password.');
    if (password !== confirmPassword) return setError('The two passwords do not match.');
    setBusy(true);
    setError(null);
    try {
      await api.resetPassword(email.trim(), code.trim(), password);
      toast.success('Password updated', 'Sign in with your new password.');
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The password could not be reset.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <AuthHeading
        title={stage === 'request' ? 'Forgot password' : 'Set a new password'}
        subtitle={
          stage === 'request'
            ? 'Enter your official email address and we will send you a verification code.'
            : `Enter the code sent to ${email} and choose a new password.`
        }
      />

      {error && (
        <Alert tone="bad" className="mb-4">
          {error}
        </Alert>
      )}

      {stage === 'request' ? (
        <form className="space-y-4" onSubmit={requestCode}>
          <Input
            label="Official Email"
            type="email"
            placeholder="you@bronee.com"
            leading={<Mail size={16} />}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button type="submit" className="btn-primary w-full py-3" disabled={busy}>
            {busy ? 'Sending…' : 'Send verification code'}
          </button>
        </form>
      ) : (
        <form className="space-y-4" onSubmit={resetPassword}>
          <Input
            label="Verification Code"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            leading={<ShieldCheck size={16} />}
            className="text-center font-mono text-[18px] tracking-[0.4em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            required
          />
          <Input
            label="New Password"
            type="password"
            leading={<ShieldCheck size={16} />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint="At least 8 characters."
            required
          />
          <Input
            label="Confirm Password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
          <button type="submit" className="btn-primary w-full py-3" disabled={busy}>
            {busy ? 'Updating…' : 'Update password'}
          </button>
        </form>
      )}

      <Link
        to="/login"
        className="mt-6 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand-700 hover:text-brand-800"
      >
        <ArrowLeft size={14} />
        Back to sign in
      </Link>
    </AuthLayout>
  );
}
