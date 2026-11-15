const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  DEFAULT_ALWAYS_ON_TOP,
  readAlwaysOnTop,
  writeAlwaysOnTop,
} = require("../electron/window-preferences.cjs");

test("always on top defaults on when there is no saved preference", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buddy-preferences-"));
  try {
    assert.equal(
      readAlwaysOnTop(path.join(dir, "window-preferences.json")),
      DEFAULT_ALWAYS_ON_TOP,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the saved choice round-trips through the preferences file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buddy-preferences-"));
  const file = path.join(dir, "window-preferences.json");
  try {
    assert.equal(writeAlwaysOnTop(file, false), true);
    assert.equal(readAlwaysOnTop(file), false);

    assert.equal(writeAlwaysOnTop(file, true), true);
    assert.equal(readAlwaysOnTop(file), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("damaged or unexpected preferences fall back to always on top", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buddy-preferences-"));
  const file = path.join(dir, "window-preferences.json");
  try {
    fs.writeFileSync(file, "{not json");
    assert.equal(readAlwaysOnTop(file), true);

    fs.writeFileSync(file, JSON.stringify({ alwaysOnTop: "false" }));
    assert.equal(readAlwaysOnTop(file), true);

    fs.writeFileSync(file, JSON.stringify(null));
    assert.equal(readAlwaysOnTop(file), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a non-boolean preference is never written", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buddy-preferences-"));
  const file = path.join(dir, "window-preferences.json");
  try {
    assert.equal(writeAlwaysOnTop(file, "false"), false);
    assert.equal(fs.existsSync(file), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
