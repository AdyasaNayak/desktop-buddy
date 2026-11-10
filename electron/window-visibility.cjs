/**
 * Tell the renderer that the buddy window was hidden.
 *
 * A hidden Electron window keeps its DOM alive, so a menu or dialog that was
 * open when it disappeared would still be there when it comes back. The
 * renderer listens for this event and drops that transient state.
 */
function notifyWindowHidden(window) {
  if (!window || window.isDestroyed()) return;
  const contents = window.webContents;
  if (!contents || contents.isDestroyed()) return;
  contents.send("window-hidden");
}

module.exports = { notifyWindowHidden };
