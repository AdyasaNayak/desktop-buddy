import { useEffect, useState, type FormEvent } from "react";
import type { WaterEntry, WaterPlan } from "./db";
import { formatDuration, formatInterval, formatWhen } from "./time";
import {
  groupWaterHistory,
  waterHistoryDayLabel,
} from "./waterHistory";
import { usePendingAction } from "./usePendingAction";
import {
  AMOUNT_OPTIONS,
  DEFAULT_AMOUNT_ML,
  DEFAULT_INTERVAL_MINUTES,
  DEFAULT_QUIET_END_MINUTES,
  DEFAULT_QUIET_START_MINUTES,
  INTERVAL_OPTIONS,
  MAX_AMOUNT_ML,
  MAX_DAILY_GOAL_ML,
  MAX_INTERVAL_MINUTES,
  MIN_AMOUNT_ML,
  MIN_DAILY_GOAL_ML,
  MIN_INTERVAL_MINUTES,
  amountLabel,
  minutesToTimeValue,
  planDailyGoalMl,
  planQuietHours,
  timeValueToMinutes,
  waterGoalProgress,
  waterSettingsError,
  withSavedOption,
  type QuietHours,
  type WaterSettings,
} from "./waterOptions";
import { isWithinQuietHours } from "./waterSchedule";

const CUSTOM_CHOICE = "custom";

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

function initialChoice(
  value: number,
  presets: readonly { value: number }[],
): string {
  return presets.some((option) => option.value === value)
    ? String(value)
    : CUSTOM_CHOICE;
}

