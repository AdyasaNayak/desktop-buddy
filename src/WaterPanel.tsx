import { useState } from "react";
import type { WaterPlan } from "./db";
import { formatInterval } from "./time";

const GOAL_OPTIONS = [4, 6, 8, 10, 12];
const INTERVAL_OPTIONS = [30, 45, 60, 90, 120];

/**
 * First-run water setup and the settings screen for an existing plan. The
 * window is only 360×260, so the panel stays compact and scrolls if needed.
 */
export function WaterPanel({
  plan,
  todayGlasses,
  error,
  onSave,
  onLogGlass,
  onClose,
}: {
  plan: WaterPlan | null;
  todayGlasses: number;
  error: string;
  onSave: (
    glassesPerDay: number,
    intervalMinutes: number,
    enabled: boolean,
  ) => void;
  onLogGlass: () => void;
  onClose: () => void;
}) {
  const [goal, setGoal] = useState(plan?.glassesPerDay ?? 8);
  const [intervalMinutes, setIntervalMinutes] = useState(
    plan?.intervalMinutes ?? 60,
  );
  const showProgress = plan !== null || todayGlasses > 0;
  const progress = Math.min(100, (todayGlasses / Math.max(1, goal)) * 100);

  return (
    <div
      className="buddy-panel buddy-panel--water"
      role="dialog"
      aria-modal="true"
      aria-labelledby="water-dialog-title"
    >
      <div className="buddy-panel__head">
        <h2 id="water-dialog-title" className="buddy-panel__title">
          Water breaks
        </h2>
        <button
          type="button"
          className="buddy-panel__close"
          onClick={onClose}
          aria-label="Close water breaks"
        >
          ×
        </button>
      </div>

      <form
        className="buddy-panel__form"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(goal, intervalMinutes, true);
        }}
      >
        <p className="buddy-panel__hint">
          How much, and how often should I nudge you?
        </p>

        <div className="buddy-panel__fields">
          <label className="field">
            <span className="field__label">Daily goal</span>
            <select
              className="field__input"
              value={goal}
              onChange={(event) => setGoal(Number(event.target.value))}
            >
              {GOAL_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value} glasses
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field__label">Remind me every</span>
            <select
              className="field__input"
              value={intervalMinutes}
              onChange={(event) =>
                setIntervalMinutes(Number(event.target.value))
              }
            >
              {INTERVAL_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  every {formatInterval(value)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {showProgress && (
          <div className="water-progress">
            <div className="water-progress__row">
              <span className="water-progress__count">
                Today <strong>{todayGlasses}/{goal}</strong> glasses
              </span>
              <button
                type="button"
                className="btn btn--compact"
                onClick={onLogGlass}
              >
                I drank one
              </button>
            </div>
            <div
              className="water-progress__track"
              role="progressbar"
              aria-label="Glasses of water today"
              aria-valuemin={0}
              aria-valuemax={goal}
              aria-valuenow={Math.min(todayGlasses, goal)}
            >
              <span
                className="water-progress__fill"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {error && <p className="buddy-panel__error">{error}</p>}

        <div className="buddy-panel__row">
          <button className="btn btn--primary" type="submit">
            {plan?.enabled ? "Save changes" : "Start reminders"}
          </button>
          {plan?.enabled && (
            <button
              className="btn"
              type="button"
              onClick={() => onSave(goal, intervalMinutes, false)}
            >
              Pause
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
