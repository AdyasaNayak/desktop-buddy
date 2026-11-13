/**
 * Tell the renderer that the buddy window was hidden or woken from sleep.
 *
 * A hidden Electron window keeps its DOM alive, so a menu or dialog that was
 * open when it disappeared would still be there when it comes back. The
 * renderer listens for these events to drop that transient state and to
 * resume a work timer that sleep paused.
 */
function sendWindowEvent(window, channel) {
  if (!window || window.isDestroyed()) return;
  const contents = window.webContents;
  if (!contents || contents.isDestroyed()) return;
  contents.send(channel);
}

function notifyWindowHidden(window) {
  sendWindowEvent(window, "window-hidden");
}

function notifyWindowWake(window) {
  sendWindowEvent(window, "window-wake");
}

module.exports = { notifyWindowHidden, notifyWindowWake };
