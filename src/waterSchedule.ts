/** The part of a saved water plan that the nudge decision needs. */
export interface WaterSchedule {
  nextReminderAt: number;
  intervalMinutes: number;
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
