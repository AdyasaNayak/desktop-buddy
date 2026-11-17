const test = require("node:test");
const assert = require("node:assert/strict");
const {
  LOGIN_ITEM_ERROR,
  readLoginItem,
  setLoginItem,
} = require("../electron/login-item.cjs");

function fakeApp({ openAtLogin = false, ignoreWrites = false, fail } = {}) {
  const writes = [];
  return {
    writes,
    getLoginItemSettings: () => {
      if (fail === "read") throw new Error("registry unavailable");
      return { openAtLogin };
    },
    setLoginItemSettings: (settings) => {
      if (fail === "write") throw new Error("registry unavailable");
      writes.push(settings);
      if (!ignoreWrites) openAtLogin = settings.openAtLogin === true;
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

test("the registered startup choice is read from the OS", () => {
  assert.equal(readLoginItem(fakeApp()), false);
  assert.equal(readLoginItem(fakeApp({ openAtLogin: true })), true);
});

test("a read failure is treated as not registered", () => {
  const app = fakeApp({ fail: "read" });

  assert.equal(quietly(() => readLoginItem(app)), false);
});

test("enabling and disabling startup writes the choice and confirms it", () => {
  const app = fakeApp();

  assert.deepEqual(setLoginItem(app, true), { ok: true, enabled: true });
  assert.deepEqual(app.writes, [{ openAtLogin: true }]);
  assert.equal(readLoginItem(app), true);

  assert.deepEqual(setLoginItem(app, false), { ok: true, enabled: false });
  assert.deepEqual(app.writes, [
    { openAtLogin: true },
    { openAtLogin: false },
  ]);
  assert.equal(readLoginItem(app), false);
});

test("a registration the OS ignores is reported as a failure", () => {
  const app = fakeApp({ ignoreWrites: true });

  assert.deepEqual(setLoginItem(app, true), {
    ok: false,
    enabled: false,
    error: LOGIN_ITEM_ERROR,
  });
});

test("a write failure is reported with the unchanged state", () => {
  const app = fakeApp({ fail: "write" });

  assert.deepEqual(quietly(() => setLoginItem(app, true)), {
    ok: false,
    enabled: false,
    error: LOGIN_ITEM_ERROR,
  });
});

test("only booleans can change the startup choice", () => {
  const app = fakeApp();

  assert.deepEqual(setLoginItem(app, "true"), {
    ok: false,
    enabled: false,
    error: LOGIN_ITEM_ERROR,
  });
  assert.deepEqual(app.writes, []);
});
