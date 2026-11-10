const test = require("node:test");
const assert = require("node:assert/strict");
const {
  FIRED_REMINDER_RETENTION_MS,
  MAX_REMINDER_TEXT_LENGTH,
  missedReminderNotice,
  nextReminderTime,
  planRemindersAtLaunch,
  reminderDraftError,
  reminderRepeatLabel,
  reminderTextError,
  selectExpiredFiredReminders,
  sortRemindersForList,
  toReminderRepeat,
} = require("../src/reminders.ts");

test("reminders due before launch are missed; later ones stay pending", () => {
  const launchedAt = 1_000_000;
  const { missed, pending } = planRemindersAtLaunch(
    [
      { id: 1, text: "already due", remindAt: launchedAt - 60_000, notified: false },
      { id: 2, text: "due right at launch", remindAt: launchedAt, notified: false },
      { id: 3, text: "still ahead", remindAt: launchedAt + 60_000, notified: false },
    ],
    launchedAt,
  );

  assert.deepEqual(
    missed.map((reminder) => reminder.id),
    [1, 2],
  );
  assert.deepEqual(
    pending.map((reminder) => reminder.id),
    [3],
  );
});

test("notified reminders are never scheduled again", () => {
  const { missed, pending } = planRemindersAtLaunch(
    [
      { id: 1, text: "old", remindAt: 1, notified: true },
      { id: 2, text: "new", remindAt: 4, notified: true },
    ],
    3,
  );

  assert.deepEqual(missed, []);
  assert.deepEqual(pending, []);
});

test("an empty backlog produces no notification", () => {
  assert.equal(missedReminderNotice([]), null);
});

test("a single missed reminder keeps its text", () => {
  assert.deepEqual(missedReminderNotice([{ text: "stretch" }]), {
    title: "Desktop Buddy reminder",
    body: "stretch",
  });
});

test("several missed reminders become one notification", () => {
  assert.deepEqual(
    missedReminderNotice([
      { text: "stretch" },
      { text: "drink water" },
      { text: "call mum" },
    ]),
    {
      title: "3 reminders came due while I was closed",
      body: "• stretch\n• drink water\n• call mum",
    },
  );
});

test("a long backlog is summarised instead of growing without limit", () => {
  const notice = missedReminderNotice([
    { text: "one" },
    { text: "two" },
    { text: "three" },
    { text: "four" },
    { text: "five" },
  ]);

  assert.deepEqual(notice, {
    title: "5 reminders came due while I was closed",
    body: "• one\n• two\n• three\nand 2 more",
  });
});

test("fired reminders move below upcoming ones without being hidden", () => {
  const reminders = [
    { id: 1, text: "fired early", remindAt: 10, notified: true },
    { id: 2, text: "upcoming", remindAt: 20, notified: false },
    { id: 3, text: "fired late", remindAt: 30, notified: true },
    { id: 4, text: "upcoming later", remindAt: 40, notified: false },
  ];

  assert.deepEqual(
    sortRemindersForList(reminders).map((reminder) => reminder.id),
    [2, 4, 1, 3],
  );
  assert.equal(reminders.map((reminder) => reminder.id).join(","), "1,2,3,4");
});

test("fired reminders are cleaned up once the retention window passes", () => {
  const now = 10 * FIRED_REMINDER_RETENTION_MS;
  const reminders = [
    { id: 1, text: "upcoming", remindAt: now + 1, notified: false },
    {
      id: 2,
      text: "fired recently",
      remindAt: now - 1000,
      notified: true,
      notifiedAt: now - 1000,
    },
    {
      id: 3,
      text: "fired long ago",
      remindAt: now - 2 * FIRED_REMINDER_RETENTION_MS,
      notified: true,
      notifiedAt: now - 2 * FIRED_REMINDER_RETENTION_MS,
    },
  ];

  assert.deepEqual(
    selectExpiredFiredReminders(reminders, now).map((reminder) => reminder.id),
    [3],
  );
});

test("a recent firing keeps an old schedule from being pruned", () => {
  const now = 10 * FIRED_REMINDER_RETENTION_MS;
  const reminder = {
    id: 1,
    text: "missed while the app was closed",
    remindAt: now - 2 * FIRED_REMINDER_RETENTION_MS,
    notified: true,
    notifiedAt: now - 1000,
  };

  assert.deepEqual(selectExpiredFiredReminders([reminder], now), []);
});

