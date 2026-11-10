const test = require("node:test");
const assert = require("node:assert/strict");
const { sendToRenderer } = require("../electron/renderer-message.cjs");

function fakeSender({ destroyed = false, fail = false } = {}) {
  const sent = [];
  return {
    sent,
    isDestroyed: () => destroyed,
    send: (channel, ...args) => {
      if (fail) throw new Error("renderer is gone");
      sent.push([channel, ...args]);
    },
  };
}

function quietly(run) {
  const original = console.error;
  console.error = () => {};
  try {
    return run();
  } finally {
    console.error = original;
  }
}

test("sends a message to a live renderer", () => {
  const sender = fakeSender();

  assert.equal(sendToRenderer(sender, "reminder-fired", 7), true);
  assert.deepEqual(sender.sent, [["reminder-fired", 7]]);
});

test("leaves a destroyed renderer alone", () => {
  const sender = fakeSender({ destroyed: true });

  assert.equal(sendToRenderer(sender, "reminder-fired", 7), false);
  assert.deepEqual(sender.sent, []);
});

test("ignores missing or invalid renderers", () => {
  assert.equal(sendToRenderer(undefined, "reminder-fired", 7), false);
  assert.equal(sendToRenderer(null, "reminder-fired", 7), false);
  assert.equal(sendToRenderer({}, "reminder-fired", 7), false);
});

test("a send failure is reported, not thrown", () => {
  const sender = fakeSender({ fail: true });

  const sent = quietly(() => sendToRenderer(sender, "reminder-fired", 7));

  assert.equal(sent, false);
});
