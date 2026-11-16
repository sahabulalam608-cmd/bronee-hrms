import { useCallback, useEffect, useState } from 'react';

/**
 * How the signed-in portal is drawn on a phone.
 *
 * `browser` — the normal responsive page. The document scrolls, so pinch zoom,
 *             zoom out and panning work in every direction.
 * `desktop` — a 1280px layout viewport, the same thing a browser does when it
 *             "requests the desktop site".
 */
export type ViewMode = 'browser' | 'desktop';

const STORAGE_KEY = 'bronee:view-mode';

/** The width of the layout viewport in desktop mode. */
const DESKTOP_WIDTH = 1280;

const VIEWPORTS: Record<ViewMode, string> = {
  browser: 'width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=5, user-scalable=yes',
  desktop: `width=${DESKTOP_WIDTH}, viewport-fit=cover, maximum-scale=5, user-scalable=yes`,
};

function viewportTag(): HTMLMetaElement | null {
  return document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
}

export function readViewMode(): ViewMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'desktop' ? 'desktop' : 'browser';
  } catch {
    return 'browser';
  }
}

function storeViewMode(mode: ViewMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* private mode - the choice simply does not survive a reload */
  }
}

/** Writes the viewport and the layout flag that the stylesheet keys off. */
export function applyViewMode(mode: ViewMode): void {
  document.documentElement.dataset.viewMode = mode;
  viewportTag()?.setAttribute('content', VIEWPORTS[mode]);
}

/** A phone or a small tablet - the only place where the mode means something. */
function isSmallTouchScreen(): boolean {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const shortSide = Math.min(window.screen.width, window.screen.height);
  return coarse && shortSide <= 820;
}

export function useViewMode() {
  const [mode, setMode] = useState<ViewMode>(readViewMode);

  // Keep the document in step when the page is restored from the back/forward cache.
  useEffect(() => {
    applyViewMode(mode);
    const restore = () => applyViewMode(readViewMode());
    window.addEventListener('pageshow', restore);
    return () => window.removeEventListener('pageshow', restore);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const change = useCallback((next: ViewMode) => {
    setMode((current) => {
      if (current === next) return current;
      storeViewMode(next);
      applyViewMode(next);

      // Chrome and Edge follow the new viewport at once. iOS Safari only reads it
      // on a fresh load, so reload when the layout did not follow the mode.
      window.setTimeout(() => {
        const width = window.innerWidth;
        const stale = next === 'desktop' ? width < 1000 : width >= 1000;
        if (stale && isSmallTouchScreen()) window.location.reload();
      }, 400);

      return next;
    });
  }, []);

  const toggle = useCallback(() => {
    change(mode === 'desktop' ? 'browser' : 'desktop');
  }, [change, mode]);

  return { mode, setMode: change, toggle, isDesktopView: mode === 'desktop' };
}
