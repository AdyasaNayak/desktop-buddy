import type { Reminder } from "./db";

export interface MissedReminderNotice {
  title: string;
  body: string;
}

export interface ReminderLaunchPlan {
  missed: Reminder[];
  pending: Reminder[];
}

/**
 * Separate reminders that came due before this launch from ones that are
 * still ahead. The timers live in the Electron main process, so anything that
 * was already past when the app started was missed while it was closed.
 */
export function planRemindersAtLaunch(
  reminders: Reminder[],
  launchedAt: number,
): ReminderLaunchPlan {
  const missed: Reminder[] = [];
  const pending: Reminder[] = [];
  for (const reminder of reminders) {
    if (reminder.notified) continue;
    if (reminder.remindAt <= launchedAt) missed.push(reminder);
    else pending.push(reminder);
  }
  return { missed, pending };
}

/**
 * Upcoming reminders stay at the top of the list so fired ones cannot push
 * them out of view. Within each group the existing time order is preserved.
 */
export function sortRemindersForList(reminders: Reminder[]): Reminder[] {
  return [
    ...reminders.filter((reminder) => !reminder.notified),
    ...reminders.filter((reminder) => reminder.notified),
  ];
}

/**
 * Fired reminders stay in the list long enough to see what happened, then are
 * cleaned up so the database does not grow without limit.
 */
export const FIRED_REMINDER_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Older rows did not record when a reminder fired, so their scheduled time is
 * the best available fallback. A reminder can only fire after its schedule.
 */
export function firedAt(reminder: Reminder): number {
  return reminder.notifiedAt ?? reminder.remindAt;
}

/** Fired reminders that are past the retention window and can be deleted. */
export function selectExpiredFiredReminders(
  reminders: Reminder[],
  now: number,
): Reminder[] {
  const cutoff = now - FIRED_REMINDER_RETENTION_MS;
  return reminders.filter(
    (reminder) => reminder.notified && firedAt(reminder) <= cutoff,
  );
}

/** Notification bodies stay readable when a long backlog came due. */
const MAX_LISTED = 3;

/**
 * One notice for the whole backlog, so reopening the app cannot burst the
 * desktop with a separate notification for every reminder.
 */
export function missedReminderNotice(
  reminders: Pick<Reminder, "text">[],
): MissedReminderNotice | null {
  if (reminders.length === 0) return null;
  if (reminders.length === 1) {
    return { title: "Desktop Buddy reminder", body: reminders[0].text };
  }

  const lines = reminders
    .slice(0, MAX_LISTED)
    .map((reminder) => `• ${reminder.text}`);
  const remaining = reminders.length - MAX_LISTED;
  if (remaining > 0) lines.push(`and ${remaining} more`);

  return {
    title: `${reminders.length} reminders came due while I was closed`,
    body: lines.join("\n"),
  };
}
