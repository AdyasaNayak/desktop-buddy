const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const os = require("node:os");
const path = require("node:path");

const MAIN_PATH = require.resolve("../electron/main.cjs");
const { HIDDEN_ARG, LOGIN_ITEM_ERROR } = require("../electron/startup.cjs");
const DISPLAY = {
  id: 1,
  workArea: { x: 0, y: 0, width: 1920, height: 1080 },
};

function createHarness({
  argv = [],
  packaged = true,
  openAtLogin = false,
  loginArgs = [],
  startupEnabled = true,
  ignoreLoginWrites = false,
  failLoginWrites = false,
  failLoginReads = false,
} = {}) {
  const handlers = new Map();
  const windows = [];
  const sent = [];
  const notifications = [];
  const loginWrites = [];
  let tray;
  let menu;
  let loginEnabled = openAtLogin;
  let currentLoginArgs = loginArgs;
  let loginWillLaunch = startupEnabled;
  let ignoredLoginWrites = ignoreLoginWrites;
  let failedLoginWrites = failLoginWrites;
  let failedLoginReads = failLoginReads;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buddy-launch-"));

  class FakeWindow {
    constructor(options) {
      this.options = options;
      this.visible = false;
      this.destroyed = false;
      this.resizable = true;
      this.bounds = {
        x: 100,
        y: 100,
        width: options.width,
        height: options.height,
      };
      this.shown = 0;
      this.focused = 0;
      this.events = new Map();
      this.webContents = {
        on: () => {},
        isDestroyed: () => false,
        send: (channel, ...args) => sent.push([channel, ...args]),
      };
      windows.push(this);
    }
    on(event, listener) {
      const listeners = this.events.get(event) ?? [];
      listeners.push(listener);
      this.events.set(event, listeners);
      return this;
    }
    once(event, listener) {
      return this.on(event, listener);
    }
    emit(event) {
      for (const listener of this.events.get(event) ?? []) listener();
    }
    loadFile() {}
    loadURL() {}
    isDestroyed() {
      return this.destroyed;
    }
    isVisible() {
      return this.visible;
    }
    show() {
      this.visible = true;
      this.shown += 1;
      this.emit("show");
    }
    hide() {
      this.visible = false;
      this.emit("hide");
    }
    focus() {
      this.focused += 1;
    }
    isMinimized() {
      return false;
    }
    restore() {}
    setAlwaysOnTop() {}
    setIgnoreMouseEvents() {}
    isResizable() {
      return this.resizable;
    }
    setResizable(resizable) {
      this.resizable = resizable;
    }
    getBounds() {
      return { ...this.bounds };
    }
    setBounds(bounds) {
      this.bounds = { ...bounds };
    }
    setPosition(x, y) {
      this.bounds.x = x;
      this.bounds.y = y;
    }
  }

  class FakeTray {
    constructor() {
      this.handlers = new Map();
      tray = this;
    }
    on(event, listener) {
      this.handlers.set(event, listener);
    }
    setToolTip() {}
    setContextMenu(next) {
      menu = next;
    }
    destroy() {}
  }

  class FakeNotification {
    static isSupported() {
      return true;
    }
    constructor(options) {
      this.options = options;
      notifications.push(this);
    }
    on() {}
    show() {}
  }

  const electron = {
    app: {
      requestSingleInstanceLock: () => true,
      quit() {},
      on() {},
      whenReady: () => ({ then: (listener) => listener() }),
      getPath: () => dir,
      isPackaged: packaged,
      setAppUserModelId() {},
      getLoginItemSettings: ({ args: queried = [] } = {}) => {
        if (failedLoginReads) throw new Error("registry unavailable");
        const registered =
          loginEnabled &&
          JSON.stringify(currentLoginArgs) === JSON.stringify(queried);
        return {
          openAtLogin: registered,
          executableWillLaunchAtLogin: registered && loginWillLaunch,
          wasOpenedAtLogin: false,
        };
      },
      setLoginItemSettings: (settings) => {
        loginWrites.push(settings);
        if (failedLoginWrites) throw new Error("registry unavailable");
        if (ignoredLoginWrites) return;
        loginEnabled = settings.openAtLogin === true;
        currentLoginArgs = settings.args ?? [];
        if (loginEnabled) {
          loginWillLaunch = settings.enabled !== false;
        }
      },
    },
    BrowserWindow: Object.assign(FakeWindow, {
      fromWebContents: (sender) =>
        sender === windows.at(-1)?.webContents ? windows.at(-1) : undefined,
    }),
    ipcMain: {
      on: (channel, handler) => handlers.set(channel, handler),
      handle() {},
    },
    Menu: { buildFromTemplate: (template) => ({ template }) },
    Notification: FakeNotification,
    Tray: FakeTray,
    nativeImage: { createFromPath: () => ({ isEmpty: () => false }) },
    screen: {
      getAllDisplays: () => [DISPLAY],
      getDisplayNearestPoint: () => DISPLAY,
      getDisplayMatching: () => DISPLAY,
      getCursorScreenPoint: () => ({ x: 0, y: 0 }),
      on() {},
    },
  };

  const originalArgv = process.argv;
  const originalLoad = Module._load;
  process.argv = ["electron", ...argv];
  Module._load = function load(request, parent, isMain) {
    if (request === "electron") return electron;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[MAIN_PATH];
    require(MAIN_PATH);
  } finally {
    Module._load = originalLoad;
    process.argv = originalArgv;
    delete require.cache[MAIN_PATH];
  }

  return {
    handlers,
    tray,
    window: windows.at(-1),
    sent,
    notifications,
    loginWrites,
    get menu() {
      return menu;
    },
    get openAtLogin() {
      return loginEnabled;
    },
    get loginArgs() {
      return currentLoginArgs;
    },
    ignoreLoginWrites(value) {
      ignoredLoginWrites = value;
    },
    failLoginWrites(value) {
      failedLoginWrites = value;
    },
    close() {
      windows.at(-1)?.emit("close");
      windows.at(-1)?.emit("closed");
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

function invoke(harness, channel, ...args) {
  const event = {
    sender: harness.window.webContents,
    returnValue: undefined,
  };
  harness.handlers.get(channel)(event, ...args);
  return event.returnValue;
}

function trayItem(harness, label) {
  return harness.menu.template.find((item) => item.label === label);
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

test("a hidden login keeps the buddy in the tray until it is opened", () => {
  const harness = createHarness({ argv: [HIDDEN_ARG] });
  try {
    assert.ok(harness.window);
    harness.handlers.get("window-mode")(
      { sender: harness.window.webContents },
      "pet",
    );
    assert.equal(harness.window.isVisible(), false);
    assert.equal(harness.window.shown, 0);

    harness.tray.handlers.get("click")();
    assert.equal(harness.window.isVisible(), true);
    assert.equal(harness.window.shown, 1);
    assert.equal(harness.window.focused, 1);
  } finally {
    harness.close();
  }
});

test("a normal launch still shows the buddy", () => {
  const harness = createHarness();
  try {
    assert.ok(harness.window);
    harness.handlers.get("window-mode")(
      { sender: harness.window.webContents },
      "pet",
    );
    assert.equal(harness.window.isVisible(), true);
    assert.equal(harness.window.shown, 1);
  } finally {
    harness.close();
  }
});

test("startup can be turned on and off after setup", (t) => {
  const harness = createHarness();
  t.after(harness.close);

  assert.deepEqual(invoke(harness, "get-startup-settings"), {
    supported: true,
    enabled: false,
    launchHidden: true,
  });
  assert.equal(trayItem(harness, "Start with Windows").checked, false);

  assert.deepEqual(invoke(harness, "set-startup-settings", true, true), {
    ok: true,
    enabled: true,
    launchHidden: true,
  });
  assert.equal(harness.openAtLogin, true);
  assert.deepEqual(harness.loginArgs, [HIDDEN_ARG]);
  assert.equal(trayItem(harness, "Start with Windows").checked, true);

  assert.deepEqual(invoke(harness, "set-startup-settings", false, true), {
    ok: true,
    enabled: false,
    launchHidden: true,
  });
  assert.equal(harness.openAtLogin, false);
  assert.deepEqual(harness.loginArgs, []);
  assert.equal(trayItem(harness, "Start with Windows").checked, false);
});

test("turning startup off and on keeps the hidden launch argument", (t) => {
  const harness = createHarness();
  t.after(harness.close);

  invoke(harness, "set-startup-settings", true, true);
  invoke(harness, "set-startup-settings", false, true);
  invoke(harness, "set-startup-settings", true, true);

  assert.deepEqual(harness.loginWrites, [
    { openAtLogin: true, args: [HIDDEN_ARG] },
    { openAtLogin: false, args: [] },
    { openAtLogin: true, args: [HIDDEN_ARG] },
  ]);
  assert.deepEqual(invoke(harness, "get-startup-settings"), {
    supported: true,
    enabled: true,
    launchHidden: true,
  });
});

test("changing the hidden choice keeps a Windows-disabled item disabled", (t) => {
  const harness = createHarness({
    openAtLogin: true,
    loginArgs: [HIDDEN_ARG],
    startupEnabled: false,
  });
  t.after(harness.close);

  assert.equal(invoke(harness, "get-startup-settings").enabled, false);
  assert.deepEqual(
    invoke(harness, "set-startup-settings", false, false),
    { ok: true, enabled: false, launchHidden: false },
  );
  assert.deepEqual(harness.loginWrites.at(-1), {
    openAtLogin: true,
    args: [],
    enabled: false,
  });
  assert.equal(harness.openAtLogin, true);

  assert.deepEqual(
    invoke(harness, "set-startup-settings", true, false),
    { ok: true, enabled: true, launchHidden: false },
  );
  assert.deepEqual(harness.loginWrites.at(-1), {
    openAtLogin: true,
    args: [],
  });
});

test("the tray menu changes startup and tells an open Settings panel", (t) => {
  const harness = createHarness();
  t.after(harness.close);

  trayItem(harness, "Start with Windows").click({ checked: true });

  assert.equal(harness.openAtLogin, true);
  assert.deepEqual(harness.loginArgs, [HIDDEN_ARG]);
  assert.equal(trayItem(harness, "Start with Windows").checked, true);
  assert.deepEqual(harness.sent.at(-1), [
    "startup-settings-changed",
    { ok: true, enabled: true, launchHidden: true },
  ]);

  trayItem(harness, "Launch hidden at login").click({ checked: false });

  assert.equal(harness.openAtLogin, true);
  assert.deepEqual(harness.loginArgs, []);
  assert.deepEqual(harness.sent.at(-1), [
    "startup-settings-changed",
    { ok: true, enabled: true, launchHidden: false },
  ]);
});

test("a failed tray change is reported and the old state is kept", (t) => {
  const harness = createHarness();
  t.after(harness.close);
  trayItem(harness, "Start with Windows").click({ checked: true });
  harness.ignoreLoginWrites(true);

  trayItem(harness, "Start with Windows").click({ checked: false });

  assert.equal(harness.openAtLogin, true);
  assert.equal(trayItem(harness, "Start with Windows").checked, true);
  assert.equal(
    harness.notifications.at(-1).options.title,
    "Could not change the startup setting",
  );
  assert.deepEqual(harness.sent.at(-1), [
    "startup-settings-changed",
    {
      ok: false,
      enabled: true,
      launchHidden: true,
      error: LOGIN_ITEM_ERROR,
    },
  ]);
});

test("startup IPC only accepts a boolean change from the buddy window", (t) => {
  const harness = createHarness();
  t.after(harness.close);
  const handler = harness.handlers.get("set-startup-settings");

  const otherSender = { sender: "somewhere else", returnValue: undefined };
  handler(otherSender, true, true);
  assert.deepEqual(otherSender.returnValue, {
    ok: false,
    enabled: false,
    launchHidden: true,
    error: "Could not change the startup setting.",
  });

  const badPayload = {
    sender: harness.window.webContents,
    returnValue: undefined,
  };
  handler(badPayload, "true", true);
  assert.deepEqual(badPayload.returnValue, {
    ok: false,
    enabled: false,
    launchHidden: true,
    error: "Could not change the startup setting.",
  });
  assert.deepEqual(harness.loginWrites, []);
});

test("a failed login-item write is reported with the unchanged state", (t) => {
  const harness = createHarness({ failLoginWrites: true });
  t.after(harness.close);

  const result = quietly(() =>
    invoke(harness, "set-startup-settings", true, true),
  );

  assert.deepEqual(result, {
    ok: false,
    enabled: false,
    launchHidden: true,
    error: LOGIN_ITEM_ERROR,
  });
  assert.deepEqual(invoke(harness, "get-startup-settings"), {
    supported: true,
    enabled: false,
    launchHidden: true,
  });
  assert.equal(trayItem(harness, "Start with Windows").checked, false);
});

test("a login item read failure is treated as off", (t) => {
  const harness = quietly(() => createHarness({ failLoginReads: true }));
  t.after(harness.close);

  assert.deepEqual(quietly(() => invoke(harness, "get-startup-settings")), {
    supported: true,
    enabled: false,
    launchHidden: true,
  });
});

test("a startup reconciliation failure does not stop the tray or window", (t) => {
  const harness = quietly(() =>
    createHarness({
      openAtLogin: true,
      loginArgs: [],
      failLoginWrites: true,
    }),
  );
  t.after(harness.close);

  assert.ok(harness.tray);
  assert.ok(harness.window);
  assert.ok(trayItem(harness, "Start with Windows"));
  assert.deepEqual(harness.loginWrites, [
    { openAtLogin: true, args: [HIDDEN_ARG] },
  ]);
});

test("a failed hidden change does not turn off Start with Windows", (t) => {
  const harness = createHarness({
    openAtLogin: true,
    loginArgs: [HIDDEN_ARG],
    failLoginWrites: true,
  });
  t.after(harness.close);

  const result = quietly(() =>
    invoke(harness, "set-startup-settings", true, false),
  );

  assert.deepEqual(result, {
    ok: false,
    enabled: true,
    launchHidden: true,
    error: LOGIN_ITEM_ERROR,
  });
  assert.equal(trayItem(harness, "Start with Windows").checked, true);
  assert.equal(trayItem(harness, "Launch hidden at login").checked, true);
  assert.deepEqual(harness.loginArgs, [HIDDEN_ARG]);
  assert.deepEqual(invoke(harness, "get-startup-settings"), {
    supported: true,
    enabled: true,
    launchHidden: true,
  });
});

test("an ignored hidden change is reported without dropping Start with Windows", (t) => {
  const harness = createHarness({
    openAtLogin: true,
    loginArgs: [HIDDEN_ARG],
    ignoreLoginWrites: true,
  });
  t.after(harness.close);

  assert.deepEqual(
    invoke(harness, "set-startup-settings", true, false),
    {
      ok: false,
      enabled: true,
      launchHidden: true,
      error: LOGIN_ITEM_ERROR,
    },
  );
  assert.equal(trayItem(harness, "Start with Windows").checked, true);
  assert.equal(trayItem(harness, "Launch hidden at login").checked, true);
  assert.deepEqual(harness.loginArgs, [HIDDEN_ARG]);
  assert.deepEqual(invoke(harness, "get-startup-settings"), {
    supported: true,
    enabled: true,
    launchHidden: true,
  });
});
