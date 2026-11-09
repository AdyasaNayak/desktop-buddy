const test = require("node:test");
const assert = require("node:assert/strict");
const {
  closeSession,
  elapsedWorkMs,
  planWorkStartup,
} = require("../src/workSessions.ts");

function openSession(overrides) {
  return {
    id: 1,
    task: "write report",
    startedAt: 1_000,
    durationMs: 0,
    heartbeatAt: 11_000,
    ...overrides,
  };
}

test("an open session resumes where its last heartbeat left off", () => {
  const session = openSession();
  const now = 101_000;
  const { resume, closed } = planWorkStartup([session], now);

  assert.deepEqual(closed, []);
  assert.equal(resume.startedAt, session.startedAt);
  assert.equal(resume.pausedMs, now - session.heartbeatAt);
  assert.equal(resume.heartbeatAt, now);
  assert.equal(elapsedWorkMs(resume, now), 10_000);
});

test("time after the heartbeat is paused, not counted as work", () => {
  const session = openSession();
  const { resume } = planWorkStartup([session], 101_000);

  // Five seconds of fresh work after reopening adds to the ten seconds that
  // were already counted before the app closed.
  assert.equal(elapsedWorkMs(resume, 106_000), 15_000);

  const stopped = closeSession(resume, 106_000);
  assert.equal(stopped.endedAt, 106_000);
  assert.equal(stopped.durationMs, 15_000);
});

test("restarting more than once keeps accumulating paused time", () => {
  const first = planWorkStartup([openSession()], 101_000).resume;
  const second = planWorkStartup([first], 201_000).resume;

  assert.equal(first.pausedMs, 90_000);
  assert.equal(second.pausedMs, 190_000);
  assert.equal(elapsedWorkMs(second, 201_000), 10_000);
});

test("a duplicate open session is closed and the newest one is resumed", () => {
  const older = openSession({
    id: 1,
    task: "old task",
    startedAt: 1_000,
    heartbeatAt: 6_000,
  });
  const newer = openSession({
    id: 2,
    task: "new task",
    startedAt: 2_000,
    heartbeatAt: 8_000,
  });
  const { resume, closed } = planWorkStartup([older, newer], 20_000);

  assert.equal(resume.id, 2);
  assert.equal(resume.task, "new task");
  assert.deepEqual(closed, [
    {
      ...older,
      endedAt: 6_000,
      durationMs: 5_000,
      heartbeatAt: 6_000,
    },
  ]);
});

test("equal start times fall back to the most recently added session", () => {
  const lowerId = openSession({ id: 1, task: "first", startedAt: 5_000 });
  const higherId = openSession({ id: 2, task: "second", startedAt: 5_000 });
  const { resume, closed } = planWorkStartup([lowerId, higherId], 20_000);

  assert.equal(resume.id, 2);
  assert.deepEqual(
    closed.map((session) => session.id),
    [1],
  );
});

test("stopped sessions are left untouched", () => {
  const stopped = {
    ...openSession(),
    endedAt: 12_000,
    durationMs: 11_000,
  };
  assert.deepEqual(planWorkStartup([stopped], 50_000), {
    resume: null,
    closed: [],
  });
});

test("no open sessions means nothing to resume", () => {
  assert.deepEqual(planWorkStartup([], 50_000), {
    resume: null,
    closed: [],
  });
});

test("a missing heartbeat falls back to the start time", () => {
  const session = openSession({ heartbeatAt: undefined });
  const { resume } = planWorkStartup([session], 50_000);

  assert.equal(resume.pausedMs, 49_000);
  assert.equal(elapsedWorkMs(resume, 50_000), 0);
});

test("elapsed work never goes negative", () => {
  assert.equal(elapsedWorkMs({ startedAt: 10_000, pausedMs: 0 }, 5_000), 0);
  assert.equal(
    elapsedWorkMs({ startedAt: 10_000, pausedMs: 20_000 }, 5_000),
    0,
  );
});
