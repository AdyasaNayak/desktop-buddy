const test = require("node:test");
const assert = require("node:assert/strict");
const {
  formatWorkClock,
  normalizeWorkStatus,
  trayTooltip,
  workStatusLabel,
} = require("../electron/tray-status.cjs");

const WORK = { task: "finish the report", elapsedMs: 342_000, paused: false };

test("the tray clock matches the buddy timer", () => {
  assert.equal(formatWorkClock(0), "00:00");
  assert.equal(formatWorkClock(5_000), "00:05");
  assert.equal(formatWorkClock(342_000), "05:42");
  assert.equal(formatWorkClock(3_942_000), "1:05:42");
  assert.equal(formatWorkClock(-1), "00:00");
});

test("a running work status is accepted and trimmed", () => {
  assert.deepEqual(normalizeWorkStatus({ ...WORK, task: "  report  " }), {
    ...WORK,
    task: "report",
  });
});

test("malformed work statuses are ignored", () => {
  const valid = { task: "report", elapsedMs: 1_000, paused: false };

  assert.equal(normalizeWorkStatus(null), null);
  assert.equal(normalizeWorkStatus("working"), null);
  assert.equal(normalizeWorkStatus({ ...valid, task: "  " }), null);
  assert.equal(normalizeWorkStatus({ ...valid, task: "x".repeat(61) }), null);
  assert.equal(normalizeWorkStatus({ ...valid, elapsedMs: Number.NaN }), null);
  assert.equal(normalizeWorkStatus({ ...valid, elapsedMs: -1 }), null);
});

test("a hidden tray tooltip keeps the task, clock, and way back", () => {
  assert.equal(
    trayTooltip({ visible: false, work: WORK }),
    "Desktop Buddy — working: finish the report (05:42) · click to bring me back",
  );
  assert.equal(
    trayTooltip({ visible: true, work: WORK }),
    "Desktop Buddy — working: finish the report (05:42)",
  );
});

test("the tooltip falls back to the old text without a running timer", () => {
  assert.equal(trayTooltip({ visible: true, work: null }), "Desktop Buddy");
  assert.equal(
    trayTooltip({ visible: false, work: null }),
    "Desktop Buddy — click to bring me back",
  );
});

test("a paused timer is labeled as paused in the tray", () => {
  const paused = { ...WORK, paused: true };

  assert.equal(workStatusLabel(paused), "paused: finish the report · 05:42");
  assert.equal(
    trayTooltip({ visible: false, work: paused }),
    "Desktop Buddy — paused: finish the report (05:42) · click to bring me back",
  );
});

test("there is no work menu row without an active timer", () => {
  assert.equal(workStatusLabel(null), null);
});
