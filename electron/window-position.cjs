const fs = require("node:fs");

/**
 * Keep a window fully inside one display's work area. A window larger than the
 * work area is pinned to its top-left edge instead of producing an impossible
 * negative maximum.
 */
function clampToArea(bounds, area) {
  const maxX = area.x + Math.max(0, area.width - bounds.width);
  const maxY = area.y + Math.max(0, area.height - bounds.height);
  return {
    ...bounds,
    x: Math.min(Math.max(bounds.x, area.x), maxX),
    y: Math.min(Math.max(bounds.y, area.y), maxY),
  };
}

function isFinitePosition(position) {
  return (
    position != null &&
    Number.isFinite(position.x) &&
    Number.isFinite(position.y)
  );
}

/** Last saved top-left corner, or null when missing or malformed. */
function readWindowPosition(filePath) {
  try {
    const position = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!isFinitePosition(position)) return null;
    return { x: Math.round(position.x), y: Math.round(position.y) };
  } catch {
    // a missing or damaged file just means there is nothing to restore
    return null;
  }
}

/** Save the top-left corner, returning false when it could not be written. */
function writeWindowPosition(filePath, position) {
  if (!isFinitePosition(position)) return false;
  try {
    fs.writeFileSync(
      filePath,
      `${JSON.stringify({
        x: Math.round(position.x),
        y: Math.round(position.y),
      })}\n`,
    );
    return true;
  } catch {
    return false;
  }
}

module.exports = { clampToArea, readWindowPosition, writeWindowPosition };
