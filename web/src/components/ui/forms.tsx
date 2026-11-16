import {
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode,
  useId,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Info, Lock } from 'lucide-react';
import { cn } from '@/lib/cn';

/* ------------------------------------------------------------------ *
 * Field wrapper
 * ------------------------------------------------------------------ */

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('w-full', className)}>
      {label && (
        <span className="label">
          {label}
          {required && <span className="ml-0.5 text-bad">*</span>}
        </span>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 flex items-start gap-1.5 text-[12px] text-bad">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-[12px] text-ink-faint">{hint}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Inputs
 * ------------------------------------------------------------------ */

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: ReactNode;
  error?: string | null;
  leading?: ReactNode;
  trailing?: ReactNode;
  fieldClassName?: string;
};

export function Input({ label, hint, error, leading, trailing, className, fieldClassName, ...rest }: InputProps) {
  return (
    <Field label={label} hint={hint} error={error} required={rest.required}>
      <div className="relative">
        {leading && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint">
            {leading}
          </span>
        )}
        <input
          {...rest}
          className={cn(
            'field',
            error && 'field-error',
            leading && 'pl-10',
            trailing && 'pr-10',
            className,
          )}
        />
        {trailing && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-faint">{trailing}</span>
        )}
      </div>
    </Field>
  );
}

/**
 * A password field with a show / hide button.
 *
 * The eye swaps with a short animation so the state is obvious without any
 * label next to the icon.
 */
export function PasswordInput({
  label,
  hint,
  error,
  className,
  fieldClassName,
  leading,
  ...rest
}: InputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <Input
      {...rest}
      label={label}
      hint={hint}
      error={error}
      className={className}
      fieldClassName={fieldClassName}
      type={visible ? 'text' : 'password'}
      leading={leading ?? <Lock size={16} />}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          title={visible ? 'Hide password' : 'Show password'}
          className={cn(
            'group grid h-7 w-7 place-items-center rounded-lg transition-colors duration-200',
            visible
              ? 'bg-brand-50 text-brand-700'
              : 'text-ink-faint hover:bg-surface-sunken hover:text-ink',
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={visible ? 'hide' : 'show'}
              initial={{ opacity: 0, scale: 0.55, rotate: -35 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.55, rotate: 35 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="grid place-items-center"
            >
              {visible ? <EyeOff size={16} /> : <Eye size={16} />}
            </motion.span>
          </AnimatePresence>
        </button>
      }
    />
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  hint?: ReactNode;
  error?: string | null;
  options?: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
  fieldClassName?: string;
};
export function Select({
  label,
  hint,
  error,
  options,
  placeholder,
  className,
  children,
  ...rest
}: SelectProps) {
  return (
    <Field label={label} hint={hint} error={error} required={rest.required}>
      <select {...rest} className={cn('select-field', error && 'field-error', className)}>
        {placeholder && <option value="">{placeholder}</option>}
        {options?.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
        {children}
      </select>
    </Field>
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  hint?: ReactNode;
  error?: string | null;
};

export function Textarea({ label, hint, error, className, ...rest }: TextareaProps) {
  return (
    <Field label={label} hint={hint} error={error} required={rest.required}>
      <textarea {...rest} className={cn('field resize-y leading-relaxed', error && 'field-error', className)} />
    </Field>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <button
        id={id}
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[6px] border transition-colors',
          checked ? 'border-brand-600 bg-brand-600 text-white' : 'border-line-strong bg-surface hover:border-brand-300',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        {checked && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4">
            <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <label htmlFor={id} className={cn('text-[13px] leading-relaxed text-ink-soft', disabled && 'opacity-60')}>
        {label}
      </label>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Alerts
 * ------------------------------------------------------------------ */

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: 'info' | 'ok' | 'warn' | 'bad';
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const tones = {
    info: { box: 'bg-info-soft border-info/20 text-info', Icon: Info },
    ok: { box: 'bg-ok-soft border-ok/20 text-ok', Icon: CheckCircle2 },
    warn: { box: 'bg-warn-soft border-warn/25 text-warn', Icon: AlertCircle },
    bad: { box: 'bg-bad-soft border-bad/20 text-bad', Icon: AlertCircle },
  } as const;
  const { box, Icon } = tones[tone];
  return (
    <div className={cn('flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[13px]', box, className)}>
      <Icon size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn('leading-relaxed', title && 'mt-0.5 opacity-90')}>{children}</div>}
      </div>
    </div>
  );
}
