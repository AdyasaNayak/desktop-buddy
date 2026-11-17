const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const os = require("node:os");

const MAIN_PATH = require.resolve("../electron/main.cjs");

/**
 * Load the real main process with just enough Electron stubbed out to reach
 * its IPC handlers. `requestSingleInstanceLock` returning false keeps the
 * module from opening windows or attaching display listeners.
 */
function loadMain(displays, bounds) {
  const handlers = new Map();
  const moved = [];
  const window = {
    getBounds: () => ({ ...bounds }),
    setPosition: (x, y) => moved.push([x, y]),
    isDestroyed: () => false,
  };
  const electron = {
    app: {
      requestSingleInstanceLock: () => false,
      quit() {},
      on() {},
      whenReady: () => ({ then() {} }),
      getPath: () => os.tmpdir(),
      isPackaged: false,
    },
    BrowserWindow: { fromWebContents: () => window },
    ipcMain: {
      on: (channel, handler) => handlers.set(channel, handler),
      handle() {},
    },
    Menu: { buildFromTemplate: () => ({}) },
    Notification: class {},
    Tray: class {},
    nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
    screen: {
      getAllDisplays: () => displays,
      getDisplayNearestPoint: () => displays[0],
      getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    },
  };

  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === "electron") return electron;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[MAIN_PATH];
    require(MAIN_PATH);
  } finally {
    Module._load = originalLoad;
    delete require.cache[MAIN_PATH];
  }

  return { handlers, moved };
}

const DISPLAY = {
  id: 1,
  workArea: { x: 0, y: 0, width: 1920, height: 1080 },
};
const WINDOW = { x: 500, y: 300, width: 360, height: 260 };

test("a drag near an edge is snapped and a free drag keeps its position", () => {
  const { handlers, moved } = loadMain([DISPLAY], WINDOW);
  const move = handlers.get("move-window");

  move({ sender: {} }, 10, 20);
  move({ sender: {} }, 1545, 300);
  move({ sender: {} }, 100, 500);

  assert.deepEqual(moved, [
    [0, 0],
    [1560, 300],
    [100, 500],
  ]);
});
