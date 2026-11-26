/**
 * Give a water nudge a way to reach a hidden buddy.
 *
 * Water nudges are drawn inside the buddy window. Hiding the buddy (tray or
 * sleep) keeps the renderer alive but takes that bubble off screen, so a due
 * nudge would otherwise go unseen. A hidden window therefore gets the nudge as
 * an OS notification instead, and clicking it brings the buddy back so the
 * glass can still be logged.
 *
 * `show` receives the notification details and returns true only when the
 * notification was actually shown.
 */
function notifyHiddenWaterNudge({ window, notice, show, showBuddy }) {
  if (!window || window.isDestroyed()) return false;
  // a visible buddy shows the nudge in its own bubble; no duplicate popup
  if (window.isVisible()) return false;
  if (
    !notice ||
    typeof notice.title !== "string" ||
    typeof notice.body !== "string"
  ) {
    return false;
  }

  return (
    show({
      title: notice.title,
      body: notice.body,
      onClick: () => showBuddy(),
    }) === true
  );
}

module.exports = { notifyHiddenWaterNudge };
