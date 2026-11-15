import { useCallback, useEffect, useRef, useState } from 'react';

/** Load async data with loading/error state and a manual reload trigger. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const result = await fnRef.current();
        // The local adapter hands back the live array it mutates in place, so
        // a reference-equal result would skip the re-render and leave stale
        // derived values on screen. Copy arrays before storing them.
        if (!cancelled) {
          setData((Array.isArray(result) ? ([...result] as unknown as T) : result) as T);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Something went wrong.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload, setData };
}

/** A ticking clock for live timers — pauses when the tab is hidden. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: number;
    const tick = () => {
      if (!document.hidden) setNow(Date.now());
      timer = window.setTimeout(tick, intervalMs);
    };
    timer = window.setTimeout(tick, intervalMs);
    return () => window.clearTimeout(timer);
  }, [intervalMs]);
  return now;
}
