import { useState, type FormEvent } from "react";
import type { WorkSession } from "./db";
import { toDateTimeLocalValue } from "./reminders";
import { formatClock, formatDuration, formatWhen } from "./time";
import type { ActiveWork, TaskTotal } from "./useWorkLog";
import { usePendingAction } from "./usePendingAction";
import {
  LONG_SESSION_REMINDER_MS,
  MAX_SESSION_DURATION_MS,
  MAX_WORK_TASK_LENGTH,
  workSessionEditError,
  type WorkSessionEdit,
} from "./workSessions";

export function WorkPanel({
  active,
  elapsedMs,
  totals,
  recent,
  onStart,
  onStop,
  onPause,
  onResume,
  onEdit,
  onDelete,
  onExport,
  onClose,
}: {
  active: ActiveWork | null;
  elapsedMs: number;
  totals: TaskTotal[];
  recent: WorkSession[];
  onStart: (task: string) => Promise<void>;
  onStop: () => Promise<number>;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onEdit: (id: number, edit: WorkSessionEdit) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onExport: () => string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"timer" | "log">("timer");
  const [task, setTask] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTask, setEditTask] = useState("");
  const [editStartedAt, setEditStartedAt] = useState("");
  const [editMinutes, setEditMinutes] = useState("");
  const timerAction = usePendingAction();
  const rowAction = usePendingAction();
  const busy = timerAction.pending || rowAction.pending;

  const runTimer = (action: () => Promise<void>) =>
    timerAction.run(async () => {
      setError("");
      try {
        await action();
      } catch (caught) {
        setError(errorMessage(caught));
      }
    });

  const runRow = (action: () => Promise<void>) =>
    rowAction.run(async () => {
      setError("");
      try {
        await action();
      } catch (caught) {
        setError(errorMessage(caught));
      }
    });

  const start = (event: FormEvent) => {
    event.preventDefault();
    void runTimer(async () => {
      if (!task.trim()) throw new Error("Tell me what you're working on first.");
      await onStart(task);
      onClose();
    });
  };

  const stop = () => {
    void runTimer(async () => {
      const stoppedTask = active?.task;
      const duration = await onStop();
      if (stoppedTask) {
        setNote(`saved! ${formatDuration(duration)} on ${stoppedTask}.`);
      }
    });
  };

  const togglePause = () => {
    void runTimer(async () => {
      if (active?.pausedAt !== undefined) {
        await onResume();
      } else {
        await onPause();
      }
    });
  };

  const startEdit = (session: WorkSession) => {
    if (session.id === undefined) return;
    setEditingId(session.id);
    setEditTask(session.task);
    setEditStartedAt(toDateTimeLocalValue(new Date(session.startedAt)));
    setEditMinutes(String(Math.max(1, Math.round(session.durationMs / 60_000))));
    setError("");
    setNote("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setError("");
  };

  const saveEdit = (event: FormEvent) => {
    event.preventDefault();
    if (editingId === null) return;
    const edit: WorkSessionEdit = {
      task: editTask,
      startedAt: new Date(editStartedAt).getTime(),
      durationMs: Number(editMinutes) * 60_000,
    };
    const problem = workSessionEditError(edit);
    if (problem) {
      setError(problem);
      return;
    }

    const id = editingId;
    void runRow(async () => {
      await onEdit(id, edit);
      setEditingId(null);
      setNote("session updated.");
    });
  };

  const remove = (session: WorkSession) => {
    if (session.id === undefined) return;
    void runRow(async () => {
      await onDelete(session.id!);
      if (editingId === session.id) setEditingId(null);
      setNote(`deleted ${session.task}.`);
    });
  };

  const exportLog = () => {
    setError("");
    setNote("");
    try {
      const csv = onExport();
      const url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `desktop-buddy-work-log-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNote("work log exported as CSV.");
    } catch (caught) {
      setError(`Could not export work log: ${errorMessage(caught)}`);
    }
  };

  const totalsByTask = new Map(
    totals.map((entry) => [entry.task.toLocaleLowerCase(), entry]),
  );
  const pausedAt = active?.pausedAt;
  const paused = pausedAt !== undefined;
  const longSession = active !== null && elapsedMs >= LONG_SESSION_REMINDER_MS;

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
            className="buddy-close buddy-panel__close"
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
              <div
                className={`work-active${paused ? " work-active--paused" : ""}`}
              >
                <p className="work-active__task">{active.task}</p>
                <p className="work-active__clock">{formatClock(elapsedMs)}</p>
                <p className="work-active__since">
                  {pausedAt !== undefined
                    ? `paused ${formatWhen(pausedAt)} · time is frozen`
                    : `started ${formatWhen(active.startedAt)} · still counting`}
                </p>
                {!paused && (active.pausedMs ?? 0) > 0 && (
                  <p className="work-active__since">
                    paused time isn&apos;t counted
                  </p>
                )}
                {longSession && (
                  <p className="work-active__long">
                    long session · a short break might help
                  </p>
                )}
              </div>
              {error && <p className="buddy-panel__error">{error}</p>}
              <div className="buddy-panel__row">
                <button
                  className="btn btn--primary"
                  type="button"
                  disabled={busy}
                  onClick={togglePause}
                >
                  {paused ? "Resume timer" : "Pause timer"}
                </button>
                <button
                  className="btn"
                  type="button"
                  disabled={busy}
                  onClick={stop}
                >
                  Stop &amp; save
                </button>
              </div>
            </>
          ) : (
            <form className="buddy-panel__form" onSubmit={start}>
              <label className="field">
                <span className="field__label">What are you working on?</span>
                <input
                  className="field__input"
                  autoFocus
                  maxLength={MAX_WORK_TASK_LENGTH}
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
                disabled={busy}
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
            <div className="work-log__head">
              <h3 className="work-log__title">Work log</h3>
              <button
                type="button"
                className="btn btn--ghost work-log__export"
                disabled={busy || recent.length === 0}
                onClick={exportLog}
              >
                Export CSV
              </button>
            </div>
            <div className="work-list">
              {recent.map((session) => {
                const total = totalsByTask.get(
                  session.task.toLocaleLowerCase(),
                );
                if (session.id === editingId) {
                  return (
                    <form
                      className="work-edit"
                      key={session.id}
                      onSubmit={saveEdit}
                    >
                      <label className="field">
                        <span className="field__label">Task</span>
                        <input
                          className="field__input"
                          autoFocus
                          maxLength={MAX_WORK_TASK_LENGTH}
                          value={editTask}
                          onChange={(event) => setEditTask(event.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span className="field__label">Started</span>
                        <input
                          className="field__input"
                          type="datetime-local"
                          value={editStartedAt}
                          onChange={(event) =>
                            setEditStartedAt(event.target.value)
                          }
                        />
                      </label>
                      <label className="field">
                        <span className="field__label">Minutes worked</span>
                        <input
                          className="field__input"
                          type="number"
                          min="1"
                          max={MAX_SESSION_DURATION_MS / 60_000}
                          step="1"
                          value={editMinutes}
                          onChange={(event) =>
                            setEditMinutes(event.target.value)
                          }
                        />
                      </label>
                      <div className="buddy-panel__row">
                        <button
                          className="btn btn--primary"
                          type="submit"
                          disabled={busy}
                        >
                          Save
                        </button>
                        <button
                          className="btn"
                          type="button"
                          disabled={busy}
                          onClick={cancelEdit}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  );
                }
                return (
                  <div className="work-row" key={session.id}>
                    <span className="work-row__task" title={session.task}>
                      {session.task}
                    </span>
                    <span className="work-row__time">
                      {formatDuration(session.durationMs)}
                    </span>
                    <span className="work-row__actions">
                      <button
                        type="button"
                        className="work-row__action"
                        title="Edit task, start, or minutes"
                        aria-label={`Edit session: ${session.task}`}
                        disabled={busy}
                        onClick={() => startEdit(session)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="work-row__delete"
                        aria-label={`Delete session: ${session.task}`}
                        disabled={busy}
                        onClick={() => remove(session)}
                      >
                        ×
                      </button>
                    </span>
                    <span className="work-row__meta">
                      {total ? `${formatDuration(total.totalMs)} total · ` : ""}
                      {formatWhen(session.startedAt)}
                    </span>
                  </div>
                );
              })}
            </div>
            {error && (
              <p className="buddy-panel__error" role="alert">
                {error}
              </p>
            )}
            {note && <p className="buddy-panel__note">{note}</p>}
          </>
        )}
      </div>
    </div>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
