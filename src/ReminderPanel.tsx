import { useState, type FormEvent } from "react";
import type { Reminder, ReminderRepeat } from "./db";
import {
  MAX_REMINDER_AHEAD_MS,
  MAX_REMINDER_TEXT_LENGTH,
  REMINDER_REPEAT_OPTIONS,
  reminderDraftError,
  reminderRepeatLabel,
  sortRemindersForList,
  toReminderRepeat,
  type ReminderDraft,
} from "./reminders";
import { formatWhen } from "./time";
import { usePendingAction } from "./usePendingAction";

export function ReminderPanel({
  reminders,
  onSave,
  onDelete,
  onSnooze,
  onClearFired,
  onClose,
}: {
  reminders: Reminder[];
  onSave: (draft: ReminderDraft, id?: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onSnooze: (reminder: Reminder) => Promise<void>;
  onClearFired: () => Promise<void>;
  onClose: () => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [at, setAt] = useState("");
  const [repeat, setRepeat] = useState<ReminderRepeat>("none");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [bounds, setBounds] = useState(reminderDateBounds);
  const saveAction = usePendingAction();
  const rowAction = usePendingAction();
  const busy = saveAction.pending || rowAction.pending;
  const firedCount = reminders.filter((reminder) => reminder.notified).length;

  const refreshBounds = () => setBounds(reminderDateBounds());

  const resetForm = () => {
    setEditingId(null);
    setText("");
    setAt("");
    setRepeat("none");
    setError("");
    setNote("");
    refreshBounds();
  };

  const startEdit = (reminder: Reminder) => {
    if (reminder.id === undefined) return;
    setEditingId(reminder.id);
    setText(reminder.text);
    setAt(toDateTimeLocalValue(new Date(reminder.remindAt)));
    setRepeat(toReminderRepeat(reminder.repeat));
    setError("");
    setNote("");
    refreshBounds();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const draft: ReminderDraft = {
      text,
      remindAt: new Date(at).getTime(),
      repeat,
    };
    const problem = reminderDraftError(draft, Date.now());
    if (problem) {
      setError(problem);
      return;
    }

    const submittedId = editingId;
    void saveAction.run(async () => {
      setError("");
      setNote("");
      try {
        await onSave(draft, submittedId ?? undefined);
        if (submittedId === null) {
          onClose();
          return;
        }
        resetForm();
        setNote("Reminder updated.");
      } catch (caught) {
        setError(errorMessage("Could not save reminder", caught));
      }
    });
  };

  const snooze = (reminder: Reminder) => {
    void rowAction.run(async () => {
      setError("");
      setNote("");
      try {
        await onSnooze(reminder);
        setNote("Snoozed for 10 minutes.");
      } catch (caught) {
        setError(errorMessage("Could not snooze reminder", caught));
      }
    });
  };

  const remove = (reminder: Reminder) => {
    if (reminder.id === undefined) return;
    void rowAction.run(async () => {
      setError("");
      setNote("");
      try {
        await onDelete(reminder.id!);
        if (editingId === reminder.id) resetForm();
      } catch (caught) {
        setError(errorMessage("Could not delete reminder", caught));
      }
    });
  };

  const clearFired = () => {
    void rowAction.run(async () => {
      setError("");
      setNote("");
      try {
        await onClearFired();
      } catch (caught) {
        setError(errorMessage("Could not clear fired reminders", caught));
      }
    });
  };

  return (
    <div className="buddy-dialog">
      <div
        className="buddy-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reminder-dialog-title"
      >
        <h2 id="reminder-dialog-title" className="buddy-panel__title">
          {editingId === null ? "New reminder" : "Edit reminder"}
        </h2>
        <form className="buddy-panel__form" onSubmit={submit}>
          <input
            className="field__input"
            autoFocus
            aria-label="Reminder text"
            placeholder="Remind me to…"
            maxLength={MAX_REMINDER_TEXT_LENGTH}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <input
            className="field__input"
            type="datetime-local"
            aria-label="Reminder time"
            min={bounds.min}
            max={bounds.max}
            value={at}
            onFocus={refreshBounds}
            onChange={(event) => setAt(event.target.value)}
          />
          <label className="field">
            <span className="field__label">Repeat</span>
            <select
              className="field__input"
              aria-label="Repeat reminder"
              value={repeat}
              onChange={(event) =>
                setRepeat(toReminderRepeat(event.target.value))
              }
            >
              {REMINDER_REPEAT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <p className="buddy-panel__hint">
            Reminders only fire while Desktop Buddy is running. Repeating
            reminders schedule their next run automatically. If I&apos;m
            closed, missed ones arrive together next time you open me.
          </p>
          {error && (
            <p className="buddy-panel__error" role="alert">
              {error}
            </p>
          )}
          {note && <p className="buddy-panel__note">{note}</p>}
          <div className="buddy-panel__row">
            <button
              className="btn btn--primary"
              type="submit"
              disabled={busy}
            >
              {editingId === null
                ? saveAction.pending
                  ? "Adding…"
                  : "Add reminder"
                : saveAction.pending
                  ? "Saving…"
                  : "Save changes"}
            </button>
            {editingId === null ? (
              <button
                className="btn"
                type="button"
                disabled={busy}
                onClick={onClose}
              >
                Cancel
              </button>
            ) : (
              <button
                className="btn"
                type="button"
                disabled={busy}
                onClick={resetForm}
              >
                Cancel edit
              </button>
            )}
          </div>
        </form>
        {reminders.length > 0 && (
          <div className="reminder-list">
            {sortRemindersForList(reminders).map((reminder) => {
              const repeats = reminderRepeatLabel(reminder.repeat);
              return (
                <div
                  key={reminder.id}
                  className={`reminder-row${reminder.notified ? " reminder-row--fired" : ""}`}
                >
                  <span className="reminder-row__body">
                    <span className="reminder-row__text" title={reminder.text}>
                      {reminder.text}
                    </span>
                    <span className="reminder-row__meta">
                      {reminder.notified ? "fired" : "scheduled"}{" "}
                      {formatWhen(reminder.remindAt)}
                      {repeats ? ` · ${repeats}` : ""}
                    </span>
                  </span>
                  <span className="reminder-row__actions">
                    {reminder.notified ? (
                      <button
                        type="button"
                        className="reminder-row__action"
                        aria-label={`Snooze reminder for 10 minutes: ${reminder.text}`}
                        disabled={busy}
                        onClick={() => snooze(reminder)}
                      >
                        Snooze 10m
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="reminder-row__action"
                        title="Edit text, time, or repeat"
                        aria-label={`Edit reminder: ${reminder.text}`}
                        disabled={busy}
                        onClick={() => startEdit(reminder)}
                      >
                        Edit
                      </button>
                    )}
                    <button
                      type="button"
                      className="reminder-row__delete"
                      aria-label={`Delete reminder: ${reminder.text}`}
                      disabled={busy}
                      onClick={() => remove(reminder)}
                    >
                      ×
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {firedCount > 0 && (
          <button
            className="btn btn--ghost reminder-list__clear"
            type="button"
            disabled={busy}
            onClick={clearFired}
          >
            Clear fired reminders
          </button>
        )}
      </div>
    </div>
  );
}

function errorMessage(prefix: string, error: unknown): string {
  return `${prefix}: ${error instanceof Error ? error.message : String(error)}`;
}

function reminderDateBounds() {
  const now = Date.now();
  return {
    min: toDateTimeLocalValue(new Date(now + 60_000)),
    max: toDateTimeLocalValue(new Date(now + MAX_REMINDER_AHEAD_MS)),
  };
}

function toDateTimeLocalValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join("T");
}
