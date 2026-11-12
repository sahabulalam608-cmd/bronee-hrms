import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api';
import { Button, Input } from '@/components/ui';
import { useToast } from '@/components/ui';
import BrandMark from '@/components/common/BrandMark';

export default function LoginPage() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await login(email.trim(), password);
      toast.success('Welcome back', 'You are signed in to BRONEE HRMS.');
      navigate(user.role === 'hr' || user.role === 'super_admin' ? '/hr/dashboard' : '/app/dashboard');
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : 'Unable to sign in. Please try again.';
      setError(message);
      toast.error('Sign-in failed', message);
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
        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <BrandMark size="lg" showName={false} />
          </div>
          <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-ink">BRONEE HRMS</h1>
          <p className="mt-1.5 text-[13.5px] text-ink-muted">
            BRONEE Limited · Employee &amp; Human Resource Management
          </p>
        </div>

        <div className="card card-lift p-6 sm:p-7">
          <h2 className="text-[19px] font-bold tracking-[-0.02em] text-ink">Sign in</h2>
          <p className="mt-1 text-[13px] text-ink-muted">Use the official email address registered with HR.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Input
              label="Official Email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@bronee.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              leading={<Mail className="h-4 w-4" />}
              required
              containerClassName="mt-4"
            />

            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              leading={<Lock className="h-4 w-4" />}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="rounded p-0.5 text-ink-muted transition-colors hover:text-ink"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
              required
            />

            {error ? (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[12.5px] font-medium leading-relaxed text-danger-deep"
              >
                {error}
              </motion.p>
            ) : null}

            <Button type="submit" block size="lg" loading={loading} iconRight={<ArrowRight className="h-4 w-4" />}>
              Sign in
            </Button>
          </form>

          <div className="mt-5 text-center">
            <Link
              to="/forgot-password"
              className="text-[12.5px] font-semibold text-brand-600 transition-colors hover:text-brand-800"
            >
              Forgot password?
            </Link>
          </div>

          {/* The prompt for brand-new employees sits quietly under the action. */}
          <div className="mt-6 border-t border-line pt-5 text-center">
            <p className="text-[12px] font-medium text-ink-muted">New employee of BRONEE?</p>
            <Link
              to="/signup"
              className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-bold text-brand-700 transition-colors hover:text-brand-900"
            >
              Create your employee account
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[11.5px] text-ink-muted">
          <ShieldCheck className="h-3.5 w-3.5" />
          Protected by role-based access control and audit logging.
        </p>
      </motion.div>
    </div>
  );
}
