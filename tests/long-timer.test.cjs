const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MAX_TIMER_DELAY,
  setLongTimeout,
  clearLongTimeout,
} = require("../electron/long-timer.cjs");

/** Record the delays handed to the mocked setTimeout. */
function recordDelays(t) {
  const scheduled = [];
  const original = globalThis.setTimeout;
  globalThis.setTimeout = (callback, delay, ...args) => {
    scheduled.push(delay);
    return original(callback, delay, ...args);
  };
  t.after(() => {
    globalThis.setTimeout = original;
  });
  return scheduled;
}

test("short waits fire only once their delay has elapsed", (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"] });
  let fired = false;
  setLongTimeout(Date.now() + 5000, () => {
    fired = true;
  });

  t.mock.timers.tick(4999);
  assert.equal(fired, false);
  t.mock.timers.tick(1);
  assert.equal(fired, true);
});

test("waits beyond the 32-bit limit are chunked instead of firing at once", (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"] });
  const scheduled = recordDelays(t);
  const start = Date.now();
  const dueAt = start + 30 * 24 * 60 * 60 * 1000; // 30 days
  let firedAt = null;
  setLongTimeout(dueAt, () => {
    firedAt = Date.now();
  });

  assert.equal(scheduled.length, 1);
  assert.ok(
    scheduled[0] <= MAX_TIMER_DELAY,
    `first chunk was ${scheduled[0]} ms, above the safe limit`,
  );

  t.mock.timers.tick(MAX_TIMER_DELAY);
  assert.equal(firedAt, null);

  t.mock.timers.tick(dueAt - Date.now());
  assert.equal(firedAt, dueAt);
});

test("a wait that is already due fires asynchronously", (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"] });
  let fired = false;
  setLongTimeout(Date.now() - 1, () => {
    fired = true;
  });

  assert.equal(fired, false);
  t.mock.timers.tick(0);
  assert.equal(fired, true);
});

test("clearLongTimeout cancels a pending wait", (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"] });
  let fired = false;
  const handle = setLongTimeout(Date.now() + MAX_TIMER_DELAY * 3, () => {
    fired = true;
  });

  clearLongTimeout(handle);
  t.mock.timers.tick(MAX_TIMER_DELAY * 3);
  assert.equal(fired, false);
});
