// Written with the extension so the node test runner can load this module.
import { formatInterval } from "./time.ts";

export interface WaterOption {
  value: number;
  label: string;
}

export const DEFAULT_AMOUNT_ML = 250;
export const DEFAULT_INTERVAL_MINUTES = 60;
export const DEFAULT_DAILY_GOAL_ML = 2000;
export const DEFAULT_QUIET_START_MINUTES = 22 * 60;
export const DEFAULT_QUIET_END_MINUTES = 7 * 60;

export const MIN_AMOUNT_ML = 50;
export const MAX_AMOUNT_ML = 5000;
export const MIN_INTERVAL_MINUTES = 5;
export const MAX_INTERVAL_MINUTES = 24 * 60;
export const MIN_DAILY_GOAL_ML = 100;
export const MAX_DAILY_GOAL_ML = 20_000;

/** Quiet hours are stored as minutes after local midnight. */
export interface QuietHours {
  enabled: boolean;
  startMinutes: number;
  endMinutes: number;
}

export interface WaterSettings {
  amountMl: number;
  intervalMinutes: number;
  dailyGoalMl: number;
  quietHours: QuietHours;
}

export const AMOUNT_OPTIONS: readonly WaterOption[] = [
  { value: 100, label: "a few sips (100 ml)" },
  { value: 250, label: "a glass (250 ml)" },
  { value: 400, label: "a big glass (400 ml)" },
  { value: 500, label: "a bottle (500 ml)" },
];

export const INTERVAL_OPTIONS: readonly WaterOption[] = [
  15, 30, 45, 60, 90, 120,
].map((minutes) => ({ value: minutes, label: formatInterval(minutes) }));

/** A saved amount no preset names, worded like the presets: "other (300 ml)". */
export function amountLabel(value: number): string {
  return `other (${value} ml)`;
}

/**
 * The preset choices plus the saved value when it came from outside them,
 * such as data changed or imported by another version. A controlled select
 * whose value has no matching option otherwise falls back to its first
 * choice and misreports the saved schedule.
 */
export function withSavedOption(
  options: readonly WaterOption[],
  savedValue: number | null | undefined,
  label: (value: number) => string,
): WaterOption[] {
  if (
    savedValue === null ||
    savedValue === undefined ||
    options.some((option) => option.value === savedValue)
  ) {
    return [...options];
  }
  return [...options, { value: savedValue, label: label(savedValue) }].sort(
    (a, b) => a.value - b.value,
  );
}

/** The goal saved with a plan, falling back for plans from older versions. */
export function planDailyGoalMl(plan: { dailyGoalMl?: number } | null): number {
  const goal = plan?.dailyGoalMl;
  return typeof goal === "number" && Number.isFinite(goal) && goal > 0
    ? goal
    : DEFAULT_DAILY_GOAL_ML;
}

/** Quiet-hour choices saved with a plan, or the disabled defaults. */
export function planQuietHours(
  plan: { quietHours?: QuietHours } | null,
): QuietHours {
  const quiet = plan?.quietHours;
  const validTime = (minutes: unknown): minutes is number =>
    typeof minutes === "number" &&
    Number.isInteger(minutes) &&
    minutes >= 0 &&
    minutes < 24 * 60;
  if (
    !quiet ||
    typeof quiet.enabled !== "boolean" ||
    !validTime(quiet.startMinutes) ||
    !validTime(quiet.endMinutes)
  ) {
    return {
      enabled: false,
      startMinutes: DEFAULT_QUIET_START_MINUTES,
      endMinutes: DEFAULT_QUIET_END_MINUTES,
    };
  }
  return { ...quiet };
}

/** Validate the water settings before they are saved or used to schedule. */
export function waterSettingsError(settings: WaterSettings): string | null {
  if (
    !Number.isInteger(settings.amountMl) ||
    settings.amountMl < MIN_AMOUNT_ML ||
    settings.amountMl > MAX_AMOUNT_ML
  ) {
    return `Choose an amount between ${MIN_AMOUNT_ML} and ${MAX_AMOUNT_ML} ml.`;
  }
  if (
    !Number.isInteger(settings.intervalMinutes) ||
    settings.intervalMinutes < MIN_INTERVAL_MINUTES ||
    settings.intervalMinutes > MAX_INTERVAL_MINUTES
  ) {
    return `Choose a reminder interval between ${MIN_INTERVAL_MINUTES} minutes and ${MAX_INTERVAL_MINUTES / 60} hours.`;
  }
  if (
    !Number.isInteger(settings.dailyGoalMl) ||
    settings.dailyGoalMl < MIN_DAILY_GOAL_ML ||
    settings.dailyGoalMl > MAX_DAILY_GOAL_ML
  ) {
    return `Choose a daily goal between ${MIN_DAILY_GOAL_ML} and ${MAX_DAILY_GOAL_ML} ml.`;
  }
  if (settings.quietHours.enabled) {
    const { startMinutes, endMinutes } = settings.quietHours;
    if (
      !Number.isFinite(startMinutes) ||
      !Number.isFinite(endMinutes) ||
      startMinutes < 0 ||
      startMinutes >= 24 * 60 ||
      endMinutes < 0 ||
      endMinutes >= 24 * 60
    ) {
      return "Choose a start and end time for quiet hours.";
    }
    if (startMinutes === endMinutes) {
      return "Quiet hours need different start and end times.";
    }
  }
  return null;
}

/** A stored minute-of-day as an input[type=time] value ("22:00"). */
export function minutesToTimeValue(minutes: number): string {
  const safe = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/** Parse an input[type=time] value, or null when it is incomplete. */
export function timeValueToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export interface WaterGoalProgress {
  percent: number;
  remainingMl: number;
  reached: boolean;
}

/** Today's intake as a share of the daily goal, clamped for a progress bar. */
export function waterGoalProgress(
  totalMl: number,
  goalMl: number,
): WaterGoalProgress {
  const goal = goalMl > 0 ? goalMl : DEFAULT_DAILY_GOAL_ML;
  const total = Math.max(0, totalMl);
  return {
    percent: Math.min(100, Math.round((total / goal) * 100)),
    remainingMl: Math.max(0, goal - total),
    reached: total >= goal,
  };
}
