const fs = require("node:fs");

const HIDDEN_ARG = "--hidden";
// Signing in should not make the pet jump in front of whatever is on screen.
const DEFAULT_LAUNCH_HIDDEN = true;

/**
 * Whether login starts the buddy hidden in the tray. Missing or damaged
 * preferences fall back to the quiet default.
 */
function readLaunchHidden(filePath) {
  try {
    const preferences = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return preferences?.launchHidden === false ? false : DEFAULT_LAUNCH_HIDDEN;
  } catch {
    // a missing or damaged file just means the default applies
    return DEFAULT_LAUNCH_HIDDEN;
  }
}

/** Save the hidden-at-login choice, returning false when it could not be written. */
function writeLaunchHidden(filePath, enabled) {
  if (typeof enabled !== "boolean") return false;
  try {
    fs.writeFileSync(filePath, `${JSON.stringify({ launchHidden: enabled })}\n`);
    return true;
  } catch {
    return false;
  }
}

/**
 * The extra launch argument for a login item that should start in the tray.
 * Turning login off, or choosing a visible launch, clears the argument.
 */
function loginItemArgs(openAtLogin, launchHidden) {
  return openAtLogin === true && launchHidden === true ? [HIDDEN_ARG] : [];
}

/**
 * True only when this launch came from a login item the user asked to keep
 * hidden. A normal launch of the app still shows the buddy.
 */
function wasLaunchedHidden({
  argv = [],
  launchHidden = false,
  openedAtLogin = false,
} = {}) {
  if (launchHidden !== true) return false;
  if (Array.isArray(argv) && argv.includes(HIDDEN_ARG)) return true;
  return openedAtLogin === true;
}

/**
 * Register or remove the login item, including the hidden launch argument.
 * `enabled: false` keeps a login item the user disabled in Windows startup
 * settings disabled while its arguments are updated.
 */
function applyLoginItemSettings(
  app,
  { openAtLogin, launchHidden, enabled = true },
) {
  if (!app || app.isPackaged !== true) return false;
  const startsAtLogin = openAtLogin === true;
  const args = loginItemArgs(startsAtLogin, launchHidden);
  const settings = { openAtLogin: startsAtLogin, args };
  if (startsAtLogin && enabled === false) settings.enabled = false;
  app.setLoginItemSettings(settings);
  return app.getLoginItemSettings({ args }).openAtLogin === startsAtLogin;
}

function loginItemIsEnabled(app, launchHidden) {
  if (!app || app.isPackaged !== true) return false;
  return (
    app.getLoginItemSettings({ args: loginItemArgs(true, launchHidden) })
      .openAtLogin === true
  );
}

/**
 * Windows reports `executableWillLaunchAtLogin: false` when the user turned
 * the app off in Task Manager, even though the registry entry still exists.
 */
function loginItemWillLaunch(app, launchHidden) {
  if (!app || app.isPackaged !== true) return true;
  return (
    app.getLoginItemSettings({ args: loginItemArgs(true, launchHidden) })
      .executableWillLaunchAtLogin !== false
  );
}

/**
 * Older versions registered the login item without the hidden argument. When
 * login is already on, rewrite it so the saved choice takes effect. A user who
 * turned login off in the OS is left alone.
 */
function reconcileLoginItem(app, launchHidden) {
  if (launchHidden !== true) return false;
  if (loginItemIsEnabled(app, true)) return false;
  if (!loginItemIsEnabled(app, false)) return false;
  applyLoginItemSettings(app, {
    openAtLogin: true,
    launchHidden: true,
    enabled: loginItemWillLaunch(app, false),
  });
  return true;
}

module.exports = {
  DEFAULT_LAUNCH_HIDDEN,
  HIDDEN_ARG,
  applyLoginItemSettings,
  loginItemArgs,
  loginItemIsEnabled,
  loginItemWillLaunch,
  readLaunchHidden,
  reconcileLoginItem,
  wasLaunchedHidden,
  writeLaunchHidden,
};