function timeOfDayLabel(minutes: number): string {
  const date = new Date();
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function QuietHoursStatus({
  plan,
  quiet,
}: {
  plan: WaterPlan;
  quiet: QuietHours;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <span className="water-goal__quiet">
      quiet hours {timeOfDayLabel(quiet.startMinutes)}–
      {timeOfDayLabel(quiet.endMinutes)}
      {isWithinQuietHours(plan, now) ? " · paused now" : ""}
    </span>
  );
}

export function WaterPanel({
  plan,
  todayMl,
  history,
  onSave,
  onStop,
  onDrink,
  onUndo,
  onPreview,
  onClose,
}: {
  plan: WaterPlan | null;
  todayMl: number;
  history: WaterEntry[];
  onSave: (settings: WaterSettings) => Promise<void>;
  onStop: () => Promise<void>;
  onDrink: () => Promise<number>;
  onUndo: (entryId?: number) => Promise<number>;
  onPreview: () => void;
  onClose: () => void;
}) {
  const savedAmount = plan?.amountMl ?? DEFAULT_AMOUNT_ML;
  const savedInterval = plan?.intervalMinutes ?? DEFAULT_INTERVAL_MINUTES;
  const savedGoal = planDailyGoalMl(plan);
  const savedQuiet = planQuietHours(plan);
  const [amountChoice, setAmountChoice] = useState(() =>
    initialChoice(savedAmount, AMOUNT_OPTIONS),
  );
  const [customAmount, setCustomAmount] = useState(String(savedAmount));
  const [intervalChoice, setIntervalChoice] = useState(() =>
    initialChoice(savedInterval, INTERVAL_OPTIONS),
  );
  const [customInterval, setCustomInterval] = useState(String(savedInterval));
  const [dailyGoal, setDailyGoal] = useState(String(savedGoal));
  const [quietEnabled, setQuietEnabled] = useState(savedQuiet.enabled);
  const [quietStart, setQuietStart] = useState(
    minutesToTimeValue(savedQuiet.startMinutes),
  );
  const [quietEnd, setQuietEnd] = useState(
    minutesToTimeValue(savedQuiet.endMinutes),
  );
  const [tab, setTab] = useState<"today" | "history">("today");
  const [editing, setEditing] = useState(!plan);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const { pending, run: runPending } = usePendingAction();
  const enabled = Boolean(plan?.enabled);
  const goalMl = planDailyGoalMl(plan);
  const quiet = planQuietHours(plan);
  const progress = waterGoalProgress(todayMl, goalMl);
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
  const historyDays = groupWaterHistory(history);
  const latestEntry = history[0];

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

  const amountMl =
    amountChoice === CUSTOM_CHOICE
      ? Number(customAmount)
      : Number(amountChoice);
  const intervalMinutes =
    intervalChoice === CUSTOM_CHOICE
      ? Number(customInterval)
      : Number(intervalChoice);

  const chooseAmount = (choice: string) => {
    setAmountChoice(choice);
    if (choice === CUSTOM_CHOICE) {
      setCustomAmount(
        String(Number.isFinite(amountMl) ? amountMl : savedAmount),
      );
    }
  };

  const chooseInterval = (choice: string) => {
    setIntervalChoice(choice);
    if (choice === CUSTOM_CHOICE) {
      setCustomInterval(
        String(
          Number.isFinite(intervalMinutes) ? intervalMinutes : savedInterval,
        ),
      );
    }
  };

  const resetForm = () => {
    const amount = plan?.amountMl ?? DEFAULT_AMOUNT_ML;
    const interval = plan?.intervalMinutes ?? DEFAULT_INTERVAL_MINUTES;
    const goal = planDailyGoalMl(plan);
    const saved = planQuietHours(plan);
    setAmountChoice(initialChoice(amount, AMOUNT_OPTIONS));
    setCustomAmount(String(amount));
    setIntervalChoice(initialChoice(interval, INTERVAL_OPTIONS));
    setCustomInterval(String(interval));
    setDailyGoal(String(goal));
    setQuietEnabled(saved.enabled);
    setQuietStart(minutesToTimeValue(saved.startMinutes));
    setQuietEnd(minutesToTimeValue(saved.endMinutes));
    setError("");
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    const startMinutes = timeValueToMinutes(quietStart);
    const endMinutes = timeValueToMinutes(quietEnd);
    if (quietEnabled && (startMinutes === null || endMinutes === null)) {
      setError("Choose a start and end time for quiet hours.");
      return;
    }

    const settings: WaterSettings = {
      amountMl,
      intervalMinutes,
      dailyGoalMl: Number(dailyGoal),
      quietHours: {
        enabled: quietEnabled,
        startMinutes: startMinutes ?? DEFAULT_QUIET_START_MINUTES,
        endMinutes: endMinutes ?? DEFAULT_QUIET_END_MINUTES,
      },
    };
    const problem = waterSettingsError(settings);
    if (problem) {
      setError(problem);
      return;
    }

    void run(async () => {
      await onSave(settings);
      onClose();
    });
  };

  const drink = () => {
    void run(async () => {
      const total = await onDrink();
      const goal = planDailyGoalMl(plan);
      setNote(
        total >= goal
          ? `logged! ${total} ml today. daily goal reached!`
          : `logged! ${total} ml today.`,
      );
    });
  };

  const undo = (entryId?: number) => {
    void run(async () => {
      const total = await onUndo(entryId);
      setNote(`removed that glass. ${total} ml today.`);
    });
  };

  const stop = () => {
    void run(async () => {
      await onStop();
      onClose();
    });
  };

  const start = () => {
    if (!plan) return;
    const settings: WaterSettings = {
      amountMl: plan.amountMl,
      intervalMinutes: plan.intervalMinutes,
      dailyGoalMl: planDailyGoalMl(plan),
      quietHours: planQuietHours(plan),
    };
    const problem = waterSettingsError(settings);
    if (problem) {
      setError(problem);
      return;
    }
    void run(async () => {
      await onSave(settings);
      onClose();
    });
  };

  return (
    <div className="buddy-dialog buddy-dialog--water">
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

        {plan && !editing ? (
          <>
            <div className="buddy-tabs">
              <button
                type="button"
                className="buddy-tab"
                aria-pressed={tab === "today"}
                onClick={() => setTab("today")}
              >
                Today
              </button>
              <button
                type="button"
                className="buddy-tab"
                aria-pressed={tab === "history"}
                onClick={() => {
                  setTab("history");
                  setNote("");
                }}
              >
                History
              </button>
            </div>

            {tab === "today" ? (
              <>
                <div className="water-status">
                  <p className="water-status__total">
                    <strong>{todayMl} ml</strong> / {goalMl} ml today
                  </p>
                  {enabled ? (
                    <NextNudge nextReminderAt={plan.nextReminderAt} />
                  ) : (
                    <p className="water-status__next">reminders are off</p>
                  )}
                </div>

                <div
                  className="water-goal"
                  role="progressbar"
                  aria-label="Daily water goal"
                  aria-valuemin={0}
                  aria-valuemax={goalMl}
                  aria-valuenow={Math.min(todayMl, goalMl)}
                  aria-valuetext={`${todayMl} of ${goalMl} ml`}
                >
                  <div className="water-goal__track">
                    <span
                      className="water-goal__fill"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                  <p className="water-goal__label">
                    {progress.reached
                      ? "daily goal reached!"
                      : `${progress.remainingMl} ml to go`}
                    {enabled && quiet.enabled && (
                      <>
                        {" · "}
                        <QuietHoursStatus plan={plan} quiet={quiet} />
                      </>
                    )}
                  </p>
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
                  {enabled && (
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
                  )}
                </div>
                <div className="buddy-panel__row">
                  {latestEntry && (
                    <button
                      className="btn btn--ghost"
                      type="button"
                      aria-label={`Undo last drink (${latestEntry.amount} ml)`}
                      disabled={pending}
                      onClick={() => undo(latestEntry.id)}
                    >
                      Undo {latestEntry.amount} ml
                    </button>
                  )}
                  <button
                    className="btn btn--ghost"
                    type="button"
                    onClick={() => {
                      resetForm();
                      setEditing(true);
                    }}
                  >
                    Edit schedule
                  </button>
                  {enabled ? (
                    <button
                      className="btn btn--ghost"
                      type="button"
                      disabled={pending}
                      onClick={stop}
                    >
                      Stop reminders
                    </button>
                  ) : (
                    <button
                      className="btn btn--ghost"
                      type="button"
                      disabled={pending}
                      onClick={start}
                    >
                      Start reminders
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                {note && <p className="buddy-panel__note">{note}</p>}
                {error && <p className="buddy-panel__error">{error}</p>}
                {historyDays.length === 0 ? (
                  <p className="buddy-panel__hint">
                    No water logged yet. Every glass you log will show up here.
                  </p>
                ) : (
                  <div className="water-history">
                    {historyDays.map((day) => (
                      <section className="water-day" key={day.date}>
                        <div className="water-day__head">
                          <span className="water-day__label">
                            {waterHistoryDayLabel(day.date)}
                          </span>
                          <span className="water-day__total">
                            {day.totalMl} ml
                            {day.totalMl >= goalMl ? " · goal met" : ""}
                          </span>
                        </div>
                        {day.entries.map((entry) => (
                          <div
                            className="water-entry"
                            key={entry.id ?? entry.ts}
                          >
                            <span className="water-entry__when">
                              {formatWhen(entry.ts)}
                            </span>
                            <span className="water-entry__amount">
                              {entry.amount} ml
                            </span>
                            <button
                              type="button"
                              className="water-entry__undo"
                              aria-label={`Undo ${entry.amount} ml from ${formatWhen(entry.ts)}`}
                              disabled={pending || entry.id === undefined}
                              onClick={() => undo(entry.id)}
                            >
                              Undo
                            </button>
                          </div>
                        ))}
                      </section>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <form className="buddy-panel__form" onSubmit={save}>
            <label className="field">
              <span className="field__label">Each water break</span>
              <select
                className="field__input"
                aria-label="Water amount"
                value={amountChoice}
                onChange={(event) => chooseAmount(event.target.value)}
              >
                {amountOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
                <option value={CUSTOM_CHOICE}>Custom amount…</option>
              </select>
            </label>
            {amountChoice === CUSTOM_CHOICE && (
              <label className="field">
                <span className="field__label">Custom amount (ml)</span>
                <input
                  className="field__input"
                  type="number"
                  min={MIN_AMOUNT_ML}
                  max={MAX_AMOUNT_ML}
                  step="10"
                  value={customAmount}
                  onChange={(event) => setCustomAmount(event.target.value)}
                />
              </label>
            )}

            <label className="field">
              <span className="field__label">Daily goal (ml)</span>
              <input
                className="field__input"
                type="number"
                min={MIN_DAILY_GOAL_ML}
                max={MAX_DAILY_GOAL_ML}
                step="100"
                value={dailyGoal}
                onChange={(event) => setDailyGoal(event.target.value)}
              />
            </label>

            <label className="field">
              <span className="field__label">Remind me every</span>
              <select
                className="field__input"
                aria-label="Reminder interval"
                value={intervalChoice}
                onChange={(event) => chooseInterval(event.target.value)}
              >
                {intervalOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
                <option value={CUSTOM_CHOICE}>Custom interval…</option>
              </select>
            </label>
            {intervalChoice === CUSTOM_CHOICE && (
              <label className="field">
                <span className="field__label">Custom interval (minutes)</span>
                <input
                  className="field__input"
                  type="number"
                  min={MIN_INTERVAL_MINUTES}
                  max={MAX_INTERVAL_MINUTES}
                  step="5"
                  value={customInterval}
                  onChange={(event) => setCustomInterval(event.target.value)}
                />
              </label>
            )}

            <label className="check">
              <input
                type="checkbox"
                checked={quietEnabled}
                onChange={(event) => setQuietEnabled(event.target.checked)}
              />
              Pause nudges during quiet hours
            </label>
            {quietEnabled && (
              <div className="buddy-panel__row">
                <label className="field">
                  <span className="field__label">Quiet from</span>
                  <input
                    className="field__input"
                    type="time"
                    value={quietStart}
                    onChange={(event) => setQuietStart(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span className="field__label">Quiet until</span>
                  <input
                    className="field__input"
                    type="time"
                    value={quietEnd}
                    onChange={(event) => setQuietEnd(event.target.value)}
                  />
                </label>
              </div>
            )}

            {error && <p className="buddy-panel__error">{error}</p>}

            <div className="buddy-panel__row">
              <button
                className="btn btn--primary"
                type="submit"
                disabled={pending}
              >
                {enabled ? "Save schedule" : "Start reminders"}
              </button>
              {plan && (
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    resetForm();
                    setEditing(false);
                  }}
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
