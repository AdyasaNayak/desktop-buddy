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
const PET = { width: 360, height: 260 };

/**
 * Load electron/main.cjs with a minimal Electron stub. Native window moves
 * are emitted synchronously from setBounds, which is how a platform can report
 * them while `setBounds` is still running.
 */
function loadMain(userData) {
  const ipcHandlers = new Map();
  let window;

  class FakeWindow extends EventEmitter {
    constructor() {
      super();
      this.bounds = { ...PET, x: 100, y: 100 };
      this.moves = [];
      this.webContents = {
        on() {},
        send() {},
        isDestroyed: () => false,
      };
      window = this;
    }

    static fromWebContents() {
      return window;
    }

    getBounds() {
      return { ...this.bounds };
    }

    setBounds(bounds) {
      this.bounds = { ...this.bounds, ...bounds };
      this.emit("move");
    }

    setPosition(x, y) {
      this.moves.push([x, y]);
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
      isPackaged: false,
      setAppUserModelId() {},
      setLoginItemSettings() {},
      getLoginItemSettings: () => ({ openAtLogin: false }),
    },
    BrowserWindow: FakeWindow,
    Menu: { buildFromTemplate: () => ({}) },
    Notification: class {},
    Tray: class {},
    ipcMain: {
      on: (channel, run) => ipcHandlers.set(channel, run),
      handle: (channel, run) => ipcHandlers.set(channel, run),
    },
    nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
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
  // every test needs a fresh window and a fresh set of module-level state
  delete require.cache[mainPath];
  try {
    require(mainPath);
  } finally {
    Module._load = originalLoad;
  }

  // the reveal fallback is cleared once the window is shown
  window.emit("show");
  return { window, ipcHandlers };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("native moves clamp and a setup transition keeps the pet position", async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "buddy-move-"));
  const positionFile = path.join(userData, "window-position.json");
  let loaded;
  try {
    loaded = loadMain(userData);
    const { window, ipcHandlers } = loaded;

    window.bounds = { ...PET, x: -500, y: 5000 };
    window.emit("move");
    assert.deepEqual(window.moves, [[0, WORK_AREA.height - PET.height]]);

    window.emit("move");
    assert.equal(window.moves.length, 1, "a window already inside is not moved");

    const setMode = ipcHandlers.get("window-mode");
    setMode({ sender: {} }, "pet");
    window.bounds = { ...PET, x: 400, y: 300 };
    window.emit("move");
    await wait(300);
    assert.deepEqual(JSON.parse(fs.readFileSync(positionFile, "utf8")), {
      x: 400,
      y: 300,
      displayId: 1,
    });

    // setBounds emits a synchronous move; the setup position must not
    // replace the saved pet position
    setMode({ sender: {} }, "setup");
    await wait(300);
    assert.deepEqual(JSON.parse(fs.readFileSync(positionFile, "utf8")), {
      x: 400,
      y: 300,
      displayId: 1,
    });
  } finally {
    // stop the pointer poll even when an assertion above fails
    loaded?.window.emit("hide");
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test("a setup window drag is clamped without saving it as the pet position", async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "buddy-setup-move-"));
  const positionFile = path.join(userData, "window-position.json");
  let loaded;
  try {
    loaded = loadMain(userData);
    const { window, ipcHandlers } = loaded;
    const setMode = ipcHandlers.get("window-mode");

    setMode({ sender: {} }, "pet");
    window.bounds = { ...PET, x: 400, y: 300 };
    window.emit("move");
    await wait(300);
    assert.deepEqual(JSON.parse(fs.readFileSync(positionFile, "utf8")), {
      x: 400,
      y: 300,
      displayId: 1,
    });

    setMode({ sender: {} }, "setup");
    // the setup card is centered and must not overwrite the pet position
    assert.deepEqual(window.getBounds(), {
      width: 460,
      height: 600,
      x: 410,
      y: 60,
    });
    await wait(300);

    // dragging the setup window by its title bar reports a native move
    window.bounds = { width: 460, height: 600, x: -500, y: 5000 };
    window.emit("moved");
    assert.deepEqual(window.moves.at(-1), [0, WORK_AREA.height - 600]);
    assert.deepEqual(window.getBounds(), {
      width: 460,
      height: 600,
      x: 0,
      y: WORK_AREA.height - 600,
    });

    // setup is centered on purpose, so the clamp must not be remembered
    await wait(300);
    assert.deepEqual(JSON.parse(fs.readFileSync(positionFile, "utf8")), {
      x: 400,
      y: 300,
      displayId: 1,
    });
  } finally {
    loaded?.window.emit("hide");
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
