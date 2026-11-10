const test = require("node:test");
const assert = require("node:assert/strict");
const { notifyHiddenWaterNudge } = require("../electron/water-reminder.cjs");
const { waterNudgeNotice } = require("../src/waterMessages.ts");

const NUDGE = {
  title: "Desktop Buddy water break",
  body: "drink up\n250 ml now · 500 ml today",
};

function fakeWindow({ visible = true, destroyed = false } = {}) {
  return {
    isVisible: () => visible,
    isDestroyed: () => destroyed,
  };
}

function deliver({ window, notice = NUDGE, shown = true }) {
  const notifications = [];
  let buddyShown = 0;
  const delivered = notifyHiddenWaterNudge({
    window,
    notice,
    show: (notification) => {
      notifications.push(notification);
      return shown;
    },
    showBuddy: () => {
      buddyShown += 1;
    },
  });

  return {
    delivered,
    notifications,
    buddyShown: () => buddyShown,
  };
}

test("a hidden buddy gets the water nudge as a desktop notification", () => {
  const result = deliver({ window: fakeWindow({ visible: false }) });

  assert.equal(result.delivered, true);
  assert.deepEqual(
    result.notifications.map(({ title, body }) => ({ title, body })),
    [{ title: NUDGE.title, body: NUDGE.body }],
  );
});

test("clicking the notification brings the buddy back", () => {
  const result = deliver({ window: fakeWindow({ visible: false }) });

  result.notifications[0].onClick();
  assert.equal(result.buddyShown(), 1);
});

test("a visible buddy keeps its in-window bubble only", () => {
  const result = deliver({ window: fakeWindow() });

  assert.equal(result.delivered, false);
  assert.deepEqual(result.notifications, []);
});

test("a destroyed window is left alone", () => {
  const result = deliver({ window: fakeWindow({ destroyed: true }) });

  assert.equal(result.delivered, false);
  assert.deepEqual(result.notifications, []);
});

test("malformed notices are ignored", () => {
  const window = fakeWindow({ visible: false });

  assert.equal(deliver({ window, notice: null }).delivered, false);
  assert.equal(
    deliver({ window, notice: { title: 1, body: "drink" } }).delivered,
    false,
  );
});

test("a notification that could not be shown is reported", () => {
  const result = deliver({
    window: fakeWindow({ visible: false }),
    shown: false,
  });

  assert.equal(result.delivered, false);
});

test("the OS notice keeps the message and today's total", () => {
  assert.deepEqual(
    waterNudgeNotice({ message: "sip time", amountMl: 250, totalMl: 750 }),
    {
      title: "Desktop Buddy water break",
      body: "sip time\n250 ml now · 750 ml today",
    },
  );
});
