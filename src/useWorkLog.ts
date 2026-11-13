import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db, type WorkSession } from "./db";
import {
  applyWorkSessionEdit,
  closeSession,
  elapsedWorkMs,
  isOpenSession,
  longSessionReminderDue,
  MAX_WORK_TASK_LENGTH,
  pauseSession,
  planWorkStartup,
  resumePausedSession,
  workSessionEditError,
  workSessionsToCsv,
  type WorkSessionEdit,
} from "./workSessions";

export type ActiveWork = WorkSession & { id: number };

export interface TaskTotal {
  task: string;
  totalMs: number;
  sessions: number;
  lastAt: number;
}

const HEARTBEAT_MS = 15_000;

async function readLog(): Promise<WorkSession[]> {
  return db.workSessions.orderBy("startedAt").reverse().toArray();
}

function toActive(session: WorkSession): ActiveWork | null {
  if (session.id === undefined) return null;
  return { ...session, id: session.id };
}

/**
 * Keeps the running task timer and the saved work log. A session that was
 * still running when the app quit or crashed is resumed from its last
 * checkpoint; time spent with the app closed is paused instead of counted.
 */
export function useWorkLog() {
  const [active, setActive] = useState<ActiveWork | null>(null);
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const activeRef = useRef<ActiveWork | null>(null);
  const timerBusy = useRef(false);
  const starting = useRef(false);
  const loaded = useRef<Promise<void> | null>(null);

  const setCurrentActive = useCallback((next: ActiveWork | null) => {
    activeRef.current = next;
    setActive(next);
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const resumed = await db.transaction(
          "rw",
          db.workSessions,
          async () => {
            const open = await db.workSessions
              .filter(isOpenSession)
              .toArray();
            const plan = planWorkStartup(open, Date.now());
            const handled = new Set<number>();
            if (plan.resume?.id !== undefined) handled.add(plan.resume.id);
            for (const session of plan.closed) {
              await db.workSessions.put(session);
              if (session.id !== undefined) handled.add(session.id);
            }
            // Empty duplicates are deliberately kept out of the work log.
            for (const session of open) {
              if (session.id !== undefined && !handled.has(session.id)) {
                await db.workSessions.delete(session.id);
              }
            }
            if (plan.resume) await db.workSessions.put(plan.resume);
            return plan.resume;
          },
        );
        const saved = await readLog();
        if (!alive) return;
        setSessions(saved);
        if (resumed) {
          setNow(Date.now());
          setCurrentActive(toActive(resumed));
        }
      } catch (error) {
        console.error("Could not load the work log", error);
      }
    };
    const promise = load();
    loaded.current = promise;
    return () => {
      alive = false;
    };
  }, [setCurrentActive]);

  useEffect(() => {
    // A paused timer has nothing to count and no changing heartbeat to save.
    if (!active || active.pausedAt !== undefined) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const beat = window.setInterval(() => {
      const current = activeRef.current;
      if (
        timerBusy.current ||
        !current ||
        current.id !== active.id ||
        current.pausedAt !== undefined
      ) {
        return;
      }
      const at = Date.now();
      const durationMs = elapsedWorkMs(current, at);
      // Keep the in-memory checkpoint current as well as the saved one. If the
      // clock moves backwards before the next beat, the timer keeps the work
      // it has already counted instead of falling back to a wall-clock gap.
      setCurrentActive({ ...current, durationMs, heartbeatAt: at });
      void db.workSessions
        .update(current.id, { heartbeatAt: at, durationMs })
        .catch((error) => console.error("Could not save work heartbeat", error));
    }, HEARTBEAT_MS);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(beat);
    };
  }, [active, setCurrentActive]);

  const start = useCallback(async (task: string) => {
    const trimmed = task.trim();
    if (!trimmed) throw new Error("Tell me what you're working on first.");
    if (trimmed.length > MAX_WORK_TASK_LENGTH) {
      throw new Error(
        `Task names are limited to ${MAX_WORK_TASK_LENGTH} characters.`,
      );
    }
    if (starting.current) throw new Error("A timer is already starting.");
    starting.current = true;
    try {
      // The first load reconciles timers left open by the previous run, so a
      // start never races it and creates a second open session.
      await loaded.current;
      const startedAt = Date.now();
      const id = await db.transaction("rw", db.workSessions, async () => {
        const open = await db.workSessions.filter(isOpenSession).first();
        if (open) {
          throw new Error(
            `A timer is already running for "${open.task}". Stop it first.`,
          );
        }
        return db.workSessions.add({
          task: trimmed,
          startedAt,
          durationMs: 0,
          pausedMs: 0,
          heartbeatAt: startedAt,
        });
      });
      setNow(startedAt);
      setCurrentActive({
        id,
        task: trimmed,
        startedAt,
        durationMs: 0,
        pausedMs: 0,
        heartbeatAt: startedAt,
      });
    } finally {
      starting.current = false;
    }
  }, [setCurrentActive]);

  const stop = useCallback(async () => {
    const current = activeRef.current;
    if (!current || timerBusy.current) return 0;
    timerBusy.current = true;
    try {
      const closed = closeSession(current, Date.now());
      await db.workSessions.update(current.id, {
        endedAt: closed.endedAt,
        durationMs: closed.durationMs,
        pausedMs: closed.pausedMs ?? 0,
        pausedAt: undefined,
        heartbeatAt: closed.heartbeatAt,
      });
      setCurrentActive(null);
      setSessions(await readLog());
      return closed.durationMs;
    } finally {
      timerBusy.current = false;
    }
  }, [setCurrentActive]);

  const pause = useCallback(async () => {
    const current = activeRef.current;
    if (!current || current.pausedAt !== undefined || timerBusy.current) {
      return;
    }
    timerBusy.current = true;
    try {
      const at = Date.now();
      const paused = pauseSession(current, at);
      await db.workSessions.update(current.id, {
        durationMs: paused.durationMs,
        pausedAt: paused.pausedAt,
        heartbeatAt: paused.heartbeatAt,
      });
      setNow(at);
      setCurrentActive({ ...paused, id: current.id });
    } finally {
      timerBusy.current = false;
    }
  }, [setCurrentActive]);

  const resume = useCallback(async () => {
    const current = activeRef.current;
    if (!current || current.pausedAt === undefined || timerBusy.current) {
      return;
    }
    timerBusy.current = true;
    try {
      const at = Date.now();
      const resumed = resumePausedSession(current, at);
      await db.workSessions.update(current.id, {
        durationMs: resumed.durationMs,
        pausedMs: resumed.pausedMs,
        pausedAt: undefined,
        heartbeatAt: resumed.heartbeatAt,
      });
      setNow(at);
      setCurrentActive({ ...resumed, id: current.id });
    } finally {
      timerBusy.current = false;
    }
  }, [setCurrentActive]);

  const acknowledgeLongReminder = useCallback(async () => {
    const current = activeRef.current;
    if (!current || current.longReminderAt !== undefined) return;
    const at = Date.now();
    await db.workSessions.update(current.id, { longReminderAt: at });
    // Another action may have paused or stopped the timer while this saved.
    const latest = activeRef.current;
    if (latest && latest.id === current.id) {
      setCurrentActive({ ...latest, longReminderAt: at });
    }
  }, [setCurrentActive]);

  const editSession = useCallback(
    async (id: number, edit: WorkSessionEdit) => {
      const problem = workSessionEditError(edit);
      if (problem) throw new Error(problem);

      const existing = await db.workSessions.get(id);
      if (!existing) throw new Error("That session no longer exists.");
      if (isOpenSession(existing)) {
        throw new Error("Stop the timer before editing this session.");
      }

      await db.workSessions.put(
        applyWorkSessionEdit({ ...existing, id }, edit),
      );
      setSessions(await readLog());
    },
    [],
  );

  const deleteSession = useCallback(async (id: number) => {
    const existing = await db.workSessions.get(id);
    if (!existing) throw new Error("That session no longer exists.");
    if (isOpenSession(existing)) {
      throw new Error("Stop the timer before deleting this session.");
    }
    await db.workSessions.delete(id);
    setSessions(await readLog());
  }, []);

  const exportCsv = useCallback(
    () => workSessionsToCsv(sessions),
    [sessions],
  );

  const elapsedMs = active ? elapsedWorkMs(active, now) : 0;
  const longBreakDue = active
    ? longSessionReminderDue(active, now)
    : false;

  const totals = useMemo(() => {
    const grouped = new Map<string, TaskTotal>();
    for (const session of sessions) {
      if (session.endedAt === undefined) continue;
      const key = session.task.toLocaleLowerCase();
      const existing = grouped.get(key);
      if (existing) {
        existing.totalMs += session.durationMs;
        existing.sessions += 1;
        existing.lastAt = Math.max(existing.lastAt, session.startedAt);
      } else {
        grouped.set(key, {
          task: session.task,
          totalMs: session.durationMs,
          sessions: 1,
          lastAt: session.startedAt,
        });
      }
    }
    return [...grouped.values()].sort((a, b) => b.lastAt - a.lastAt);
  }, [sessions]);

  const recent = useMemo(
    () => sessions.filter((session) => session.endedAt !== undefined).slice(0, 20),
    [sessions],
  );

  return {
    active,
    elapsedMs,
    longBreakDue,
    totals,
    recent,
    start,
    stop,
    pause,
    resume,
    acknowledgeLongReminder,
    editSession,
    deleteSession,
    exportCsv,
  };
}
