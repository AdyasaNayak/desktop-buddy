const test = require("node:test");
const assert = require("node:assert/strict");
const { notifyWindowHidden } = require("../electron/window-visibility.cjs");

function fakeWindow({ destroyed = false, contentsDestroyed = false } = {}) {
  const sent = [];
  return {
    sent,
    isDestroyed: () => destroyed,
    webContents: {
      isDestroyed: () => contentsDestroyed,
      send: (channel) => sent.push(channel),
    },
  };
}

test("tells the renderer the window was hidden", () => {
  const window = fakeWindow();
  notifyWindowHidden(window);
  assert.deepEqual(window.sent, ["window-hidden"]);
});

test("ignores a window that is already gone", () => {
  const window = fakeWindow({ destroyed: true });
  notifyWindowHidden(window);
  assert.deepEqual(window.sent, []);
});

test("ignores a renderer that is already gone", () => {
  const window = fakeWindow({ contentsDestroyed: true });
  notifyWindowHidden(window);
  assert.deepEqual(window.sent, []);
});

test("ignores a missing window", () => {
  assert.doesNotThrow(() => notifyWindowHidden(undefined));
});
