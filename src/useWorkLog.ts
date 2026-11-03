import { useCallback, useEffect, useMemo, useState } from "react";
import { db, type WorkSession } from "./db";

export interface ActiveWork {
  id: number;
  task: string;
  startedAt: number;
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

/**
 * Keeps the running task timer and the saved work log. Sessions left open by
 * a quit or crash are closed at their last heartbeat when the app starts, so
 * time spent with the app closed never lands in the log.
 */
export function useWorkLog() {
  const [active, setActive] = useState<ActiveWork | null>(null);
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const open = await db.workSessions
          .filter((session) => session.endedAt === undefined)
          .toArray();
        for (const session of open) {
          const endedAt = session.heartbeatAt ?? session.startedAt;
          await db.workSessions.update(session.id!, {
            endedAt,
            durationMs: Math.max(0, endedAt - session.startedAt),
            heartbeatAt: endedAt,
          });
        }
        const saved = await readLog();
        if (alive) setSessions(saved);
      } catch (error) {
        console.error("Could not load the work log", error);
      }
    };
    void load();
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
    const startedAt = Date.now();
    const id = await db.workSessions.add({
      task: trimmed,
      startedAt,
      durationMs: 0,
      heartbeatAt: startedAt,
    });
    setNow(startedAt);
    setActive({ id, task: trimmed, startedAt });
  }, []);

  const stop = useCallback(async () => {
    if (!active) return 0;
    const endedAt = Date.now();
    const durationMs = Math.max(0, endedAt - active.startedAt);
    await db.workSessions.update(active.id, {
      endedAt,
      durationMs,
      heartbeatAt: endedAt,
    });
    setActive(null);
    setSessions(await readLog());
    return durationMs;
  }, [active]);

  const elapsedMs = active ? Math.max(0, now - active.startedAt) : 0;

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
