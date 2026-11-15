import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ListOrdered } from 'lucide-react';
import { cn } from '@/lib/cn';

const STORAGE_KEY = 'bronee.hrms.list-numbering.v1';

interface NumberingState {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  toggle: () => void;
}

const NumberingContext = createContext<NumberingState>({
  enabled: true,
  setEnabled: () => undefined,
  toggle: () => undefined,
});

/**
 * Keeps the serial numbering preference for every list in the site.
 * The choice is remembered between visits.
 */
export function NumberingProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) setEnabled(stored !== 'off');
    } catch {
      /* storage unavailable — the default stays on */
    }
  }, []);

  // The attribute drives the numbering of lists that are not tables.
  useEffect(() => {
    document.documentElement.dataset.listNumbering = enabled ? 'on' : 'off';
  }, [enabled]);

  const update = useCallback((next: boolean) => {
    setEnabled(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
    } catch {
      /* storage unavailable — the choice simply does not persist */
    }
  }, []);

  const value = useMemo<NumberingState>(
    () => ({ enabled, setEnabled: update, toggle: () => update(!enabled) }),
    [enabled, update],
  );

  return <NumberingContext.Provider value={value}>{children}</NumberingContext.Provider>;
}

export function useNumbering(): NumberingState {
  return useContext(NumberingContext);
}

/**
 * The switch that turns serial numbering on and off for the whole site.
 *
 * It is an icon-only button and it always sits directly above the list it
 * belongs to — never in the page header.
 */
export function NumberingToggle({ className }: { className?: string }) {
  const { enabled, toggle } = useNumbering();
  const label = enabled ? 'Hide the serial numbers' : 'Show the serial numbers';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn(
        'btn-icon h-8 w-8 border border-line-strong',
        enabled && 'border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100',
        className,
      )}
    >
      <ListOrdered size={16} />
    </button>
  );
}

/**
 * A thin bar that holds the serial-numbering switch directly above a list
 * that is not rendered with the data table.
 */
export function NumberingBar({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-end', className)}>
      <NumberingToggle />
    </div>
  );
}
