import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

type Toast = {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
};

type ToastContextValue = {
  toast: (input: { title: string; description?: string; tone?: ToastTone }) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<ToastTone, { icon: ReactNode; ring: string; iconColor: string }> = {
  success: {
    icon: <CheckCircle2 className="h-4.5 w-4.5" />,
    ring: 'ring-success/20',
    iconColor: 'text-success',
  },
  error: { icon: <XCircle className="h-4.5 w-4.5" />, ring: 'ring-danger/20', iconColor: 'text-danger' },
  warning: {
    icon: <AlertTriangle className="h-4.5 w-4.5" />,
    ring: 'ring-warning/20',
    iconColor: 'text-warning',
  },
  info: { icon: <Info className="h-4.5 w-4.5" />, ring: 'ring-info/20', iconColor: 'text-info' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    ({ title, description, tone = 'info' }: { title: string; description?: string; tone?: ToastTone }) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((current) => [...current.slice(-3), { id, title, description, tone }]);
      window.setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4200);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (title, description) => toast({ title, description, tone: 'success' }),
      error: (title, description) => toast({ title, description, tone: 'error' }),
      info: (title, description) => toast({ title, description, tone: 'info' }),
      warning: (title, description) => toast({ title, description, tone: 'warning' }),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end sm:px-0">
          <AnimatePresence initial={false}>
            {toasts.map((item) => {
              const style = TONE_STYLES[item.tone];
              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 16, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  className={cn(
                    'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl bg-white px-4 py-3.5 shadow-lg ring-1',
                    style.ring,
                  )}
                >
                  <span className={cn('mt-0.5 shrink-0', style.iconColor)}>{style.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-bold text-ink">{item.title}</p>
                    {item.description ? (
                      <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-muted">
                        {item.description}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => dismiss(item.id)}
                    aria-label="Dismiss notification"
                    className="-mr-1 -mt-1 shrink-0 rounded-lg p-1 text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>.');
  return context;
}
