import { useState } from "react";

const SLEEP_OPTIONS = [
  { minutes: 5, label: "5 minutes" },
  { minutes: 15, label: "15 minutes" },
  { minutes: 30, label: "30 minutes" },
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
];

/** Asks how long the buddy should nap before it hides itself. */
export function SleepDialog({
  onSleep,
  onCancel,
}: {
  onSleep: (durationMs: number) => void;
  onCancel: () => void;
}) {
  const [minutes, setMinutes] = useState("15");

  return (
    <div className="buddy-dialog">
      <div
        className="buddy-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sleep-dialog-title"
      >
        <h2 id="sleep-dialog-title" className="buddy-panel__title">
          Put buddy to sleep
        </h2>
        <label className="field">
          <span className="field__label">Wake after</span>
          <select
            className="field__input"
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
          >
            {SLEEP_OPTIONS.map((option) => (
              <option key={option.minutes} value={option.minutes}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="buddy-panel__row">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => onSleep(Number(minutes) * 60 * 1000)}
          >
            Sleep
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
