import type { WorkSession } from "./db";

/** True while a session has not been stopped yet. */
export function isOpenSession(session: WorkSession): boolean {
  return session.endedAt === undefined;
}

/** Last moment a running session was known to still be counting. */
export function lastSeenAt(session: WorkSession): number {
  return Math.max(session.startedAt, session.heartbeatAt ?? session.startedAt);
}

function pausedMsOf(session: Pick<WorkSession, "pausedMs">): number {
  return Math.max(0, session.pausedMs ?? 0);
}

/** Running time, excluding stretches where the app was closed. */
export function elapsedWorkMs(
  session: Pick<WorkSession, "startedAt" | "pausedMs">,
  now: number,
): number {
  return Math.max(0, now - session.startedAt - pausedMsOf(session));
}

/**
 * Reopen a session after a quit or crash. The gap since the last heartbeat is
 * recorded as paused, so time spent with the app closed never lands in the log.
 */
export function resumeSession(session: WorkSession, now: number): WorkSession {
  const lastSeen = Math.min(lastSeenAt(session), now);
  return {
    ...session,
    pausedMs: pausedMsOf(session) + Math.max(0, now - lastSeen),
    heartbeatAt: now,
  };
}

/** Close a session at the last moment it was known to be running. */
export function closeSession(session: WorkSession, endedAt: number): WorkSession {
  const safeEnd = Math.max(session.startedAt, endedAt);
  return {
    ...session,
    endedAt: safeEnd,
    durationMs: elapsedWorkMs(session, safeEnd),
    heartbeatAt: safeEnd,
  };
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
