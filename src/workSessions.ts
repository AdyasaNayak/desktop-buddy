import type { WorkSession } from "./db";

/** Remind the user to take a break after a long stretch of work. */
export const LONG_SESSION_REMINDER_MS = 90 * 60 * 1000;

export const MAX_WORK_TASK_LENGTH = 60;
export const MAX_SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/** True while a session has not been stopped yet. */
export function isOpenSession(
  session: Pick<WorkSession, "endedAt">,
): boolean {
  return session.endedAt === undefined;
}

/** Last moment a running session was known to still be counting. */
export function lastSeenAt(session: WorkSession): number {
  return Math.max(session.startedAt, session.heartbeatAt ?? session.startedAt);
}

function pausedMsOf(session: Pick<WorkSession, "pausedMs">): number {
  return Math.max(0, session.pausedMs ?? 0);
}

/** Total paused time, including a pause that is still open at the end. */
function finalizedPausedMs(
  session: Pick<WorkSession, "pausedMs" | "pausedAt" | "endedAt">,
): number {
  const openPause =
    session.pausedAt !== undefined && session.endedAt !== undefined
      ? Math.max(0, session.endedAt - session.pausedAt)
      : 0;
  return pausedMsOf(session) + openPause;
}

/** Running time, excluding stretches that were paused or spent closed. */
export function elapsedWorkMs(
  session: Pick<WorkSession, "startedAt" | "pausedMs" | "pausedAt">,
  now: number,
): number {
  const pausedNow =
    session.pausedAt === undefined
      ? 0
      : Math.max(0, now - session.pausedAt);
  return Math.max(
    0,
    now - session.startedAt - pausedMsOf(session) - pausedNow,
  );
}

/** Pause a running timer without closing it. */
export function pauseSession(session: WorkSession, now: number): WorkSession {
  if (session.pausedAt !== undefined) return session;
  return { ...session, pausedAt: now, heartbeatAt: now };
}

/** Resume a paused timer and keep the paused stretch out of its duration. */
export function resumePausedSession(
  session: WorkSession,
  now: number,
): WorkSession {
  if (session.pausedAt === undefined) return session;
  return {
    ...session,
    pausedMs: pausedMsOf(session) + Math.max(0, now - session.pausedAt),
    pausedAt: undefined,
    heartbeatAt: now,
  };
}

/**
 * Reopen a session after a quit or crash. The gap since the last heartbeat is
 * recorded as paused, so time spent with the app closed never lands in the log.
 * A timer that was already paused stays paused without counting that gap twice.
 */
export function resumeSession(session: WorkSession, now: number): WorkSession {
  const lastSeen = Math.min(lastSeenAt(session), now);
  return {
    ...session,
    pausedMs:
      pausedMsOf(session) +
      (session.pausedAt === undefined ? Math.max(0, now - lastSeen) : 0),
    heartbeatAt: now,
  };
}

/** True when a running session has earned its one-time break reminder. */
export function longSessionReminderDue(
  session: Pick<
    WorkSession,
    "endedAt" | "startedAt" | "pausedMs" | "pausedAt" | "longReminderAt"
  >,
  now: number,
): boolean {
  return (
    isOpenSession(session) &&
    session.pausedAt === undefined &&
    session.longReminderAt === undefined &&
    elapsedWorkMs(session, now) >= LONG_SESSION_REMINDER_MS
  );
}

/** Close a session at the last moment it was known to be running. */
export function closeSession(session: WorkSession, endedAt: number): WorkSession {
  const safeEnd = Math.max(session.startedAt, endedAt);
  const closed = { ...session, endedAt: safeEnd };
  return {
    ...closed,
    durationMs: elapsedWorkMs(session, safeEnd),
    ...(session.pausedAt !== undefined
      ? { pausedMs: finalizedPausedMs(closed), pausedAt: undefined }
      : {}),
    heartbeatAt: safeEnd,
  };
}

export interface WorkSessionEdit {
  task: string;
  startedAt: number;
  durationMs: number;
}

/** Shared validation for the edit form and the save path. */
export function workSessionEditError(
  edit: WorkSessionEdit,
): string | null {
  if (!edit.task.trim()) return "Give this session a task name.";
  if (edit.task.trim().length > MAX_WORK_TASK_LENGTH) {
    return `Task names are limited to ${MAX_WORK_TASK_LENGTH} characters.`;
  }
  if (!Number.isFinite(edit.startedAt) || edit.startedAt <= 0) {
    return "Choose a valid start time.";
  }
  if (!Number.isFinite(edit.durationMs) || edit.durationMs < 60_000) {
    return "Work time needs to be at least one minute.";
  }
  if (edit.durationMs > MAX_SESSION_DURATION_MS) {
    return "That is too long for one work session.";
  }
  return null;
}

/** Apply a valid edit, keeping the session's recorded pauses intact. */
export function applyWorkSessionEdit(
  session: WorkSession,
  edit: WorkSessionEdit,
): WorkSession {
  const pausedMs = finalizedPausedMs(session);
  const endedAt = edit.startedAt + edit.durationMs + pausedMs;
  return {
    ...session,
    task: edit.task.trim(),
    startedAt: edit.startedAt,
    durationMs: edit.durationMs,
    pausedMs,
    pausedAt: undefined,
    endedAt,
    heartbeatAt: endedAt,
  };
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value)
    ? `"${value.replace(/"/g, '""')}"`
    : value;
}

function csvMinutes(ms: number): string {
  return String(Math.round(Math.max(0, ms) / 600) / 100);
}

/** The whole saved work log as a spreadsheet-friendly CSV. */
export function workSessionsToCsv(sessions: WorkSession[]): string {
  const rows = [
    ["Task", "Started", "Ended", "Duration (minutes)", "Paused (minutes)"],
  ];
  for (const session of sessions) {
    if (session.endedAt === undefined) continue;
    rows.push([
      session.task,
      new Date(session.startedAt).toISOString(),
      new Date(session.endedAt).toISOString(),
      csvMinutes(session.durationMs),
      csvMinutes(finalizedPausedMs(session)),
    ]);
  }
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export interface WorkStartupPlan {
  /** The session to keep running. */
  resume: WorkSession | null;
  /** Extra open sessions left by a duplicate start, now closed into the log. */
  closed: WorkSession[];
}

/**
 * Decide what to do with timers found open at launch. Normally there is one;
 * if the old duplicate-start bug left several, the most recent one is resumed
 * and the rest are saved at their last heartbeat instead of becoming orphans.
 */
export function planWorkStartup(
  sessions: WorkSession[],
  now: number,
): WorkStartupPlan {
  const [current, ...duplicates] = sessions
    .filter(isOpenSession)
    .sort(
      (a, b) => b.startedAt - a.startedAt || (b.id ?? 0) - (a.id ?? 0),
    );
  return {
    resume: current ? resumeSession(current, now) : null,
    closed: duplicates.map((session) =>
      closeSession(session, lastSeenAt(session)),
    ),
  };
}
