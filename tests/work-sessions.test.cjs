const test = require("node:test");
const assert = require("node:assert/strict");
const {
  LONG_SESSION_REMINDER_MS,
  applyWorkSessionEdit,
  closeSession,
  elapsedWorkMs,
  longSessionReminderDue,
  pauseSession,
  planWorkStartup,
  resumePausedSession,
  workSessionEditError,
  workSessionsToCsv,
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

test("a stored duration survives recovery without a heartbeat", () => {
  const session = openSession({ heartbeatAt: undefined, durationMs: 30_000 });
  const { resume } = planWorkStartup([session], 100_000);

  assert.equal(resume.durationMs, 30_000);
  assert.equal(elapsedWorkMs(resume, 100_000), 30_000);
});

test("a backward clock change keeps the work already banked", () => {
  const running = openSession({
    startedAt: 1_000,
    heartbeatAt: 61_000,
    durationMs: 60_000,
  });

  assert.equal(elapsedWorkMs(running, 62_000), 61_000);
  // The clock went back a minute; the timer freezes instead of shrinking to 1s.
  assert.equal(elapsedWorkMs(running, 2_000), 60_000);
  assert.equal(elapsedWorkMs(running, 10_000), 60_000);
  assert.equal(elapsedWorkMs(running, 65_000), 64_000);

  const stopped = closeSession(running, 2_000);
  assert.equal(stopped.durationMs, 60_000);
  assert.equal(stopped.endedAt, 61_000);
});

test("recovery after a backward clock change keeps the counted work", () => {
  const running = openSession({
    startedAt: 1_000,
    heartbeatAt: 601_000,
    durationMs: 600_000,
  });
  const { resume } = planWorkStartup([running], 100_000);

  assert.equal(resume.durationMs, 600_000);
  assert.equal(resume.pausedMs, 0);
  assert.equal(elapsedWorkMs(resume, 100_000), 600_000);
  assert.equal(elapsedWorkMs(resume, 105_000), 605_000);
});

test("recovery after a forward clock change does not bank closed time", () => {
  const running = openSession({
    startedAt: 1_000,
    heartbeatAt: 61_000,
    durationMs: 60_000,
  });
  const later = 61_000 + 60 * 60_000;
  const { resume } = planWorkStartup([running], later);

  assert.equal(resume.durationMs, 60_000);
  assert.equal(elapsedWorkMs(resume, later), 60_000);
  // Correcting the clock back must not erase that work either.
  assert.equal(elapsedWorkMs(resume, 120_000), 60_000);
});

test("an idle duplicate is discarded and the active timer is resumed", () => {
  const active = openSession({
    id: 1,
    startedAt: 1_000,
    heartbeatAt: 100_000,
    durationMs: 99_000,
  });
  const stray = openSession({
    id: 2,
    startedAt: 50_000,
    heartbeatAt: 50_000,
    durationMs: 0,
  });
  const { resume, closed } = planWorkStartup([stray, active], 101_000);

  assert.equal(resume.id, 1);
  assert.equal(elapsedWorkMs(resume, 101_000), 99_000);
  assert.deepEqual(closed, []);
});

test("a paused timer wins over a newer empty duplicate", () => {
  const paused = pauseSession(
    openSession({ id: 1, startedAt: 1_000, heartbeatAt: 61_000 }),
    61_000,
  );
  const stray = openSession({
    id: 2,
    startedAt: 70_000,
    heartbeatAt: 70_000,
    durationMs: 0,
  });
  const { resume, closed } = planWorkStartup([paused, stray], 80_000);

  assert.equal(resume.id, 1);
  assert.equal(resume.pausedAt, 61_000);
  assert.equal(elapsedWorkMs(resume, 80_000), 60_000);
  assert.deepEqual(closed, []);
});

test("duplicate starts that never counted time are not logged", () => {
  const first = openSession({
    id: 1,
    startedAt: 5_000,
    heartbeatAt: 5_000,
    durationMs: 0,
  });
  const second = openSession({
    id: 2,
    startedAt: 5_000,
    heartbeatAt: 5_000,
    durationMs: 0,
  });
  const { resume, closed } = planWorkStartup([first, second], 20_000);

  assert.equal(resume.id, 2);
  assert.deepEqual(closed, []);
});

test("elapsed work never goes negative", () => {
  assert.equal(elapsedWorkMs({ startedAt: 10_000, pausedMs: 0 }, 5_000), 0);
  assert.equal(
    elapsedWorkMs({ startedAt: 10_000, pausedMs: 20_000 }, 5_000),
    0,
  );
});

test("pausing freezes the clock and resuming skips the paused stretch", () => {
  const running = openSession({ startedAt: 1_000, heartbeatAt: 61_000 });
  const paused = pauseSession(running, 61_000);

  assert.equal(paused.pausedAt, 61_000);
  assert.equal(paused.durationMs, 60_000);
  assert.equal(elapsedWorkMs(paused, 121_000), 60_000);

  const resumed = resumePausedSession(paused, 121_000);
  assert.equal(resumed.pausedAt, undefined);
  assert.equal(resumed.pausedMs, 60_000);
  assert.equal(elapsedWorkMs(resumed, 126_000), 65_000);
});

test("a timer paused before a restart stays paused without double counting", () => {
  const paused = pauseSession(openSession(), 61_000);
  const reopened = planWorkStartup([paused], 301_000).resume;

  assert.equal(reopened.pausedAt, 61_000);
  assert.equal(reopened.pausedMs, 0);
  assert.equal(elapsedWorkMs(reopened, 301_000), 60_000);

  const resumed = resumePausedSession(reopened, 301_000);
  assert.equal(resumed.pausedMs, 240_000);
  assert.equal(elapsedWorkMs(resumed, 301_000), 60_000);
});

test("pausing for sleep and resuming on wake leaves the nap out", () => {
  const running = openSession({ startedAt: 1_000, heartbeatAt: 61_000 });
  const sleeping = pauseSession(running, 61_000);
  const wakeAt = 61_000 + 15 * 60_000;

  // the clock is frozen for the whole nap
  assert.equal(elapsedWorkMs(sleeping, wakeAt), 60_000);

  const awake = resumePausedSession(sleeping, wakeAt);
  assert.equal(awake.pausedMs, 15 * 60_000);
  assert.equal(elapsedWorkMs(awake, wakeAt + 5_000), 65_000);
});

test("stopping while paused records the final paused stretch", () => {
  const paused = pauseSession(openSession(), 61_000);
  const closed = closeSession(paused, 121_000);

  assert.equal(closed.endedAt, 121_000);
  assert.equal(closed.durationMs, 60_000);
  assert.equal(closed.pausedMs, 60_000);
  assert.equal(closed.pausedAt, undefined);
  assert.equal(
    closed.startedAt + closed.durationMs + closed.pausedMs,
    closed.endedAt,
  );
});

test("a long session asks for a break once, and only while running", () => {
  const startedAt = 1_000;
  const session = openSession({ startedAt, heartbeatAt: startedAt });
  const almost = startedAt + LONG_SESSION_REMINDER_MS - 1;
  const due = startedAt + LONG_SESSION_REMINDER_MS;

  assert.equal(longSessionReminderDue(session, almost), false);
  assert.equal(longSessionReminderDue(session, due), true);
  assert.equal(
    longSessionReminderDue(pauseSession(session, due), due + 1_000),
    false,
  );
  assert.equal(
    longSessionReminderDue({ ...session, longReminderAt: due }, due + 1_000),
    false,
  );
  assert.equal(
    longSessionReminderDue(
      { ...session, endedAt: due, durationMs: LONG_SESSION_REMINDER_MS },
      due + 1_000,
    ),
    false,
  );
});

test("editing a session updates its task, start, and duration", () => {
  const saved = {
    ...openSession({ pausedMs: 10_000 }),
    endedAt: 61_000,
    durationMs: 50_000,
  };
  const edited = applyWorkSessionEdit(saved, {
    task: "  finish the report  ",
    startedAt: 5_000,
    durationMs: 120_000,
  });

  assert.equal(edited.task, "finish the report");
  assert.equal(edited.startedAt, 5_000);
  assert.equal(edited.durationMs, 120_000);
  assert.equal(edited.endedAt, 135_000);
  assert.equal(edited.pausedMs, 10_000);
  assert.equal(edited.heartbeatAt, 135_000);
});

test("session edits need a task, a real start, and a sensible duration", () => {
  const valid = { task: "report", startedAt: 1_000, durationMs: 60_000 };
  assert.equal(workSessionEditError(valid), null);
  assert.match(workSessionEditError({ ...valid, task: "  " }), /task name/i);
  assert.match(
    workSessionEditError({ ...valid, startedAt: Number.NaN }),
    /start time/i,
  );
  assert.match(
    workSessionEditError({ ...valid, durationMs: 0 }),
    /one minute/i,
  );
  assert.match(
    workSessionEditError({ ...valid, task: "x".repeat(61) }),
    /limited to 60/i,
  );
});

test("the CSV export covers closed sessions and escapes task names", () => {
  const closed = {
    ...openSession(),
    task: 'report, "Q4"',
    startedAt: Date.UTC(2026, 2, 3, 9, 0),
    endedAt: Date.UTC(2026, 2, 3, 10, 30),
    durationMs: 90 * 60_000,
    pausedMs: 30 * 60_000,
  };
  const csv = workSessionsToCsv([
    closed,
    openSession({ id: 2, task: "still running" }),
  ]);

  assert.match(
    csv,
    /^Task,Started,Ended,Duration \(minutes\),Paused \(minutes\)\r\n/,
  );
  assert.match(csv, /"report, ""Q4"""/);
  assert.match(csv, /2026-03-03T09:00:00.000Z,2026-03-03T10:30:00.000Z,90,30/);
  assert.doesNotMatch(csv, /still running/);
});
