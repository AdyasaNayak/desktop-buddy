/**
 * Hide the buddy window, but only when the user can bring it back.
 *
 * A tray icon is the reliable way back. Without one, the fallback is a
 * notification telling the user to open the app again. When that notification
 * cannot be shown either, the window stays visible: hiding it would leave the
 * app running with nothing on screen and no way to restore it.
 *
 * `showHint` must return true only when the notification was actually shown.
 * The returned `hintShown` is the state to remember for the next hide.
 */
function hideBuddy({ window, hasTray, hintShown, showHint }) {
  if (!window || window.isDestroyed()) {
    return { hidden: false, hintShown };
  }

  // Without a tray, every hide needs its own instructions because none stay
  // on screen. With a tray, one reminder is enough.
  const notify = !hasTray || !hintShown;
  const notified = notify && showHint() === true;
  const nextHintShown = hintShown || notified;

  if (!hasTray && !notified) {
    // nothing on screen or in the tray could bring the buddy back
    if (!window.isVisible()) window.show();
    return { hidden: false, hintShown: nextHintShown };
  }

  window.hide();
  return { hidden: true, hintShown: nextHintShown };
}

module.exports = { hideBuddy };
