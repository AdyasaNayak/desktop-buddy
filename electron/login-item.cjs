const LOGIN_ITEM_ERROR =
  "Windows did not accept the Start with Windows setting.";

/**
 * Read whether the installed app is registered to open at login. Electron
 * only supports login items on Windows and macOS; an unsupported platform or
 * a failed read is treated as not registered.
 */
function readLoginItem(app) {
  try {
    return app.getLoginItemSettings().openAtLogin === true;
  } catch (error) {
    console.error("Could not read the Start with Windows setting", error);
    return false;
  }
}

/**
 * Apply the Start with Windows choice and report what the OS actually saved.
 *
 * setLoginItemSettings does not return a result, so the registration is read
 * back afterwards. A mismatch or a thrown error is a failure the caller must
 * show instead of assuming the checkbox took effect.
 */
function setLoginItem(app, enabled) {
  if (typeof enabled !== "boolean") {
    return { ok: false, enabled: readLoginItem(app), error: LOGIN_ITEM_ERROR };
  }

  try {
    app.setLoginItemSettings({ openAtLogin: enabled });
    const actual = app.getLoginItemSettings().openAtLogin === true;
    return actual === enabled
      ? { ok: true, enabled: actual }
      : { ok: false, enabled: actual, error: LOGIN_ITEM_ERROR };
  } catch (error) {
    console.error("Could not change the Start with Windows setting", error);
    return { ok: false, enabled: readLoginItem(app), error: LOGIN_ITEM_ERROR };
  }
}

module.exports = { LOGIN_ITEM_ERROR, readLoginItem, setLoginItem };
