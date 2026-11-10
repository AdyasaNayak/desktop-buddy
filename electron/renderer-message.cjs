/**
 * Send an IPC message to a renderer that may already be gone.
 *
 * Reminder timers outlive the window that scheduled them, so the captured
 * sender can point at a destroyed renderer by the time the reminder fires.
 * Returns true only when the message was sent.
 */
function sendToRenderer(sender, channel, ...args) {
  if (!sender || typeof sender.isDestroyed !== "function") return false;
  if (sender.isDestroyed()) return false;

  try {
    sender.send(channel, ...args);
    return true;
  } catch (error) {
    console.error("Could not message the renderer", error);
    return false;
  }
}

module.exports = { sendToRenderer };
