import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'soft' | 'danger' | 'outline';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300',
  secondary:
    'bg-ink text-white shadow-sm hover:bg-ink/90 active:bg-ink disabled:bg-ink/30',
  soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100 active:bg-brand-200 disabled:text-brand-300',
  outline:
    'border border-line bg-white text-ink hover:border-brand-300 hover:bg-brand-50/60 active:bg-brand-100 disabled:text-ink-muted',
  ghost: 'text-ink-soft hover:bg-canvas hover:text-ink active:bg-line/70 disabled:text-ink-muted',
  danger: 'bg-danger text-white shadow-sm hover:bg-danger/90 active:bg-danger disabled:bg-danger/40',
};

const SIZES: Record<ButtonSize, string> = {
  xs: 'h-8 px-2.5 text-[13px] gap-1.5 rounded-lg',
  sm: 'h-9 px-3.5 text-[13px] gap-2 rounded-[10px]',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-[15px] gap-2.5 rounded-xl',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  block?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    icon,
    iconRight,
    block = false,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center font-semibold transition-all duration-150',
        'active:scale-[0.985] disabled:pointer-events-none disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        icon
      )}
      {children}
      {!loading && iconRight}
    </button>
  );
});

/** Icon-only button with an accessible label. */
export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonProps & { label: string }
>(function IconButton({ label, className, size = 'md', variant = 'ghost', children, ...rest }, ref) {
  const box = size === 'sm' ? 'h-9 w-9' : size === 'lg' ? 'h-12 w-12' : 'h-10 w-10';
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-xl transition-all duration-150',
        'active:scale-95 disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        box,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

/** A small circular action used in the mobile bottom navigation. */
export function FloatingAction({
  label,
  onClick,
  tone = 'brand',
  children,
}: {
  label: string;
  onClick?: () => void;
  tone?: 'brand' | 'success' | 'danger';
  children: ReactNode;
}) {
  const tones = {
    brand: 'bg-brand-600 text-white shadow-glow hover:bg-brand-700',
    success: 'bg-success text-white shadow-[0_8px_24px_-8px_rgba(14,159,110,.55)] hover:bg-success/90',
    danger: 'bg-danger text-white shadow-[0_8px_24px_-8px_rgba(217,45,32,.5)] hover:bg-danger/90',
  } as const;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      whileTap={{ scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 420, damping: 24 }}
      className={cn(
        'flex h-12 w-12 items-center justify-center rounded-2xl transition-colors',
        tones[tone],
      )}
    >
      {children}
    </motion.button>
  );
}
