import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db, type WorkSession } from "./db";
import {
  elapsedWorkMs,
  isOpenSession,
  planWorkStartup,
} from "./workSessions";

export interface ActiveWork {
  id: number;
  task: string;
  startedAt: number;
  /** Time excluded because the app was closed while the timer was running. */
  pausedMs: number;
}

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

function toActive(session: WorkSession): ActiveWork {
  return {
    id: session.id!,
    task: session.task,
    startedAt: session.startedAt,
    pausedMs: Math.max(0, session.pausedMs ?? 0),
  };
}

/**
 * Keeps the running task timer and the saved work log. A session that was
 * still running when the app quit or crashed is resumed from its last
 * heartbeat; time spent with the app closed is paused instead of counted.
 */
export function useWorkLog() {
  const [active, setActive] = useState<ActiveWork | null>(null);
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const starting = useRef(false);
  const loaded = useRef<Promise<void> | null>(null);

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
            for (const session of plan.closed) {
              await db.workSessions.put(session);
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
          setActive(toActive(resumed));
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
  }, []);

  useEffect(() => {
    if (!active) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const beat = window.setInterval(() => {
      void db.workSessions
        .update(active.id, { heartbeatAt: Date.now() })
        .catch((error) => console.error("Could not save work heartbeat", error));
    }, HEARTBEAT_MS);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(beat);
    };
  }, [active]);

  const start = useCallback(async (task: string) => {
    const trimmed = task.trim();
    if (!trimmed) throw new Error("Tell me what you're working on first.");
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
      setActive({ id, task: trimmed, startedAt, pausedMs: 0 });
    } finally {
      starting.current = false;
    }
  }, []);

  const stop = useCallback(async () => {
    if (!active) return 0;
    const endedAt = Date.now();
    const durationMs = elapsedWorkMs(active, endedAt);
    await db.workSessions.update(active.id, {
      endedAt,
      durationMs,
      heartbeatAt: endedAt,
    });
    setActive(null);
    setSessions(await readLog());
    return durationMs;
  }, [active]);

  const elapsedMs = active ? elapsedWorkMs(active, now) : 0;

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

  return { active, elapsedMs, totals, recent, start, stop };
}
