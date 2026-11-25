const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  clampToArea,
  displayForPoint,
  readWindowPosition,
  resolveWindowPosition,
  snapToArea,
  writeWindowPosition,
} = require("../electron/lib/window-position.cjs");

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

test("a window near an edge snaps flush against it", () => {
  const maxX = AREA.x + AREA.width - WINDOW.width;
  const maxY = AREA.y + AREA.height - WINDOW.height;

  assert.deepEqual(
    snapToArea({ ...WINDOW, x: AREA.x + 10, y: AREA.y + 10 }, AREA),
    { ...WINDOW, x: AREA.x, y: AREA.y },
  );
  assert.deepEqual(
    snapToArea({ ...WINDOW, x: maxX - 10, y: maxY - 10 }, AREA),
    { ...WINDOW, x: maxX, y: maxY },
  );
});

test("a drag outside the snap zone keeps its exact position", () => {
  assert.deepEqual(
    snapToArea({ ...WINDOW, x: AREA.x + 40, y: AREA.y + 40 }, AREA),
    { ...WINDOW, x: AREA.x + 40, y: AREA.y + 40 },
  );
  assert.deepEqual(
    snapToArea({ ...WINDOW, x: AREA.x, y: AREA.y }, AREA, 0),
    { ...WINDOW, x: AREA.x, y: AREA.y },
  );
});

test("a window wider than the work area is not pulled past its edge", () => {
  assert.deepEqual(
    snapToArea({ width: 1200, height: 900, x: 110, y: 60 }, AREA),
    { width: 1200, height: 900, x: 110, y: 60 },
  );
});

test("the remembered display wins when it still exists", () => {
  const left = { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1080 } };
  const right = { id: 2, workArea: { x: 1920, y: 0, width: 1600, height: 900 } };

  assert.equal(displayForPoint([left, right], { x: 2500, y: 100 }), right);
  assert.equal(displayForPoint([left, right], { x: 2500, y: 100 }, 1), left);
});

test("a removed display falls back to the nearest available one", () => {
  const left = { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1080 } };
  const right = { id: 2, workArea: { x: 2400, y: 0, width: 1600, height: 900 } };

  assert.equal(displayForPoint([left, right], { x: 2000, y: 100 }, 99), left);
  assert.equal(displayForPoint([], { x: 2000, y: 100 }, 2), null);
});

test("restoring a position keeps the buddy on its remembered monitor", () => {
  const left = { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1080 } };
  const right = { id: 2, workArea: { x: 1920, y: 0, width: 1600, height: 900 } };

  assert.deepEqual(
    resolveWindowPosition({ x: 2500, y: 100, displayId: 2 }, [left, right], WINDOW),
    { x: 2500, y: 100 },
  );
  assert.deepEqual(
    resolveWindowPosition({ x: 5000, y: 100, displayId: 2 }, [left, right], WINDOW),
    { x: 3160, y: 100 },
  );
  assert.deepEqual(
    resolveWindowPosition({ x: -300, y: 100, displayId: 1 }, [left, right], WINDOW),
    { x: 0, y: 100 },
  );

  const movedRight = {
    id: 2,
    workArea: { x: 3000, y: 0, width: 1600, height: 900 },
  };
  assert.deepEqual(
    resolveWindowPosition(
      { x: 2500, y: 100, displayId: 2 },
      [left, movedRight],
      WINDOW,
    ),
    { x: 3000, y: 100 },
  );
});

test("an old saved position restores on the monitor it now belongs to", () => {
  const left = { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1080 } };
  const right = { id: 2, workArea: { x: 1920, y: 0, width: 1600, height: 900 } };

  assert.deepEqual(resolveWindowPosition({ x: 2000, y: 100 }, [left, right], WINDOW), {
    x: 2000,
    y: 100,
  });
  assert.equal(resolveWindowPosition({ x: 20 }, [left], WINDOW), null);
});

test("the saved display id survives a round-trip and malformed ids are ignored", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buddy-position-"));
  const file = path.join(dir, "window-position.json");
  try {
    assert.equal(
      writeWindowPosition(file, { x: 320.4, y: -8.6, displayId: 7 }),
      true,
    );
    assert.deepEqual(readWindowPosition(file), {
      x: 320,
      y: -9,
      displayId: 7,
    });

    fs.writeFileSync(file, JSON.stringify({ x: 20, y: 30, displayId: "7" }));
    assert.deepEqual(readWindowPosition(file), { x: 20, y: 30 });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a malformed display id is not saved", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buddy-position-"));
  const file = path.join(dir, "window-position.json");
  try {
    assert.equal(
      writeWindowPosition(file, { x: 20, y: 30, displayId: "7" }),
      true,
    );
    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), {
      x: 20,
      y: 30,
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
