import { useState, type FormEvent } from "react";
import type { WorkSession } from "./db";
import { formatClock, formatDuration, formatWhen } from "./time";
import type { ActiveWork, TaskTotal } from "./useWorkLog";
import { usePendingAction } from "./usePendingAction";

export function WorkPanel({
  active,
  elapsedMs,
  totals,
  recent,
  onStart,
  onStop,
  onClose,
}: {
  active: ActiveWork | null;
  elapsedMs: number;
  totals: TaskTotal[];
  recent: WorkSession[];
  onStart: (task: string) => Promise<void>;
  onStop: () => Promise<number>;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"timer" | "log">("timer");
  const [task, setTask] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const { pending, run: runPending } = usePendingAction();

  const run = (action: () => Promise<void>) =>
    runPending(async () => {
      setError("");
      try {
        await action();
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : String(caught);
        setError(message);
      }
    });

  const start = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      if (!task.trim()) throw new Error("Tell me what you're working on first.");
      await onStart(task);
      onClose();
    });
  };

  const stop = () => {
    void run(async () => {
      const stoppedTask = active?.task;
      const duration = await onStop();
      if (stoppedTask) {
        setNote(`saved! ${formatDuration(duration)} on ${stoppedTask}.`);
      }
    });
  };

  const totalsByTask = new Map(
    totals.map((entry) => [entry.task.toLocaleLowerCase(), entry]),
  );

  return (
    <div className="buddy-dialog">
      <div
        className="buddy-panel buddy-panel--work"
        role="dialog"
        aria-modal="true"
        aria-labelledby="work-dialog-title"
      >
        <div className="buddy-panel__head">
          <h2 id="work-dialog-title" className="buddy-panel__title">
            Work mode
          </h2>
          <button
            type="button"
            className="buddy-panel__close"
            aria-label="Close work panel"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="buddy-tabs">
          <button
            type="button"
            className="buddy-tab"
            aria-pressed={tab === "timer"}
            onClick={() => setTab("timer")}
          >
            Timer
          </button>
          <button
            type="button"
            className="buddy-tab"
            aria-pressed={tab === "log"}
            onClick={() => {
              setTab("log");
              setNote("");
            }}
          >
            Log
          </button>
        </div>

        {tab === "timer" ? (
          active ? (
            <>
              <div className="work-active">
                <p className="work-active__task">{active.task}</p>
                <p className="work-active__clock">{formatClock(elapsedMs)}</p>
                <p className="work-active__since">
                  started {formatWhen(active.startedAt)} · still counting
                </p>
                {active.pausedMs > 0 && (
                  <p className="work-active__since">
                    resumed after a restart · time while I was closed isn&apos;t
                    counted
                  </p>
                )}
              </div>
              {error && <p className="buddy-panel__error">{error}</p>}
              <button
                className="btn btn--primary btn--block"
                type="button"
                disabled={pending}
                onClick={stop}
              >
                Stop &amp; save
              </button>
            </>
          ) : (
            <form className="buddy-panel__form" onSubmit={start}>
              <label className="field">
                <span className="field__label">What are you working on?</span>
                <input
                  className="field__input"
                  autoFocus
                  maxLength={60}
                  autoComplete="off"
                  placeholder="e.g. finish the report"
                  value={task}
                  onChange={(event) => setTask(event.target.value)}
                />
              </label>
              {note && <p className="buddy-panel__note">{note}</p>}
              {error && <p className="buddy-panel__error">{error}</p>}
              <button
                className="btn btn--primary btn--block"
                type="submit"
                disabled={pending}
              >
                Start timer
              </button>
            </form>
          )
        ) : totals.length === 0 ? (
          <p className="buddy-panel__hint">
            Nothing logged yet. Start a timer and I will keep track of where
            your hours go.
          </p>
        ) : (
          <>
            <h3 className="work-log__title">Work log</h3>
            <div className="work-list">
              {recent.map((session) => {
                const total = totalsByTask.get(
                  session.task.toLocaleLowerCase(),
                );
                return (
                  <div className="work-row" key={session.id}>
                    <span className="work-row__task" title={session.task}>
                      {session.task}
                    </span>
                    <span className="work-row__time">
                      {formatDuration(session.durationMs)}
                    </span>
                    <span className="work-row__meta">
                      {total ? `${formatDuration(total.totalMs)} total · ` : ""}
                      {formatWhen(session.startedAt)}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
