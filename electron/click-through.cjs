// Forwarding mouse moves to an ignoring window is only implemented on Windows
// and macOS. Without it the renderer would never learn that the pointer came
// back, leaving the pet permanently unclickable on Linux, so click-through
// stays off there and the window keeps its normal behaviour.
const FORWARDS_MOUSE_MOVES = new Set(["win32", "darwin"]);

const ignoreState = new WeakMap();

/**
 * Let the mouse fall through a transparent window (`ignore = true`) or take it
 * back. Calls are skipped while the state does not change, so moving around
 * inside the window does not talk to Electron on every frame.
 *
 * `platform` is injectable for tests; callers use the real platform.
 */
function setClickThrough(window, ignore, platform = process.platform) {
  if (!window || window.isDestroyed()) return;
  if (!FORWARDS_MOUSE_MOVES.has(platform)) return;

  const next = ignore === true;
  if (ignoreState.get(window) === next) return;
  ignoreState.set(window, next);

  if (next) {
    // forwarded moves keep the renderer able to notice the pointer returning
    window.setIgnoreMouseEvents(true, { forward: true });
  } else {
    window.setIgnoreMouseEvents(false);
  }
}

module.exports = { setClickThrough };
