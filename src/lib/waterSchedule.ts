import { planQuietHours, type QuietHours } from "./waterOptions.ts";

/** The part of a saved water plan that the nudge decision needs. */
export interface WaterSchedule {
  nextReminderAt: number;
  intervalMinutes: number;
}

export interface WaterQuietPlan {
  quietHours?: QuietHours;
}

/** Minutes after local midnight for a timestamp. */
export function minutesOfDay(at: number): number {
  const date = new Date(at);
  return date.getHours() * 60 + date.getMinutes();
}

/** True while the plan's quiet hours should hold nudges back. */
export function isWithinQuietHours(plan: WaterQuietPlan, at: number): boolean {
  const quiet = planQuietHours(plan);
  if (!quiet.enabled || quiet.startMinutes === quiet.endMinutes) return false;

  const minutes = minutesOfDay(at);
  return quiet.startMinutes < quiet.endMinutes
    ? minutes >= quiet.startMinutes && minutes < quiet.endMinutes
    : minutes >= quiet.startMinutes || minutes < quiet.endMinutes;
}

/**
 * The timestamp when the quiet window that contains `at` ends, or null when
 * `at` is outside quiet hours. Overnight windows end on the following day.
 */
export function quietHoursEnd(
  plan: WaterQuietPlan,
  at: number,
): number | null {
  if (!isWithinQuietHours(plan, at)) return null;

  const quiet = planQuietHours(plan);
  const date = new Date(at);
  const minutes = minutesOfDay(at);
  const crossesMidnight = quiet.startMinutes > quiet.endMinutes;
  if (crossesMidnight && minutes >= quiet.startMinutes) {
    date.setDate(date.getDate() + 1);
  }
  date.setHours(
    Math.floor(quiet.endMinutes / 60),
    quiet.endMinutes % 60,
    0,
    0,
  );
  return date.getTime();
}

/**
 * Push a reminder that would land inside quiet hours to the end of the quiet
 * window. Everything else keeps the time it asked for.
 */
export function nextReminderAfterQuietHours(
  plan: WaterQuietPlan,
  at: number,
): number {
  const end = quietHoursEnd(plan, at);
  return end === null ? at : Math.max(at, end);
}

/**
 * The next reminder time after a nudge is dismissed, or `null` to keep the
 * saved schedule. A previewed nudge is dismissed before it is due, so its
 * schedule stays; a nudge that is already due moves out by one full interval
 * so the next check does not reopen it right away.
 */
export function nextReminderAfterDismiss(
  plan: WaterSchedule,
  now: number,
): number | null {
  if (plan.nextReminderAt > now) return null;
  return now + plan.intervalMinutes * 60_000;
}
