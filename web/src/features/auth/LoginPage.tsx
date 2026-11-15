import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { Input } from '@/components/ui/forms';
import { Alert } from '@/components/ui/forms';
import { useToast } from '@/components/ui/overlay';
import { useAuth } from './AuthProvider';
import { IS_DEMO } from '@/lib/api';
import { cn } from '@/lib/cn';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const { signIn, homePath } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim()) return setError('Enter your registered email address.');
    if (!password) return setError('Enter your password.');

    setSubmitting(true);
    try {
      const user = await signIn(email.trim(), password);
      setDone(true);
      toast.success('Signed in', `Welcome back, ${user.fullName.split(' ')[0]}.`);
      // The hero plays its ring fade and the logo pop before the portal opens.
      window.setTimeout(() => navigate(homePath, { replace: true }), 620);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      headline="Empowering our team to connect, collaborate, and deliver excellence."
      subtext="Welcome back to BRONEE Limited Workspace."
      highlights={['Workspace', 'Efficiency', 'Growth']}
      hideMobileBrand
    >
      <div className={cn('login-card card px-6 py-7 sm:px-8', done && 'done')}>
        {/* The hero — a floating logo inside a rotating gradient ring. */}
        <div className="flex flex-col items-center text-center">
          <div className="login-hero">
            <span className="login-hero__ring" aria-hidden="true" />
            <img src="/mark.png" alt="BRONEE" className="login-hero__logo" />
          </div>
          <p className="mt-5 text-[15px] font-semibold tracking-[-0.01em] text-ink">BRONEE LTD</p>
          <p className="text-[10.5px] uppercase tracking-[0.16em] text-ink-faint">
            International Partners
          </p>
        </div>

        <div className="mt-6">
          <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.02em] text-ink">Sign in</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
            Use your registered email address and password.
          </p>
        </div>

        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          {error && <Alert tone="bad">{error}</Alert>}

          <Input
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@bronee.com"
            leading={<Mail size={16} />}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <Input
            label="Password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            leading={<Lock size={16} />}
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="rounded-md p-1 text-ink-faint transition-colors hover:text-ink"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <div className="flex justify-end">
            <Link
              to="/forgot-password"
              className="text-[12.5px] font-medium text-brand-700 transition-colors hover:text-brand-800"
            >
              Forgot Password
            </Link>
          </div>

          <button type="submit" className="btn-primary w-full py-3" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Login'}
          </button>
        </form>

        {/* Signup prompt sits directly above the login button area (§4.3) */}
        <div className="mt-6 border-t border-line pt-5 text-center">
          <p className="text-[12.5px] font-light text-ink-faint">New employee of BRONEE?</p>
          <Link
            to="/signup"
            className="mt-1 inline-block text-[13.5px] font-semibold text-brand-700 transition-colors hover:text-brand-800"
          >
            Create your employee account
          </Link>
        </div>

        {IS_DEMO && (
          <div className="mt-6 rounded-xl border border-line bg-surface-sunken px-4 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
              Demo access
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
              <span className="font-medium text-ink">hr@bronneltd.com</span> — Super Admin (HR portal)
              <br />
              <span className="font-medium text-ink">ismailhossainm712@gmail.com</span> — Employee portal
              <br />
              <span className="font-medium text-ink">Password: Bronee@2026</span>
            </p>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
