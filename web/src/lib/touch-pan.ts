/**
 * One finger panning, even when the app shell does not pan the page itself.
 *
 * A browser pans a pinch zoomed page with one finger. Some app shells (a
 * WebView or an installed app) do not: after a pinch zoom the same page only
 * moves with two fingers, which feels broken. Here every single finger drag is
 * watched, and when the page does not follow the finger the page is scrolled
 * from script instead - with the same flick momentum - so one finger is always
 * enough.
 *
 * Safe by construction: a drag the page follows is never touched, a pane that
 * scrolls on its own keeps its gesture, and text fields keep theirs.
 */

/** How far the finger travels before we decide who scrolls. */
const DECIDE_AFTER = 16;
/** And at least this many move events, so a late scroll report cannot fool us. */
const DECIDE_AFTER_MOVES = 2;

function ownScroller(target: EventTarget | null, dy: number): boolean {
  let node = target instanceof Element ? target : null;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = getComputedStyle(node);
    const scrollable = /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 8;
    if (scrollable) {
      const roomUp = node.scrollTop;
      const roomDown = node.scrollHeight - node.clientHeight - node.scrollTop;
      if ((dy < 0 && roomDown > 8) || (dy > 0 && roomUp > 8)) return true;
    }
    node = node.parentElement;
  }
  return false;
}

export function installOneFingerPan(): () => void {
  let tracking = false;
  let taken = false;
  let startX = 0;
  let startY = 0;
  let lastY = 0;
  let lastTime = 0;
  let scrollAtStart = 0;
  let velocity = 0; // px per ms, positive = the page scrolls down
  let inertia = 0;
  let moves = 0;
  let sawScroll = false;

  const noteScroll = () => {
    sawScroll = true;
  };

  const stopInertia = () => {
    if (inertia) {
      cancelAnimationFrame(inertia);
      inertia = 0;
    }
  };

  const glide = () => {
    if (Math.abs(velocity) < 0.05) {
      inertia = 0;
      return;
    }
    velocity *= 0.92;
    window.scrollBy(0, velocity * 16);
    if (Math.abs(velocity) < 0.02) {
      inertia = 0;
      return;
    }
    inertia = requestAnimationFrame(glide);
  };

  const release = () => {
    const shouldGlide = taken && Math.abs(velocity) > 0.08;
    tracking = false;
    taken = false;
    document.removeEventListener('touchmove', onMove, true);
    document.removeEventListener('touchend', release, true);
    document.removeEventListener('touchcancel', release, true);
    window.removeEventListener('scroll', noteScroll, true);
    if (shouldGlide) {
      stopInertia();
      inertia = requestAnimationFrame(glide);
    }
  };

  function onMove(event: TouchEvent) {
    if (!tracking) return;
    if (event.touches.length !== 1) {
      tracking = false;
      taken = false;
      document.removeEventListener('touchmove', onMove, true);
      return;
    }

    const touch = event.touches[0];
    const travelledY = touch.clientY - startY;
    const stepY = touch.clientY - lastY;
    const now = performance.now();
    const elapsed = now - lastTime;
    moves += 1;

    if (!taken) {
      if (moves < DECIDE_AFTER_MOVES || Math.abs(travelledY) < DECIDE_AFTER) {
        lastY = touch.clientY;
        lastTime = now;
        return;
      }

      // The page has already followed the finger: the shell has this gesture.
      if (sawScroll || window.scrollY !== scrollAtStart) {
        release();
        return;
      }

      // A clearly sideways drag, or a pane with its own scroll, is left alone.
      if (Math.abs(touch.clientX - startX) > Math.abs(travelledY) * 1.4) {
        release();
        return;
      }
      if (ownScroller(event.target, travelledY)) {
        release();
        return;
      }

      taken = true;
      lastY = touch.clientY;
      lastTime = now;
      velocity = 0;
      return;
    }

    if (elapsed > 0) {
      const speed = -stepY / elapsed;
      // Smooth the reading so one slow frame cannot kill the flick.
      velocity = velocity * 0.55 + speed * 0.45;
      velocity = Math.max(-3, Math.min(3, velocity));
    }
    lastY = touch.clientY;
    lastTime = now;

    if (event.cancelable) event.preventDefault();
    window.scrollBy(0, -stepY);
  }

  const onStart = (event: TouchEvent) => {
    if (event.touches.length !== 1) {
      tracking = false;
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) {
      tracking = false;
      return;
    }

    stopInertia();
    tracking = true;
    taken = false;
    moves = 0;
    sawScroll = false;
    velocity = 0;
    startX = event.touches[0].clientX;
    startY = lastY = event.touches[0].clientY;
    lastTime = performance.now();
    scrollAtStart = window.scrollY;

    document.addEventListener('touchmove', onMove, true);
    document.addEventListener('touchend', release, true);
    document.addEventListener('touchcancel', release, true);
    window.addEventListener('scroll', noteScroll, { passive: true, capture: true });
  };

  document.addEventListener('touchstart', onStart, { passive: true, capture: true });

  return () => {
    document.removeEventListener('touchstart', onStart, true);
    release();
  };
}
