const test = require("node:test");
const assert = require("node:assert/strict");
const { setClickThrough } = require("../electron/click-through.cjs");

function fakeWindow(destroyed = false) {
  const calls = [];
  return {
    calls,
    isDestroyed: () => destroyed,
    setIgnoreMouseEvents: (ignore, options) => calls.push({ ignore, options }),
  };
}

test("lets the mouse through with forwarded moves on Windows and macOS", () => {
  for (const platform of ["win32", "darwin"]) {
    const window = fakeWindow();
    setClickThrough(window, true, platform);
    assert.deepEqual(window.calls, [
      { ignore: true, options: { forward: true } },
    ]);
  }
});

test("takes the mouse back when the pointer reaches the buddy", () => {
  const window = fakeWindow();
  setClickThrough(window, true, "win32");
  setClickThrough(window, false, "win32");
  assert.deepEqual(window.calls.at(-1), {
    ignore: false,
    options: undefined,
  });
});

test("does not re-apply a state the window already has", () => {
  const window = fakeWindow();
  setClickThrough(window, true, "win32");
  setClickThrough(window, true, "win32");
  setClickThrough(window, false, "win32");
  setClickThrough(window, false, "win32");
  assert.equal(window.calls.length, 2);
});

test("keeps the window interactive where moves cannot be forwarded", () => {
  const window = fakeWindow();
  setClickThrough(window, true, "linux");
  setClickThrough(window, false, "linux");
  assert.deepEqual(window.calls, []);
});

test("ignores destroyed windows", () => {
  const window = fakeWindow(true);
  setClickThrough(window, true, "win32");
  assert.deepEqual(window.calls, []);
});
