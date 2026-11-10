/**
 * Show a native notification when the platform supports one.
 *
 * Notifications are a side channel: a system without notification support,
 * or a notification that fails to show, must not stop the reminder or window
 * action that triggered it. `Notification` is injected so the guard and error
 * handling can be tested without Electron.
 *
 * Returns true only when the notification was actually shown.
 */
function showNotification({
  Notification,
  title,
  body,
  onClick,
  failureMessage = "Could not show a notification",
}) {
  if (
    !Notification ||
    typeof Notification.isSupported !== "function" ||
    !Notification.isSupported()
  ) {
    return false;
  }

  try {
    const notification = new Notification({ title, body });
    if (typeof onClick === "function") notification.on("click", onClick);
    notification.show();
    return true;
  } catch (error) {
    console.error(failureMessage, error);
    return false;
  }
}

module.exports = { showNotification };
