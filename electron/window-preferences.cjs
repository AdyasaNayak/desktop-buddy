const fs = require("node:fs");

const DEFAULT_ALWAYS_ON_TOP = true;

/**
 * Whether the buddy should stay above other windows. Missing or damaged
 * preferences fall back to the original always-on-top behaviour.
 */
function readAlwaysOnTop(filePath) {
  try {
    const preferences = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return preferences?.alwaysOnTop === false ? false : DEFAULT_ALWAYS_ON_TOP;
  } catch {
    // a missing or damaged file just means the default applies
    return DEFAULT_ALWAYS_ON_TOP;
  }
}

/** Save the always-on-top choice, returning false when it could not be written. */
function writeAlwaysOnTop(filePath, enabled) {
  if (typeof enabled !== "boolean") return false;
  try {
    fs.writeFileSync(filePath, `${JSON.stringify({ alwaysOnTop: enabled })}\n`);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  DEFAULT_ALWAYS_ON_TOP,
  readAlwaysOnTop,
  writeAlwaysOnTop,
};