test("one-off reminders do not schedule another occurrence", () => {
  assert.equal(nextReminderTime(1_000, "none", 1_000), null);
  assert.equal(nextReminderTime(1_000, undefined, 1_000), null);
});

test("daily reminders advance to the next day at the same local time", () => {
  const firedAt = new Date(2026, 0, 12, 9, 0).getTime();
  const next = nextReminderTime(firedAt, "daily", firedAt);
  const nextDate = new Date(next);

  assert.equal(nextDate.getFullYear(), 2026);
  assert.equal(nextDate.getMonth(), 0);
  assert.equal(nextDate.getDate(), 13);
  assert.equal(nextDate.getHours(), 9);
  assert.equal(nextDate.getMinutes(), 0);
});

test("a repeating reminder skipped while the app was closed lands in the future", () => {
  const scheduled = new Date(2026, 0, 12, 9, 0).getTime();
  const reopened = new Date(2026, 0, 16, 15, 30).getTime();
  const nextDate = new Date(nextReminderTime(scheduled, "daily", reopened));

  assert.equal(nextDate.getDate(), 17);
  assert.equal(nextDate.getHours(), 9);
  assert.ok(nextDate.getTime() > reopened);
});

test("weekly reminders advance a calendar week", () => {
  const scheduled = new Date(2026, 0, 12, 9, 0).getTime();
  const nextDate = new Date(nextReminderTime(scheduled, "weekly", scheduled));

  assert.equal(nextDate.getDate(), 19);
  assert.equal(nextDate.getHours(), 9);
});

test("damaged dates cannot create an unusable next reminder", () => {
  assert.equal(nextReminderTime(Number.NaN, "daily", 1_000), null);
  assert.equal(nextReminderTime(8.64e15, "daily", 1_000), null);
});

test("repeat values from older or damaged rows fall back to once", () => {
  assert.equal(toReminderRepeat("daily"), "daily");
  assert.equal(toReminderRepeat("weekly"), "weekly");
  assert.equal(toReminderRepeat(undefined), "none");
  assert.equal(toReminderRepeat("monthly"), "none");
});

test("repeat labels only appear for repeating reminders", () => {
  assert.equal(reminderRepeatLabel(undefined), null);
  assert.equal(reminderRepeatLabel("none"), null);
  assert.equal(reminderRepeatLabel("daily"), "repeats every day");
  assert.equal(reminderRepeatLabel("weekly"), "repeats every week");
});

test("reminder drafts need text, a future time, and a bounded date", () => {
  const now = 1_000_000;
  assert.equal(
    reminderDraftError({ text: "  ", remindAt: now + 1000, repeat: "none" }, now),
    "Enter a reminder message.",
  );
  assert.equal(
    reminderDraftError({ text: "stretch", remindAt: now, repeat: "none" }, now),
    "Choose a future date and time.",
  );
  assert.equal(
    reminderDraftError(
      { text: "stretch", remindAt: now + 400 * 24 * 60 * 60 * 1000, repeat: "none" },
      now,
    ),
    "Choose a date within a year from now.",
  );
  assert.equal(
    reminderDraftError(
      { text: "stretch", remindAt: now + 60_000, repeat: "daily" },
      now,
    ),
    null,
  );
});

test("overlong reminder text is rejected instead of being stored", () => {
  const now = 1_000_000;
  assert.equal(
    reminderDraftError(
      {
        text: "x".repeat(MAX_REMINDER_TEXT_LENGTH + 1),
        remindAt: now + 60_000,
        repeat: "none",
      },
      now,
    ),
    `Keep the reminder under ${MAX_REMINDER_TEXT_LENGTH} characters.`,
  );
});

test("the text limit is shared by the form and the save path", () => {
  assert.equal(reminderTextError("  "), "Enter a reminder message.");
  assert.equal(
    reminderTextError(`  ${"x".repeat(MAX_REMINDER_TEXT_LENGTH)}  `),
    null,
  );
  assert.equal(
    reminderTextError("x".repeat(MAX_REMINDER_TEXT_LENGTH + 1)),
    `Keep the reminder under ${MAX_REMINDER_TEXT_LENGTH} characters.`,
  );
});

test("fired reminders from older versions fall back to their schedule", () => {
  const now = 10 * FIRED_REMINDER_RETENTION_MS;
  const reminder = {
    id: 1,
    text: "old fired row",
    remindAt: now - 2 * FIRED_REMINDER_RETENTION_MS,
    notified: true,
  };

  assert.deepEqual(selectExpiredFiredReminders([reminder], now), [reminder]);
});
