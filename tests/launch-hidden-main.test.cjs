const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const os = require("node:os");
const path = require("node:path");

const MAIN_PATH = require.resolve("../electron/main.cjs");
const HIDDEN_ARG = "--hidden";
const DISPLAY = {
  id: 1,
  workArea: { x: 0, y: 0, width: 1920, height: 1080 },
};

function createHarness({ argv = [] } = {}) {
  const handlers = new Map();
  const windows = [];
  let tray;
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
        send: () => {},
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
    setContextMenu() {}
    destroy() {}
  }

  const electron = {
    app: {
      requestSingleInstanceLock: () => true,
      quit() {},
      on() {},
      whenReady: () => ({ then: (listener) => listener() }),
      getPath: () => dir,
      isPackaged: true,
      setAppUserModelId() {},
      getLoginItemSettings: () => ({
        openAtLogin: false,
        wasOpenedAtLogin: false,
      }),
      setLoginItemSettings() {},
    },
    BrowserWindow: Object.assign(FakeWindow, {
      fromWebContents: () => windows.at(-1),
    }),
    ipcMain: {
      on: (channel, handler) => handlers.set(channel, handler),
      handle() {},
    },
    Menu: { buildFromTemplate: (template) => ({ template }) },
    Notification: class {},
    Tray: FakeTray,
    nativeImage: { createFromPath: () => ({ isEmpty: () => false }) },
    screen: {
      getAllDisplays: () => [DISPLAY],
      getDisplayNearestPoint: () => DISPLAY,
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
    close() {
      windows.at(-1)?.emit("close");
      windows.at(-1)?.emit("closed");
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("a hidden login keeps the buddy in the tray until it is opened", () => {
  const harness = createHarness({ argv: [HIDDEN_ARG] });
  try {
    assert.ok(harness.window);
    harness.handlers.get("window-mode")({ sender: {} }, "pet");
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
    harness.handlers.get("window-mode")({ sender: {} }, "pet");
    assert.equal(harness.window.isVisible(), true);
    assert.equal(harness.window.shown, 1);
  } finally {
    harness.close();
  }
});
