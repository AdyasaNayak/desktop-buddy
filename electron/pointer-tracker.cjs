// Electron can only forward mouse moves to an ignoring window on Windows and
// macOS. Elsewhere the renderer would never learn that the pointer came back,
// so the main process polls the cursor instead and tells the renderer where it
// is. The same updates also cover a freshly shown window, where no mouse move
// has happened yet.

const POINTER_POLL_MS = 40;

/**
 * Convert a screen point into coordinates inside `bounds`. `inside` uses the
 * unrounded difference so a pointer exactly on the right/bottom edge is
 * already outside.
 */
function toWindowPoint(point, bounds) {
  if (!point || !bounds) return { x: 0, y: 0, inside: false };
  const x = point.x - bounds.x;
  const y = point.y - bounds.y;
  return {
    x: Math.round(x),
    y: Math.round(y),
    inside: x >= 0 && y >= 0 && x < bounds.width && y < bounds.height,
  };
}

/**
 * Poll the cursor while the buddy window is visible and report changes.
 *
 * Outside the window only the transition is sent, so moving around the
 * desktop does not flood the renderer. `reset` forgets the last point, which
 * makes the next tick report the current position after a show or resize.
 */
function createPointerTracker({
  getWindow,
  getCursor,
  send,
  intervalMs = POINTER_POLL_MS,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
}) {
  let timer;
  let lastKey = null;

  const tick = () => {
    const window = getWindow();
    if (
      !window ||
      (typeof window.isDestroyed === "function" && window.isDestroyed()) ||
      (typeof window.isVisible === "function" && !window.isVisible())
    ) {
      lastKey = null;
      return;
    }

    const point = toWindowPoint(getCursor(), window.getBounds());
    const key = point.inside ? `in:${point.x},${point.y}` : "out";
    if (key === lastKey) return;
    lastKey = key;
    send(point);
  };

  return {
    start() {
      if (timer !== undefined) return;
      timer = setIntervalFn(tick, intervalMs);
    },
    stop() {
      if (timer === undefined) return;
      clearIntervalFn(timer);
      timer = undefined;
      lastKey = null;
    },
    reset() {
      lastKey = null;
    },
    tick,
  };
}

module.exports = { POINTER_POLL_MS, createPointerTracker, toWindowPoint };
