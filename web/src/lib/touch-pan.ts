/**
 * One finger panning, even when the app shell does not pan the page itself.
 *
 * A browser pans a pinch zoomed page with one finger. Some app shells (a
 * WebView or an installed app) do not: after a pinch zoom the same page only
 * moves with two fingers, which feels broken. Here a single finger drag is
 * watched, and whenever the page did not move on its own the page is scrolled
 * from script instead - so one finger is always enough.
 *
 * Safe by construction: a page that follows the finger is never touched, a
 * pane that scrolls on its own keeps its gesture, and touch fields keep theirs.
 */

const TRAVEL_BEFORE_DECIDING = 12;

function isEmbedded(): boolean {
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  if (window.matchMedia?.('(display-mode: fullscreen)').matches) return true;
  if (navigator.userAgent.includes('; wv)')) return true;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isZoomed(): boolean {
  return (window.visualViewport?.scale ?? 1) > 1.01;
}

/** A pane under the finger that can still scroll the way the finger moves. */
function ownScroller(target: EventTarget | null, dy: number): boolean {
  let node = target instanceof Element ? target : null;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = getComputedStyle(node);
    const scrolls = /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 2;
    if (scrolls) {
      const atTop = node.scrollTop <= 0;
      const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 2;
      if ((dy < 0 && !atBottom) || (dy > 0 && !atTop)) return true;
    }
    node = node.parentElement;
  }
  return false;
}

export function installOneFingerPan(): () => void {
  let taken = false;
  let startX = 0;
  let startY = 0;
  let lastY = 0;
  let scrollAtStart = 0;

  // The move listener is only attached for the duration of a single finger
  // drag, so ordinary scrolling keeps its passive listeners.
  const stop = () => {
    taken = false;
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', stop);
    document.removeEventListener('touchcancel', stop);
  };

  function onMove(event: TouchEvent) {
    if (event.touches.length !== 1) {
      stop();
      return;
    }
    const touch = event.touches[0];
    const travelledY = touch.clientY - startY;
    const stepY = touch.clientY - lastY;
    lastY = touch.clientY;

    if (!taken) {
      if (Math.abs(travelledY) < TRAVEL_BEFORE_DECIDING) return;
      // The page moved by itself: the shell is handling the gesture.
      if (Math.abs(window.scrollY - scrollAtStart) > 2) {
        stop();
        return;
      }
      // A sideways gesture, or a pane with its own scroll, is left alone.
      if (Math.abs(touch.clientX - startX) > Math.abs(travelledY)) {
        stop();
        return;
      }
      if (ownScroller(event.target, travelledY)) {
        stop();
        return;
      }
      taken = true;
    }

    if (event.cancelable) event.preventDefault();
    window.scrollBy(0, -stepY);
  }

  const onStart = (event: TouchEvent) => {
    if (event.touches.length !== 1) return;
    if (!isZoomed() && !isEmbedded()) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;

    taken = false;
    startX = event.touches[0].clientX;
    startY = lastY = event.touches[0].clientY;
    scrollAtStart = window.scrollY;

    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', stop, { passive: true });
    document.addEventListener('touchcancel', stop, { passive: true });
  };

  document.addEventListener('touchstart', onStart, { passive: true });

  return () => {
    document.removeEventListener('touchstart', onStart);
    stop();
  };
}
