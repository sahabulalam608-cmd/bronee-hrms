import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

/**
 * The three statements under the headline in the brand panel.
 *
 * The sign-in page leads with the workspace promise, the registration page with
 * the three promises of the team. Only the values are shown — the label of a
 * statement is never repeated above its own text.
 */
const HIGHLIGHT_VALUES: Record<string, string> = {
  Verification: 'Wi-Fi + GPS',
  Payroll: 'Approved only',
  Access: 'Role-based',
  Workspace: 'Smart workspace',
  Efficiency: 'Efficiency',
  Growth: 'Growth',
  Connect: 'Connect',
  Collaborate: 'Collaborate',
  Deliver: 'Deliver',
};

export function AuthLayout({
  children,
  headline,
  subtext,
  highlights,
  hideMobileBrand = false,
}: {
  children: ReactNode;
  /** Hero headline. Shown in the brand panel on every screen size. */
  headline?: string;
  /** Supporting line under the headline. */
  subtext?: string;
  /** The three short statements under the headline in the brand panel. */
  highlights?: [string, string, string];
  /** Hides the mobile header brand — used when the page shows its own logo. */
  hideMobileBrand?: boolean;
}) {
  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-screen flex-col bg-surface-sunken lg:flex-row">
      {/* Brand panel — the site colours, on every screen size. */}
      <div className="relative shrink-0 overflow-hidden lg:w-[46%] lg:max-w-[640px]">
        <div className="absolute inset-0 bg-[linear-gradient(150deg,#4c1d95_0%,#6d28d9_42%,#7c3aed_68%,#0891b2_140%)]" />
        <div className="absolute -left-24 top-1/4 hidden h-[420px] w-[420px] rounded-full bg-white/10 blur-3xl lg:block" />
        <div className="absolute -bottom-32 -right-20 hidden h-[420px] w-[420px] rounded-full bg-cyan-400/20 blur-3xl lg:block" />

        <div className="relative flex flex-col justify-between p-6 sm:p-8 lg:h-full lg:p-12">
          <div className="max-w-md">
            {headline && (
              <motion.h2
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="text-[23px] font-semibold leading-[1.18] tracking-[-0.025em] text-white sm:text-[28px] lg:text-[34px]"
              >
                {headline}
              </motion.h2>
            )}
            {subtext && (
              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
                className="mt-3 text-[13px] leading-relaxed text-white/85 sm:text-[14.5px] lg:mt-4"
              >
                {subtext}
              </motion.p>
            )}

            {highlights && (
              <div className="mt-6 grid grid-cols-3 gap-3 border-t border-white/15 pt-5 lg:mt-8 lg:gap-4 lg:pt-6">
                {highlights.map((label) => (
                  <p
                    key={label}
                    className="truncate text-[12.5px] font-medium text-white/90 lg:text-[13.5px]"
                  >
                    {HIGHLIGHT_VALUES[label] ?? ''}
                  </p>
                ))}
              </div>
            )}
          </div>

          <p className="mt-6 text-[11.5px] text-white/55 lg:mt-0">© {year} BRONEE Limited</p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 flex-col">
        <div
          className={cn(
            'flex items-center justify-between px-5 py-5 sm:px-8',
            hideMobileBrand && 'hidden lg:flex',
          )}
        >
          {!hideMobileBrand && (
            <Link to="/login" className="flex items-center gap-2.5 lg:hidden">
              <img src="/mark.png" alt="BRONEE" className="h-9 w-9 rounded-lg object-contain" />
              <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">BRONEE LTD</span>
            </Link>
          )}
          <span className="hidden text-[12px] text-ink-faint lg:block">
            BRONEE Human Resource Management System
          </span>
        </div>

        <div className="flex flex-1 items-start justify-center px-5 pb-8 sm:px-8 lg:items-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[420px]"
          >
            {children}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

/**
 * Brand lockup — the BRONEE mark always sits above the company name.
 * Hidden below `lg`, where the header already carries the logo, so the mark
 * never appears twice in one viewport.
 */
export function AuthBrand({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <div
      className={
        size === 'lg'
          ? 'mb-6 hidden items-center gap-3 lg:flex'
          : 'mb-5 hidden items-center gap-2.5 lg:flex'
      }
    >
      <img
        src="/mark.png"
        alt="BRONEE"
        className={
          size === 'lg'
            ? 'h-12 w-12 rounded-xl object-contain'
            : 'h-10 w-10 rounded-lg object-contain'
        }
      />
      <div>
        <p
          className={
            size === 'lg'
              ? 'text-[17px] font-semibold tracking-[-0.015em] text-ink'
              : 'text-[15px] font-semibold tracking-[-0.01em] text-ink'
          }
        >
          BRONEE LTD
        </p>
        <p className="text-[10.5px] uppercase tracking-[0.16em] text-ink-faint">International Partners</p>
      </div>
    </div>
  );
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-7">
      <AuthBrand size="lg" />
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink">{title}</h1>
      {subtitle && <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">{subtitle}</p>}
    </div>
  );
}
