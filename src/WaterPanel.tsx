import { useEffect, useState, type FormEvent } from "react";
import type { WaterPlan } from "./db";
import { formatDuration, formatInterval } from "./time";
import { usePendingAction } from "./usePendingAction";
import {
  AMOUNT_OPTIONS,
  INTERVAL_OPTIONS,
  amountLabel,
  withSavedOption,
} from "./waterOptions";

function nextBreakLabel(nextReminderAt: number, now: number): string {
  const wait = Math.max(0, nextReminderAt - now);
  if (wait < 60_000) return "a nudge is due now";
  return `next nudge in about ${formatDuration(wait)}`;
}

/**
 * The wait shrinks while the panel sits open, so this line keeps its own
 * clock instead of relying on the rest of the panel to re-render.
 */
function NextNudge({ nextReminderAt }: { nextReminderAt: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <p className="water-status__next">
      {nextBreakLabel(nextReminderAt, now)}
    </p>
  );
}

export function WaterPanel({
  plan,
  todayMl,
  onSave,
  onStop,
  onDrink,
  onPreview,
  onClose,
}: {
  plan: WaterPlan | null;
  todayMl: number;
  onSave: (amountMl: number, intervalMinutes: number) => Promise<void>;
  onStop: () => Promise<void>;
  onDrink: () => Promise<number>;
  onPreview: () => void;
  onClose: () => void;
}) {
  const [amountMl, setAmountMl] = useState(plan?.amountMl ?? 250);
  const [intervalMinutes, setIntervalMinutes] = useState(
    plan?.intervalMinutes ?? 60,
  );
  const [editing, setEditing] = useState(!plan?.enabled);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const { pending, run: runPending } = usePendingAction();
  const enabled = Boolean(plan?.enabled);
  const amountOptions = withSavedOption(
    AMOUNT_OPTIONS,
    plan?.amountMl,
    amountLabel,
  );
  const intervalOptions = withSavedOption(
    INTERVAL_OPTIONS,
    plan?.intervalMinutes,
    formatInterval,
  );

  const run = (action: () => Promise<void>) =>
    runPending(async () => {
      setError("");
      try {
        await action();
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : String(caught);
        setError(`Could not save that: ${message}`);
      }
    });

  const save = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await onSave(amountMl, intervalMinutes);
      onClose();
    });
  };

  const drink = () => {
    void run(async () => {
      const total = await onDrink();
      setNote(`logged! ${total} ml today.`);
    });
  };

  const stop = () => {
    void run(async () => {
      await onStop();
      onClose();
    });
  };

  return (
    <div className="buddy-dialog">
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
            className="buddy-close buddy-panel__close"
            aria-label="Close water panel"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {enabled && !editing && plan ? (
          <>
            <div className="water-status">
              <p className="water-status__total">
                <strong>{todayMl} ml</strong> today
              </p>
              <NextNudge nextReminderAt={plan.nextReminderAt} />
            </div>

            {note && <p className="buddy-panel__note">{note}</p>}
            {error && <p className="buddy-panel__error">{error}</p>}

            <div className="buddy-panel__row">
              <button
                className="btn"
                type="button"
                disabled={pending}
                onClick={drink}
              >
                I drank {plan.amountMl} ml
              </button>
              <button
                className="btn"
                type="button"
                disabled={pending}
                onClick={() => {
                  onPreview();
                  onClose();
                }}
              >
                Show a nudge
              </button>
            </div>
            <div className="buddy-panel__row">
              <button
                className="btn btn--ghost"
                type="button"
                onClick={() => setEditing(true)}
              >
                Edit schedule
              </button>
              <button
                className="btn btn--ghost"
                type="button"
                disabled={pending}
                onClick={stop}
              >
                Stop reminders
              </button>
            </div>
          </>
        ) : (
          <form className="buddy-panel__form" onSubmit={save}>
            <label className="field">
              <span className="field__label">Each water break</span>
              <select
                className="field__input"
                value={amountMl}
                onChange={(event) => setAmountMl(Number(event.target.value))}
              >
                {amountOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
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
                {intervalOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {error && <p className="buddy-panel__error">{error}</p>}

            <div className="buddy-panel__row">
              <button
                className="btn btn--primary"
                type="submit"
                disabled={pending}
              >
                {enabled ? "Save schedule" : "Start reminders"}
              </button>
              {enabled && (
                <button
                  className="btn"
                  type="button"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
