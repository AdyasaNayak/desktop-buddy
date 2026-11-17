const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");

const REPO = path.join(__dirname, "..");
const WORK_AREA = { x: 0, y: 0, width: 1280, height: 720 };
const DISPLAY = { id: 1, workArea: WORK_AREA };

/**
 * Load electron/main.cjs with an installed-app stub whose login item can be
 * changed. Captures the tray template and renderer messages so the startup
 * setting can be checked from both entry points.
 */
function loadMain() {
  const ipcHandlers = new Map();
  const notifications = [];
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "buddy-startup-"));
  let menu;
  let window;
  let openAtLogin = false;
  let ignoreWrites = false;

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

  class FakeTray extends EventEmitter {
    setToolTip() {}
    setContextMenu(next) {
      menu = next;
    }
  }

  class FakeWindow extends EventEmitter {
    constructor() {
      super();
      this.sent = [];
      window = this;
      this.webContents = {
        on() {},
        send: (channel, ...args) => this.sent.push([channel, ...args]),
        isDestroyed: () => false,
      };
      this.bounds = { width: 360, height: 260, x: 100, y: 100 };
    }

    static fromWebContents() {
      return window;
    }

    getBounds() {
      return { ...this.bounds };
    }

    setBounds(bounds) {
      this.bounds = { ...this.bounds, ...bounds };
    }

    setPosition(x, y) {
      this.bounds = { ...this.bounds, x, y };
    }

    getPosition() {
      return [this.bounds.x, this.bounds.y];
    }

    isDestroyed() {
      return false;
    }
    isResizable() {
      return false;
    }
    isVisible() {
      return true;
    }
    isMinimized() {
      return false;
    }
    setResizable() {}
    setIgnoreMouseEvents() {}
    setAlwaysOnTop() {}
    show() {}
    hide() {}
    focus() {}
    restore() {}
    loadURL() {}
    loadFile() {}
  }

  const electron = {
    app: {
      requestSingleInstanceLock: () => true,
      whenReady: () => ({ then: (run) => run() }),
      on() {},
      quit() {},
      getPath: () => userData,
      isPackaged: true,
      setAppUserModelId() {},
      getLoginItemSettings: () => ({ openAtLogin }),
      setLoginItemSettings: (settings) => {
        if (!ignoreWrites) openAtLogin = settings.openAtLogin === true;
      },
    },
    BrowserWindow: FakeWindow,
    Menu: {
      buildFromTemplate: (template) => {
        menu = { template };
        return menu;
      },
    },
    Notification: FakeNotification,
    Tray: FakeTray,
    ipcMain: {
      on: (channel, run) => ipcHandlers.set(channel, run),
      handle: (channel, run) => ipcHandlers.set(channel, run),
    },
    nativeImage: { createFromPath: () => ({ isEmpty: () => false }) },
    screen: {
      getAllDisplays: () => [DISPLAY],
      getDisplayNearestPoint: () => DISPLAY,
      getDisplayMatching: () => DISPLAY,
      getCursorScreenPoint: () => ({ x: 0, y: 0 }),
      on() {},
    },
  };

  const originalLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === "electron") return electron;
    return originalLoad.call(this, request, ...rest);
  };

  const mainPath = path.join(REPO, "electron", "main.cjs");
  delete require.cache[mainPath];
  try {
    require(mainPath);
  } finally {
    Module._load = originalLoad;
  }
  window.emit("show");

  return {
    app: electron.app,
    ipcHandlers,
    notifications,
    cleanup: () => fs.rmSync(userData, { recursive: true, force: true }),
    get menu() {
      return menu;
    },
    window,
    get openAtLogin() {
      return openAtLogin;
    },
    ignoreWrites(value) {
      ignoreWrites = value;
    },
  };
}

function startupItem(state) {
  return state.menu.template.find(
    (item) => item.label === "Start with Windows",
  );
}

function invoke(state, channel, ...args) {
  const event = { sender: state.window.webContents, returnValue: undefined };
  state.ipcHandlers.get(channel)(event, ...args);
  return event.returnValue;
}

test("startup can be turned on and off after setup", (t) => {
  const state = loadMain();
  t.after(state.cleanup);

  assert.equal(invoke(state, "get-start-with-windows"), false);
  assert.equal(startupItem(state).checked, false);

  assert.deepEqual(invoke(state, "set-start-with-windows", true), {
    ok: true,
    enabled: true,
  });
  assert.equal(state.openAtLogin, true);
  assert.equal(startupItem(state).checked, true);

  assert.deepEqual(invoke(state, "set-start-with-windows", false), {
    ok: true,
    enabled: false,
  });
  assert.equal(state.openAtLogin, false);
  assert.equal(startupItem(state).checked, false);
});

test("the tray menu changes startup and tells an open Settings panel", (t) => {
  const state = loadMain();
  t.after(state.cleanup);
  const item = startupItem(state);

  item.click({ checked: true });

  assert.equal(state.openAtLogin, true);
  assert.equal(startupItem(state).checked, true);
  assert.deepEqual(
    state.window.sent.find(
      ([channel]) => channel === "start-with-windows-changed",
    ),
    ["start-with-windows-changed", { ok: true, enabled: true }],
  );
});

test("a failed tray change is reported and the old state is kept", (t) => {
  const state = loadMain();
  t.after(state.cleanup);
  startupItem(state).click({ checked: true });
  state.ignoreWrites(true);

  startupItem(state).click({ checked: false });

  assert.equal(state.openAtLogin, true);
  assert.equal(startupItem(state).checked, true);
  assert.equal(
    state.notifications.at(-1).options.title,
    "Could not change Start with Windows",
  );
  assert.deepEqual(
    state.window.sent
      .filter(([channel]) => channel === "start-with-windows-changed")
      .at(-1),
    [
      "start-with-windows-changed",
      {
        ok: false,
        enabled: true,
        error: "Windows did not accept the Start with Windows setting.",
      },
    ],
  );
});
