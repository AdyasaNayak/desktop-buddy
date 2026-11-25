const fs = require("node:fs");

// How close a dragged window must come to a work-area edge before it snaps.
const SNAP_DISTANCE = 24;

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

function snapAxis(position, min, max, distance) {
  // a window larger than the work area has no valid opposite edge to snap to
  if (max < min) return position;

  const toMin = Math.abs(position - min);
  const toMax = Math.abs(position - max);
  if (toMin > distance && toMax > distance) return position;
  return toMin <= toMax ? min : max;
}

/**
 * Pull a window towards the nearest work-area edges when it is already close.
 * The two axes are independent, so a corner snaps both ways.
 */
function snapToArea(bounds, area, distance = SNAP_DISTANCE) {
  if (!area || !Number.isFinite(distance) || distance < 0) return bounds;

  const maxX = area.x + area.width - bounds.width;
  const maxY = area.y + area.height - bounds.height;
  const x = snapAxis(bounds.x, area.x, maxX, distance);
  const y = snapAxis(bounds.y, area.y, maxY, distance);
  if (x === bounds.x && y === bounds.y) return bounds;
  return { ...bounds, x, y };
}

function distanceToArea(point, area) {
  const dx =
    point.x < area.x
      ? area.x - point.x
      : point.x > area.x + area.width
        ? point.x - (area.x + area.width)
        : 0;
  const dy =
    point.y < area.y
      ? area.y - point.y
      : point.y > area.y + area.height
        ? point.y - (area.y + area.height)
        : 0;
  return Math.hypot(dx, dy);
}

/**
 * The display that should hold `point`. A remembered display wins even when
 * the layout changed since the last run; otherwise the nearest work area is
 * used, so monitor gaps and removed displays fall back safely.
 */
function displayForPoint(displays, point, preferredId) {
  if (!Array.isArray(displays) || displays.length === 0 || !point) return null;

  if (Number.isInteger(preferredId)) {
    const preferred = displays.find((display) => display.id === preferredId);
    if (preferred) return preferred;
  }

  let nearest = null;
  let nearestDistance = Infinity;
  for (const display of displays) {
    if (!display || !display.workArea) continue;
    const distance = distanceToArea(point, display.workArea);
    if (distance < nearestDistance) {
      nearest = display;
      nearestDistance = distance;
    }
  }
  return nearest;
}

/**
 * Restore a saved top-left corner onto an available display. The display id
 * keeps the buddy on the monitor it was left on; its position is clamped so a
 * changed resolution or monitor layout cannot hide it.
 */
function resolveWindowPosition(saved, displays, size) {
  if (!isFinitePosition(saved) || !size) return null;

  const bounds = {
    width: size.width,
    height: size.height,
    x: Math.round(saved.x),
    y: Math.round(saved.y),
  };
  const point = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  const display = displayForPoint(displays, point, saved.displayId);
  if (!display) return { x: bounds.x, y: bounds.y };

  const clamped = clampToArea(bounds, display.workArea);
  return { x: clamped.x, y: clamped.y };
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

    const saved = {
      x: Math.round(position.x),
      y: Math.round(position.y),
    };
    if (Number.isInteger(position.displayId)) {
      saved.displayId = position.displayId;
    }
    return saved;
  } catch {
    // a missing or damaged file just means there is nothing to restore
    return null;
  }
}

/** Save the top-left corner, returning false when it could not be written. */
function writeWindowPosition(filePath, position) {
  if (!isFinitePosition(position)) return false;

  const saved = {
    x: Math.round(position.x),
    y: Math.round(position.y),
  };
  if (Number.isInteger(position.displayId)) {
    saved.displayId = position.displayId;
  }

  try {
    fs.writeFileSync(filePath, `${JSON.stringify(saved)}\n`);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  SNAP_DISTANCE,
  clampToArea,
  displayForPoint,
  readWindowPosition,
  resolveWindowPosition,
  snapToArea,
  writeWindowPosition,
};
