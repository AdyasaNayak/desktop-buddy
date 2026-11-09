const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  clampToArea,
  readWindowPosition,
  writeWindowPosition,
} = require("../electron/window-position.cjs");

const AREA = { x: 100, y: 50, width: 1000, height: 700 };
const WINDOW = { width: 360, height: 260 };

test("a window already inside the work area keeps its position", () => {
  assert.deepEqual(clampToArea({ ...WINDOW, x: 300, y: 200 }, AREA), {
    ...WINDOW,
    x: 300,
    y: 200,
  });
});

test("dragging past the top or left edge pins the window to it", () => {
  assert.deepEqual(clampToArea({ ...WINDOW, x: -500, y: -500 }, AREA), {
    ...WINDOW,
    x: AREA.x,
    y: AREA.y,
  });
});

test("dragging past the bottom or right edge keeps the window on screen", () => {
  assert.deepEqual(clampToArea({ ...WINDOW, x: 5000, y: 5000 }, AREA), {
    ...WINDOW,
    x: AREA.x + AREA.width - WINDOW.width,
    y: AREA.y + AREA.height - WINDOW.height,
  });
});

test("a window larger than the work area stays at its top-left edge", () => {
  assert.deepEqual(
    clampToArea({ width: 1200, height: 900, x: 5000, y: 5000 }, AREA),
    { width: 1200, height: 900, x: AREA.x, y: AREA.y },
  );
});

test("a saved position round-trips through the state file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buddy-position-"));
  const file = path.join(dir, "window-position.json");
  try {
    assert.equal(writeWindowPosition(file, { x: 320.4, y: -8.6 }), true);
    assert.deepEqual(readWindowPosition(file), { x: 320, y: -9 });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("missing, damaged, or incomplete state is ignored", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buddy-position-"));
  const file = path.join(dir, "window-position.json");
  try {
    assert.equal(readWindowPosition(file), null);

    fs.writeFileSync(file, "{not json");
    assert.equal(readWindowPosition(file), null);

    fs.writeFileSync(file, JSON.stringify({ x: 20 }));
    assert.equal(readWindowPosition(file), null);

    fs.writeFileSync(file, JSON.stringify({ x: "20", y: 30 }));
    assert.equal(readWindowPosition(file), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("invalid positions are never written", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buddy-position-"));
  const file = path.join(dir, "window-position.json");
  try {
    assert.equal(writeWindowPosition(file, { x: Number.NaN, y: 10 }), false);
    assert.equal(fs.existsSync(file), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
