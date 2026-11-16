import { AnimatePresence, motion } from 'framer-motion';
import { X, CheckCircle2, AlertCircle, Info, TriangleAlert } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';

/* ------------------------------------------------------------------ *
 * Modal
 * ------------------------------------------------------------------ */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.985 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className={cn(
              'relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-surface shadow-lift sm:rounded-3xl',
              widths[size],
            )}
          >
            {(title || description) && (
              <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
                <div className="min-w-0">
                  {title && <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>}
                  {description && <p className="mt-1 text-[13px] text-ink-muted">{description}</p>}
                </div>
                <button type="button" onClick={onClose} className="btn-icon -mr-2 -mt-1" aria-label="Close">
                  <X size={18} />
                </button>
              </header>
            )}
            <div className="scroll-touch flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer && (
              <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-raised px-6 py-4">
                {footer}
              </footer>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ *
 * Drawer (mobile-first sheet)
 * ------------------------------------------------------------------ */

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  side = 'right',
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  side?: 'left' | 'right';
}) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]"
          />
          <motion.aside
            initial={{ x: side === 'right' ? '100%' : '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: side === 'right' ? '100%' : '-100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            className={cn(
              'absolute inset-y-0 flex w-[86%] max-w-sm flex-col bg-surface shadow-lift',
              side === 'right' ? 'right-0' : 'left-0',
            )}
          >
            {title && (
              <header className="flex items-center justify-between border-b border-line px-5 py-4">
                <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
                <button type="button" onClick={onClose} className="btn-icon" aria-label="Close">
                  <X size={18} />
                </button>
              </header>
            )}
            <div className="scroll-touch flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <footer className="border-t border-line px-5 py-4">{footer}</footer>}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ *
 * Toasts
 * ------------------------------------------------------------------ */

type ToastTone = 'success' | 'error' | 'info' | 'warning';
interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

/** How long a notification stays on the screen before it hides itself. */
const TOAST_DURATION = 2800;

interface ToastApi {
  push: (tone: ToastTone, title: string, description?: string) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((tone: ToastTone, title: string, description?: string) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, tone, title, description }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), TOAST_DURATION);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      push,
      success: (t, d) => push('success', t, d),
      error: (t, d) => push('error', t, d),
      info: (t, d) => push('info', t, d),
      warning: (t, d) => push('warning', t, d),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* The notifications sit in the lower middle of the screen. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex flex-col items-center gap-3 px-4 sm:bottom-8">
        <AnimatePresence>
          {items.map((toast) => (
            <Toast
              key={toast.id}
              toast={toast}
              onClose={() => setItems((p) => p.filter((t) => t.id !== toast.id))}
            />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ toast, onClose }: { toast: ToastItem; onClose: () => void }) {
  const map = {
    success: { Icon: CheckCircle2, cls: 'text-ok', badge: 'bg-ok-soft', ring: 'ring-ok/20' },
    error: { Icon: AlertCircle, cls: 'text-bad', badge: 'bg-bad-soft', ring: 'ring-bad/20' },
    info: { Icon: Info, cls: 'text-info', badge: 'bg-info-soft', ring: 'ring-info/20' },
    warning: { Icon: TriangleAlert, cls: 'text-warn', badge: 'bg-warn-soft', ring: 'ring-warn/20' },
  } as const;
  const { Icon, cls, badge, ring } = map[toast.tone];
  return (
    <motion.div
      layout
      role="status"
      aria-live="polite"
      data-toast={toast.tone}
      initial={{ opacity: 0, y: 34, scale: 0.9, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: 20, scale: 0.94, filter: 'blur(6px)' }}
      transition={{ type: 'spring', stiffness: 360, damping: 28, mass: 0.7 }}
      className={cn(
        'pointer-events-auto relative w-full max-w-[440px] rounded-2xl bg-surface px-5 py-4 shadow-lift ring-1',
        ring,
      )}
    >
      <div className="flex items-start gap-3.5">
        <span
          className={cn(
            'grid h-9 w-9 shrink-0 place-items-center rounded-xl',
            badge,
          )}
        >
          <Icon size={19} className={cls} />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-[15px] font-semibold leading-snug tracking-[-0.01em] text-ink">
            {toast.title}
          </p>
          {toast.description && (
            <p className="mt-1 text-[13.5px] leading-relaxed text-ink-muted">{toast.description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="btn-icon -mr-2 -mt-1 h-8 w-8 shrink-0"
          aria-label="Dismiss"
        >
          <X size={15} />
        </button>
      </div>
    </motion.div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

/* ------------------------------------------------------------------ *
 * Confirm dialog
 * ------------------------------------------------------------------ */

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  tone = 'primary',
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  tone?: 'primary' | 'danger';
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            type="button"
            className={tone === 'danger' ? 'btn-danger' : 'btn-primary'}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-[13.5px] leading-relaxed text-ink-muted">{message}</p>
    </Modal>
  );
}
