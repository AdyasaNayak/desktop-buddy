const test = require("node:test");
const assert = require("node:assert/strict");
const { hideBuddy } = require("../electron/hide-buddy.cjs");

function fakeWindow({ destroyed = false, visible = true } = {}) {
  const calls = [];
  return {
    calls,
    isDestroyed: () => destroyed,
    isVisible: () => visible,
    hide: () => calls.push("hide"),
    show: () => calls.push("show"),
  };
}

function run({ window, hasTray, hintShown = false, hintWorks = true }) {
  let hints = 0;
  const result = hideBuddy({
    window,
    hasTray,
    hintShown,
    showHint: () => {
      hints += 1;
      return hintWorks;
    },
  });
  return { ...result, hints };
}

test("hides with a tray and only hints once", () => {
  const window = fakeWindow();
  const first = run({ window, hasTray: true });
  assert.deepEqual(first, { hidden: true, hintShown: true, hints: 1 });
  assert.deepEqual(window.calls, ["hide"]);

  const second = run({ window, hasTray: true, hintShown: first.hintShown });
  assert.deepEqual(second, { hidden: true, hintShown: true, hints: 0 });
  assert.deepEqual(window.calls, ["hide", "hide"]);
});

test("hides with a tray even when the hint cannot be shown", () => {
  const window = fakeWindow();
  const result = run({ window, hasTray: true, hintWorks: false });
  // the tray is still there, so hiding is safe; the hint is retried later
  assert.deepEqual(result, { hidden: true, hintShown: false, hints: 1 });
  assert.deepEqual(window.calls, ["hide"]);
});

test("hides without a tray when the hint explains how to return", () => {
  const window = fakeWindow();
  const result = run({ window, hasTray: false });
  assert.deepEqual(result, { hidden: true, hintShown: true, hints: 1 });
  assert.deepEqual(window.calls, ["hide"]);
});

test("repeats the hint on every hide when there is no tray", () => {
  const window = fakeWindow();
  run({ window, hasTray: false });
  const second = run({ window, hasTray: false, hintShown: true });
  // no tray means no persistent reminder, so each hide needs instructions
  assert.deepEqual(second, { hidden: true, hintShown: true, hints: 1 });
  assert.deepEqual(window.calls, ["hide", "hide"]);
});

test("stays visible when neither a tray nor a hint is available", () => {
  const window = fakeWindow();
  const result = run({ window, hasTray: false, hintWorks: false });
  assert.deepEqual(result, { hidden: false, hintShown: false, hints: 1 });
  assert.deepEqual(window.calls, []);
});

test("stays visible when a tray hint was shown earlier but fails now", () => {
  const window = fakeWindow();
  const result = run({ window, hasTray: false, hintShown: true, hintWorks: false });
  // the old hint is gone, so hiding now would strand the app all the same
  assert.deepEqual(result, { hidden: false, hintShown: true, hints: 1 });
  assert.deepEqual(window.calls, []);
});

test("brings an already hidden window back when it cannot hide", () => {
  const window = fakeWindow({ visible: false });
  const result = run({ window, hasTray: false, hintWorks: false });
  assert.equal(result.hidden, false);
  assert.deepEqual(window.calls, ["show"]);
});

test("ignores destroyed windows", () => {
  const window = fakeWindow({ destroyed: true });
  const result = run({ window, hasTray: false });
  assert.deepEqual(result, { hidden: false, hintShown: false, hints: 0 });
  assert.deepEqual(window.calls, []);
});
