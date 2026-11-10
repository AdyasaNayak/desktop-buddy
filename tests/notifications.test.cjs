const test = require("node:test");
const assert = require("node:assert/strict");
const { showNotification } = require("../electron/notifications.cjs");

function fakeNotifications({
  supported = true,
  failOnCreate = false,
  failOnShow = false,
} = {}) {
  const created = [];
  class FakeNotification {
    static isSupported() {
      return supported;
    }

    constructor(options) {
      if (failOnCreate) throw new Error("cannot create");
      this.options = options;
      this.events = new Map();
      this.shown = false;
      created.push(this);
    }

    on(event, handler) {
      this.events.set(event, handler);
    }

    show() {
      if (failOnShow) throw new Error("cannot show");
      this.shown = true;
    }
  }
  return { FakeNotification, created };
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

test("shows a supported notification and reports success", () => {
  const { FakeNotification, created } = fakeNotifications();

  const shown = showNotification({
    Notification: FakeNotification,
    title: "Desktop Buddy reminder",
    body: "stretch",
  });

  assert.equal(shown, true);
  assert.equal(created.length, 1);
  assert.deepEqual(created[0].options, {
    title: "Desktop Buddy reminder",
    body: "stretch",
  });
  assert.equal(created[0].shown, true);
});

test("does nothing when notifications are not supported", () => {
  const { FakeNotification, created } = fakeNotifications({
    supported: false,
  });

  const shown = showNotification({
    Notification: FakeNotification,
    title: "Desktop Buddy reminder",
    body: "stretch",
  });

  assert.equal(shown, false);
  assert.deepEqual(created, []);
});

test("a missing notification API is treated as unsupported", () => {
  assert.equal(
    showNotification({ title: "Desktop Buddy reminder", body: "stretch" }),
    false,
  );
  assert.equal(
    showNotification({
      Notification: {},
      title: "Desktop Buddy reminder",
      body: "stretch",
    }),
    false,
  );
});

test("attaches a notification click handler", () => {
  const { FakeNotification, created } = fakeNotifications();
  let clicks = 0;

  showNotification({
    Notification: FakeNotification,
    title: "Desktop Buddy water break",
    body: "sip time",
    onClick: () => {
      clicks += 1;
    },
  });

  created[0].events.get("click")();
  assert.equal(clicks, 1);
});

test("a notification that cannot be created is reported, not thrown", () => {
  const { FakeNotification } = fakeNotifications({ failOnCreate: true });

  const shown = quietly(() =>
    showNotification({
      Notification: FakeNotification,
      title: "Desktop Buddy reminder",
      body: "stretch",
    }),
  );

  assert.equal(shown, false);
});

test("a notification that cannot be shown is reported, not thrown", () => {
  const { FakeNotification } = fakeNotifications({ failOnShow: true });

  const shown = quietly(() =>
    showNotification({
      Notification: FakeNotification,
      title: "Desktop Buddy reminder",
      body: "stretch",
    }),
  );

  assert.equal(shown, false);
});
