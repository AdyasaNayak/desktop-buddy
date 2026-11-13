import type { WorkSession } from "./db";

/** Remind the user to take a break after a long stretch of work. */
export const LONG_SESSION_REMINDER_MS = 90 * 60 * 1000;

export const MAX_WORK_TASK_LENGTH = 60;
export const MAX_SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

type WorkTiming = Pick<WorkSession, "startedAt"> &
  Partial<
    Pick<WorkSession, "pausedMs" | "pausedAt" | "durationMs" | "heartbeatAt">
  >;

/** True while a session has not been stopped yet. */
export function isOpenSession(
  session: Pick<WorkSession, "endedAt">,
): boolean {
  return session.endedAt === undefined;
}

/**
 * Last wall-clock moment a running session was known to still be counting.
 * Older rows may still be missing a heartbeat, so the start time is the
 * fallback.
 */
export function lastSeenAt(session: WorkTiming): number {
  return Math.max(session.startedAt, session.heartbeatAt ?? session.startedAt);
}

function pausedMsOf(session: Pick<WorkSession, "pausedMs">): number {
  return Math.max(0, session.pausedMs ?? 0);
}

/** Work time banked in `durationMs`, which is also the open-session checkpoint. */
function bankedWorkMs(session: WorkTiming): number {
  const duration = session.durationMs ?? 0;
  return Number.isFinite(duration) ? Math.max(0, duration) : 0;
}

/**
 * Work recorded at the last checkpoint. Keeping this separate from the live
 * wall clock means a backwards clock change cannot erase work already done,
 * and rows whose heartbeat is older than their checkpoint keep that work.
 */
function checkpointWorkMs(session: WorkTiming): number {
  const seen = session.pausedAt ?? lastSeenAt(session);
  const wallWork = Math.max(
    0,
    seen - session.startedAt - pausedMsOf(session),
  );
  return Math.max(bankedWorkMs(session), wallWork);
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

/**
 * Running time, excluding stretches that were paused or spent closed. The
 * banked checkpoint only moves forwards, so moving the system clock backwards
 * freezes the timer instead of making its duration shrink or jump to zero.
 */
export function elapsedWorkMs(session: WorkTiming, now: number): number {
  const checkpoint = checkpointWorkMs(session);
  if (session.pausedAt !== undefined) return checkpoint;
  return checkpoint + Math.max(0, now - lastSeenAt(session));
}

/** Pause a running timer without closing it. */
export function pauseSession(session: WorkSession, now: number): WorkSession {
  if (session.pausedAt !== undefined) return session;
  const at = Math.max(session.startedAt, now);
  return {
    ...session,
    durationMs: elapsedWorkMs(session, at),
    pausedAt: at,
    heartbeatAt: at,
  };
}

/** Resume a paused timer and keep the paused stretch out of its duration. */
export function resumePausedSession(
  session: WorkSession,
  now: number,
): WorkSession {
  if (session.pausedAt === undefined) return session;
  const at = Math.max(session.pausedAt, now);
  return {
    ...session,
    durationMs: elapsedWorkMs(session, at),
    pausedMs: pausedMsOf(session) + (at - session.pausedAt),
    pausedAt: undefined,
    heartbeatAt: at,
  };
}

/**
 * Reopen a session after a quit or crash. Work through the last checkpoint is
 * banked, and the gap since then is recorded as paused so time spent with the
 * app closed never lands in the log. A timer that was already paused stays
 * paused without counting that gap twice.
 */
export function resumeSession(session: WorkSession, now: number): WorkSession {
  const work = checkpointWorkMs(session);
  if (session.pausedAt !== undefined) {
    return {
      ...session,
      durationMs: work,
      pausedMs: pausedMsOf(session),
      heartbeatAt: now,
    };
  }
  return {
    ...session,
    durationMs: work,
    pausedMs: Math.max(0, now - session.startedAt - work),
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
  const durationMs = elapsedWorkMs(session, safeEnd);
  const closed = { ...session, endedAt: safeEnd, durationMs };
  const finalPausedMs = finalizedPausedMs(closed);
  // A backwards clock change can put `endedAt` before work that was already
  // banked; keep the timestamps consistent with the recorded duration.
  const consistentEnd = Math.max(
    safeEnd,
    session.startedAt + durationMs + finalPausedMs,
  );
  return {
    ...closed,
    endedAt: consistentEnd,
    ...(session.pausedAt !== undefined
      ? { pausedMs: finalPausedMs, pausedAt: undefined }
      : {}),
    heartbeatAt: consistentEnd,
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
  /**
   * Extra open sessions left by a duplicate start, now closed into the log.
   * Empty duplicates are omitted; the caller deletes any open row that is not
   * returned here or in `resume`.
   */
  closed: WorkSession[];
}

/**
 * Decide what to do with timers found open at launch. Normally there is one;
 * if the old duplicate-start bug left several, a timer that has already
 * counted work wins (the most recent activity breaks ties), because an empty
 * duplicate cannot be the timer the user was actually using. The rest are
 * saved at their last checkpoint. A duplicate that never counted any work is
 * not written to the log as a zero-duration session.
 */
export function planWorkStartup(
  sessions: WorkSession[],
  now: number,
): WorkStartupPlan {
  const [current, ...duplicates] = sessions
    .filter(isOpenSession)
    .map((session) => ({
      session,
      hasWork: checkpointWorkMs(session) > 0,
    }))
    .sort(
      (a, b) =>
        Number(b.hasWork) - Number(a.hasWork) ||
        lastSeenAt(b.session) - lastSeenAt(a.session) ||
        b.session.startedAt - a.session.startedAt ||
        (b.session.id ?? 0) - (a.session.id ?? 0),
    );
  return {
    resume: current ? resumeSession(current.session, now) : null,
    closed: duplicates
      .map(({ session }) => closeSession(session, lastSeenAt(session)))
      .filter((session) => (session.durationMs ?? 0) > 0),
  };
}
