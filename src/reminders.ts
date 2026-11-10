import type { Reminder, ReminderRepeat } from "./db";

/** Reminders further out than this are almost always a typo. */
export const MAX_REMINDER_AHEAD_MS = 365 * 24 * 60 * 60 * 1000;

/** The time input only shows minutes, so keep its floor just ahead of now. */
export const MIN_REMINDER_LEAD_MS = 60 * 1000;

/**
 * Input limits for `datetime-local` values, computed from the current time so
 * a dialog that stays open does not keep a minimum that has already passed.
 */
export function reminderDateBounds(now: number): { min: string; max: string } {
  return {
    min: toDateTimeLocalValue(new Date(now + MIN_REMINDER_LEAD_MS)),
    max: toDateTimeLocalValue(new Date(now + MAX_REMINDER_AHEAD_MS)),
  };
}

/** Local "YYYY-MM-DDTHH:mm" value a datetime-local input expects. */
export function toDateTimeLocalValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join("T");
}

export interface ReminderDraft {
  text: string;
  remindAt: number;
  repeat: ReminderRepeat;
}

export const MAX_REMINDER_TEXT_LENGTH = 200;

export const REMINDER_REPEAT_OPTIONS: {
  value: ReminderRepeat;
  label: string;
}[] = [
  { value: "none", label: "Once" },
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
];

/** Rows saved before repeats existed have no value, which means once. */
export function toReminderRepeat(repeat: unknown): ReminderRepeat {
  return repeat === "daily" || repeat === "weekly" ? repeat : "none";
}

/**
 * The next occurrence after a reminder fires. Local calendar days are added
 * so a 9am daily reminder stays at 9am across daylight-saving changes.
 */
export function nextReminderTime(
  remindAt: number,
  repeat: ReminderRepeat | undefined,
  after: number,
): number | null {
  const interval = toReminderRepeat(repeat);
  if (interval === "none") return null;
  if (!Number.isFinite(remindAt) || !Number.isFinite(after)) return null;

  const stepDays = interval === "weekly" ? 7 : 1;
  const next = new Date(remindAt);
  if (!Number.isFinite(next.getTime())) return null;
  do {
    next.setDate(next.getDate() + stepDays);
  } while (next.getTime() <= after);
  const nextTime = next.getTime();
  return Number.isFinite(nextTime) ? nextTime : null;
}

/** Short list metadata such as "repeats every day". */
export function reminderRepeatLabel(
  repeat: ReminderRepeat | undefined,
): string | null {
  const interval = toReminderRepeat(repeat);
  if (interval === "none") return null;
  return interval === "weekly" ? "repeats every week" : "repeats every day";
}

/** Shared text rule so the form and the save path accept the same messages. */
export function reminderTextError(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return "Enter a reminder message.";
  if (trimmed.length > MAX_REMINDER_TEXT_LENGTH) {
    return `Keep the reminder under ${MAX_REMINDER_TEXT_LENGTH} characters.`;
  }
  return null;
}

/** Shared form validation so add and edit behave the same way. */
export function reminderDraftError(
  draft: ReminderDraft,
  now: number,
): string | null {
  const textProblem = reminderTextError(draft.text);
  if (textProblem) return textProblem;
  if (!Number.isFinite(draft.remindAt) || draft.remindAt <= now) {
    return "Choose a future date and time.";
  }
  if (draft.remindAt > now + MAX_REMINDER_AHEAD_MS) {
    return "Choose a date within a year from now.";
  }
  return null;
}

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
