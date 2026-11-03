import { useState } from "react";
import type { WorkSession } from "./db";
import { formatClock, formatDuration, formatTimeOfDay, todayKey } from "./time";

/** The focus task, its running timer, and the persisted work log. */
export function WorkPanel({
  session,
  sessions,
  now,
  error,
  onStart,
  onStop,
  onClose,
}: {
  session: WorkSession | null;
  sessions: WorkSession[];
  now: number;
  error: string;
  onStart: (task: string) => void;
  onStop: () => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<"timer" | "log">("timer");
  const [task, setTask] = useState("");
  const [emptyError, setEmptyError] = useState("");
  const title = view === "log" ? "Work log" : session ? "Focus timer" : "Work mode";
  const finishedCount = sessions.filter(
    (item) => item.endedAt !== undefined,
  ).length;

  const start = () => {
    const cleaned = task.trim();
    if (!cleaned) {
      setEmptyError("Tell me what you're working on first.");
      return;
    }
    setEmptyError("");
    onStart(cleaned);
  };

  return (
    <div
      className="buddy-panel buddy-panel--work"
      role="dialog"
      aria-modal="true"
      aria-labelledby="work-dialog-title"
    >
      <div className="buddy-panel__head">
        <div className="buddy-panel__title-row">
          {view === "log" && (
            <button
              type="button"
              className="buddy-panel__back"
              onClick={() => setView("timer")}
              aria-label="Back to work timer"
              title="Back to work timer"
            >
              ←
            </button>
          )}
          <h2 id="work-dialog-title" className="buddy-panel__title">
            {title}
          </h2>
        </div>
        <button
          type="button"
          className="buddy-panel__close"
          onClick={onClose}
          aria-label="Close work mode"
        >
          ×
        </button>
      </div>

      {view === "log" ? (
        <WorkLog sessions={sessions} active={session} now={now} />
      ) : session ? (
        <>
          <p className="work-task" title={session.task}>
            {session.task}
          </p>
          <p className="work-timer" aria-live="off">
            {formatClock(now - session.startedAt)}
          </p>
          <p className="buddy-panel__hint">
            Started at {formatTimeOfDay(session.startedAt)}. I keep counting
            until you stop.
          </p>

          {error && <p className="buddy-panel__error">{error}</p>}

          <div className="buddy-panel__row">
            <button
              className="btn btn--primary"
              type="button"
              onClick={onStop}
            >
              Stop &amp; save
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => setView("log")}
            >
              Work log
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="buddy-panel__hint">
            Tell me what you're working on. I'll time it and keep the log.
          </p>
          <form
            className="buddy-panel__form"
            onSubmit={(event) => {
              event.preventDefault();
              start();
            }}
          >
            <input
              className="field__input"
              autoFocus
              aria-label="What are you working on?"
              placeholder="e.g. finish the report"
              maxLength={80}
              autoComplete="off"
              value={task}
              onChange={(event) => setTask(event.target.value)}
            />
            {(emptyError || error) && (
              <p className="buddy-panel__error">{emptyError || error}</p>
            )}
            <button className="btn btn--primary btn--block" type="submit">
              Start focus
            </button>
          </form>
          <button
            className="btn btn--ghost btn--block"
            type="button"
            onClick={() => setView("log")}
          >
            Work log{finishedCount > 0 ? ` (${finishedCount})` : ""}
          </button>
        </>
      )}
    </div>
  );
}

function WorkLog({
  sessions,
  active,
  now,
}: {
  sessions: WorkSession[];
  active: WorkSession | null;
  now: number;
}) {
  const finished = sessions.filter(
    (session): session is WorkSession & { endedAt: number } =>
      session.endedAt !== undefined,
  );
  const recent = [...finished].sort((a, b) => b.endedAt - a.endedAt);
  const nowKey = todayKey();
  const todayTotal = finished
    .filter((session) => todayKey(new Date(session.startedAt)) === nowKey)
    .reduce((total, session) => total + (session.endedAt - session.startedAt), 0);
  const allTimeTotal = finished.reduce(
    (total, session) => total + (session.endedAt - session.startedAt),
    0,
  );

  const byTask = new Map<string, { task: string; total: number }>();
  for (const session of finished) {
    const current = byTask.get(session.task);
    byTask.set(session.task, {
      task: session.task,
      total: (current?.total ?? 0) + (session.endedAt - session.startedAt),
    });
  }
  const taskTotals = [...byTask.values()].sort((a, b) => b.total - a.total);

  return (
    <div className="work-log">
      {active && (
        <p className="work-log__live">
          Counting now · {active.task} ·{" "}
          {formatClock(now - active.startedAt)}
        </p>
      )}

      {finished.length === 0 ? (
        <p className="buddy-panel__hint">
          No sessions logged yet. Start a task and I'll remember the work.
        </p>
      ) : (
        <>
          <p className="work-log__summary">
            Today {formatDuration(todayTotal)} · all time{" "}
            {formatDuration(allTimeTotal)}
          </p>

          <div className="work-log__section">
            <p className="work-log__label">By task</p>
            <div className="work-log__list">
              {taskTotals.map((item) => (
                <div className="work-log__row" key={item.task}>
                  <span className="work-log__name" title={item.task}>
                    {item.task}
                  </span>
                  <span className="work-log__time">
                    {formatDuration(item.total)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="work-log__section">
            <p className="work-log__label">Recent sessions</p>
            <div className="work-log__list">
              {recent.map((session) => (
                <div className="work-log__row" key={session.id}>
                  <span className="work-log__name" title={session.task}>
                    {session.task}
                    <small>{formatWhen(session.startedAt)}</small>
                  </span>
                  <span className="work-log__time">
                    {formatDuration(session.endedAt - session.startedAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function formatWhen(ts: number) {
  const date = new Date(ts);
  const time = formatTimeOfDay(ts);
  if (todayKey(date) === todayKey()) return `today ${time}`;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (todayKey(date) === todayKey(yesterday)) return `yesterday ${time}`;
  return `${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} ${time}`;
}
