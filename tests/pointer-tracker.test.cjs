const test = require("node:test");
const assert = require("node:assert/strict");
const {
  POINTER_POLL_MS,
  createPointerTracker,
  toWindowPoint,
} = require("../electron/pointer-tracker.cjs");

const BOUNDS = { x: 100, y: 50, width: 360, height: 260 };

test("a screen point becomes a point inside the window", () => {
  assert.deepEqual(toWindowPoint({ x: 130, y: 80 }, BOUNDS), {
    x: 30,
    y: 30,
    inside: true,
  });
});

test("the window edges are outside on the right and bottom", () => {
  assert.equal(toWindowPoint({ x: 100, y: 50 }, BOUNDS).inside, true);
  assert.equal(toWindowPoint({ x: 459, y: 309 }, BOUNDS).inside, true);
  assert.equal(toWindowPoint({ x: 460, y: 100 }, BOUNDS).inside, false);
  assert.equal(toWindowPoint({ x: 100, y: 310 }, BOUNDS).inside, false);
  assert.equal(toWindowPoint({ x: 99, y: 50 }, BOUNDS).inside, false);
});

test("the tracker reports a moved pointer once and ignores a still one", () => {
  const sent = [];
  let cursor = { x: 120, y: 60 };
  const window = {
    isDestroyed: () => false,
    isVisible: () => true,
    getBounds: () => BOUNDS,
  };
  const tracker = createPointerTracker({
    getWindow: () => window,
    getCursor: () => cursor,
    send: (point) => sent.push(point),
  });

  tracker.tick();
  tracker.tick();
  cursor = { x: 140, y: 90 };
  tracker.tick();

  assert.deepEqual(sent, [
    { x: 20, y: 10, inside: true },
    { x: 40, y: 40, inside: true },
  ]);
});

test("leaving the window is reported once, not for every desktop move", () => {
  const sent = [];
  let cursor = { x: 0, y: 0 };
  const window = {
    isDestroyed: () => false,
    isVisible: () => true,
    getBounds: () => BOUNDS,
  };
  const tracker = createPointerTracker({
    getWindow: () => window,
    getCursor: () => cursor,
    send: (point) => sent.push(point),
  });

  tracker.tick();
  cursor = { x: 900, y: 700 };
  tracker.tick();
  cursor = { x: 1000, y: 800 };
  tracker.tick();

  assert.deepEqual(sent, [{ x: -100, y: -50, inside: false }]);
});

test("a hidden window is not tracked", () => {
  const sent = [];
  let visible = false;
  const window = {
    isDestroyed: () => false,
    isVisible: () => visible,
    getBounds: () => BOUNDS,
  };
  const tracker = createPointerTracker({
    getWindow: () => window,
    getCursor: () => ({ x: 120, y: 60 }),
    send: (point) => sent.push(point),
  });

  tracker.tick();
  visible = true;
  tracker.tick();
  assert.deepEqual(sent, [{ x: 20, y: 10, inside: true }]);
});

test("a destroyed window is not tracked", () => {
  const sent = [];
  const window = {
    isDestroyed: () => true,
    isVisible: () => true,
    getBounds: () => BOUNDS,
  };
  const tracker = createPointerTracker({
    getWindow: () => window,
    getCursor: () => ({ x: 120, y: 60 }),
    send: (point) => sent.push(point),
  });

  tracker.tick();
  assert.deepEqual(sent, []);
});

test("reset makes the next tick report the same position again", () => {
  const sent = [];
  const window = {
    isDestroyed: () => false,
    isVisible: () => true,
    getBounds: () => BOUNDS,
  };
  const tracker = createPointerTracker({
    getWindow: () => window,
    getCursor: () => ({ x: 120, y: 60 }),
    send: (point) => sent.push(point),
  });

  tracker.tick();
  tracker.reset();
  tracker.tick();
  assert.equal(sent.length, 2);
});

test("start and stop manage a single polling timer", () => {
  const timers = [];
  const cleared = [];
  const tracker = createPointerTracker({
    getWindow: () => null,
    getCursor: () => ({ x: 0, y: 0 }),
    send: () => {},
    setIntervalFn: (callback, interval) => {
      timers.push({ callback, interval });
      return timers.length;
    },
    clearIntervalFn: (id) => cleared.push(id),
  });

  tracker.start();
  tracker.start();
  assert.equal(timers.length, 1);
  assert.equal(timers[0].interval, POINTER_POLL_MS);
  tracker.stop();
  tracker.stop();
  assert.deepEqual(cleared, [1]);
});
