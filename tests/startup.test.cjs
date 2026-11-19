const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  DEFAULT_LAUNCH_HIDDEN,
  HIDDEN_ARG,
  applyLoginItemSettings,
  loginItemArgs,
  loginItemIsEnabled,
  loginItemWillLaunch,
  readLaunchHidden,
  readLoginItemState,
  reconcileLoginItem,
  wasLaunchedHidden,
  writeLaunchHidden,
} = require("../electron/startup.cjs");

function fakeApp({
  packaged = true,
  openAtLogin = false,
  args = [],
  startupEnabled = true,
} = {}) {
  const calls = [];
  return {
    calls,
    isPackaged: packaged,
    getLoginItemSettings: ({ args: queried = [] } = {}) => {
      const registered =
        openAtLogin && JSON.stringify(args) === JSON.stringify(queried);
      return {
        openAtLogin: registered,
        executableWillLaunchAtLogin: registered && startupEnabled,
      };
    },
    setLoginItemSettings: (settings) => {
      calls.push(settings);
      openAtLogin = settings.openAtLogin === true;
      args = settings.args ?? [];
      if (settings.enabled !== undefined) startupEnabled = settings.enabled;
    },
  };
}

test("launching hidden defaults on when there is no saved preference", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buddy-startup-"));
  try {
    assert.equal(DEFAULT_LAUNCH_HIDDEN, true);
    assert.equal(
      readLaunchHidden(path.join(dir, "startup-preferences.json")),
      DEFAULT_LAUNCH_HIDDEN,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the saved launch choice round-trips through the preferences file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buddy-startup-"));
  const file = path.join(dir, "startup-preferences.json");
  try {
    assert.equal(writeLaunchHidden(file, false), true);
    assert.equal(readLaunchHidden(file), false);

    assert.equal(writeLaunchHidden(file, true), true);
    assert.equal(readLaunchHidden(file), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("damaged or unexpected launch preferences fall back to hidden", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buddy-startup-"));
  const file = path.join(dir, "startup-preferences.json");
  try {
    fs.writeFileSync(file, "{not json");
    assert.equal(readLaunchHidden(file), true);

    fs.writeFileSync(file, JSON.stringify({ launchHidden: "false" }));
    assert.equal(readLaunchHidden(file), true);

    fs.writeFileSync(file, JSON.stringify(null));
    assert.equal(readLaunchHidden(file), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a non-boolean launch preference is never written", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buddy-startup-"));
  const file = path.join(dir, "startup-preferences.json");
  try {
    assert.equal(writeLaunchHidden(file, "true"), false);
    assert.equal(fs.existsSync(file), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the hidden argument is only added to an enabled login item", () => {
  assert.deepEqual(loginItemArgs(true, true), [HIDDEN_ARG]);
  assert.deepEqual(loginItemArgs(true, false), []);
  assert.deepEqual(loginItemArgs(false, true), []);
});

test("a login launch starts hidden only when the user chose it", () => {
  assert.equal(
    wasLaunchedHidden({ argv: ["app", HIDDEN_ARG], launchHidden: true }),
    true,
  );
  assert.equal(
    wasLaunchedHidden({ argv: ["app"], launchHidden: true, openedAtLogin: true }),
    true,
  );
  assert.equal(
    wasLaunchedHidden({ argv: ["app"], launchHidden: true }),
    false,
  );
  assert.equal(
    wasLaunchedHidden({
      argv: ["app", HIDDEN_ARG],
      launchHidden: false,
      openedAtLogin: true,
    }),
    false,
  );
});

test("registering the login item includes or clears the hidden argument", () => {
  const app = fakeApp();
  assert.deepEqual(
    applyLoginItemSettings(app, { openAtLogin: true, launchHidden: true }),
    { openAtLogin: true, willLaunch: true },
  );
  assert.deepEqual(app.calls.at(-1), {
    openAtLogin: true,
    args: [HIDDEN_ARG],
  });

  assert.deepEqual(
    applyLoginItemSettings(app, { openAtLogin: true, launchHidden: false }),
    { openAtLogin: true, willLaunch: true },
  );
  assert.deepEqual(app.calls.at(-1), { openAtLogin: true, args: [] });

  assert.deepEqual(
    applyLoginItemSettings(app, { openAtLogin: false, launchHidden: true }),
    { openAtLogin: false, willLaunch: false },
  );
  assert.deepEqual(app.calls.at(-1), { openAtLogin: false, args: [] });
});

test("turning startup off and on again keeps the hidden launch argument", () => {
  const app = fakeApp();
  applyLoginItemSettings(app, { openAtLogin: true, launchHidden: true });
  applyLoginItemSettings(app, { openAtLogin: false, launchHidden: true });
  applyLoginItemSettings(app, { openAtLogin: true, launchHidden: true });

  assert.deepEqual(app.calls, [
    { openAtLogin: true, args: [HIDDEN_ARG] },
    { openAtLogin: false, args: [] },
    { openAtLogin: true, args: [HIDDEN_ARG] },
  ]);
});

test("the read-back reports a login item Windows will not launch", () => {
  const app = fakeApp({
    openAtLogin: true,
    args: [HIDDEN_ARG],
    startupEnabled: false,
  });

  assert.deepEqual(readLoginItemState(app, true), {
    openAtLogin: true,
    willLaunch: false,
  });
});

test("login item registration is skipped in development", () => {
  const app = fakeApp({ packaged: false });
  assert.deepEqual(
    applyLoginItemSettings(app, { openAtLogin: true, launchHidden: true }),
    { openAtLogin: false, willLaunch: false },
  );
  assert.equal(loginItemIsEnabled(app, true), false);
  assert.equal(reconcileLoginItem(app, true), false);
  assert.deepEqual(app.calls, []);
});

test("an existing visible login item is moved to the hidden setting", () => {
  const oldVisible = fakeApp({ openAtLogin: true, args: [] });
  assert.equal(reconcileLoginItem(oldVisible, true), true);
  assert.deepEqual(oldVisible.calls.at(-1), {
    openAtLogin: true,
    args: [HIDDEN_ARG],
  });

  const oldHidden = fakeApp({ openAtLogin: true, args: [HIDDEN_ARG] });
  assert.equal(reconcileLoginItem(oldHidden, true), false);
  assert.deepEqual(oldHidden.calls, []);
});

test("a login item disabled in Windows startup stays disabled", () => {
  const app = fakeApp({
    openAtLogin: true,
    args: [],
    startupEnabled: false,
  });
  assert.equal(loginItemWillLaunch(app, false), false);
  assert.equal(reconcileLoginItem(app, true), true);
  assert.deepEqual(app.calls.at(-1), {
    openAtLogin: true,
    args: [HIDDEN_ARG],
    enabled: false,
  });
  assert.equal(loginItemWillLaunch(app, true), false);
});

test("a login item the user turned off is not registered again", () => {
  const app = fakeApp({ openAtLogin: false });
  assert.equal(loginItemIsEnabled(app, true), false);
  assert.equal(reconcileLoginItem(app, true), false);
  assert.deepEqual(app.calls, []);
});
