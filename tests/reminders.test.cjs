const test = require("node:test");
const assert = require("node:assert/strict");
const {
  missedReminderNotice,
  planRemindersAtLaunch,
  sortRemindersForList,
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
