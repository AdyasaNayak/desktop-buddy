const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_DAILY_GOAL_ML,
  DEFAULT_QUIET_END_MINUTES,
  DEFAULT_QUIET_START_MINUTES,
  minutesToTimeValue,
  planDailyGoalMl,
  planQuietHours,
  timeValueToMinutes,
  waterGoalProgress,
  waterSettingsError,
} = require("../src/waterOptions.ts");
const {
  isWithinQuietHours,
  nextReminderAfterQuietHours,
  quietHoursEnd,
} = require("../src/waterSchedule.ts");
const {
  groupWaterHistory,
  recentWaterHistory,
  waterHistoryDayLabel,
} = require("../src/waterHistory.ts");
const { dayKey } = require("../src/time.ts");

const settings = (overrides = {}) => ({
  amountMl: 250,
  intervalMinutes: 60,
  dailyGoalMl: 2000,
  quietHours: {
    enabled: false,
    startMinutes: DEFAULT_QUIET_START_MINUTES,
    endMinutes: DEFAULT_QUIET_END_MINUTES,
  },
  ...overrides,
});

const overnight = {
  quietHours: { enabled: true, startMinutes: 22 * 60, endMinutes: 7 * 60 },
};

test("custom amounts and intervals are valid water settings", () => {
  assert.equal(
    waterSettingsError(settings({ amountMl: 300, intervalMinutes: 40 })),
    null,
  );
});

test("water settings reject impossible amounts, intervals, and goals", () => {
  assert.match(waterSettingsError(settings({ amountMl: 0 })), /amount/i);
  assert.match(waterSettingsError(settings({ intervalMinutes: 0 })), /interval/i);
  assert.match(waterSettingsError(settings({ dailyGoalMl: 0 })), /goal/i);
  assert.match(
    waterSettingsError(
      settings({
        quietHours: { enabled: true, startMinutes: 600, endMinutes: 600 },
      }),
    ),
    /different start and end/i,
  );
});

test("quiet hours can cross midnight", () => {
  const plan = overnight;
  const quietStart = new Date(2025, 0, 15, 22, 0).getTime();
  const evening = new Date(2025, 0, 15, 23, 0).getTime();
  const morning = new Date(2025, 0, 16, 6, 30).getTime();
  const quietEnd = new Date(2025, 0, 16, 7, 0).getTime();
  const daytime = new Date(2025, 0, 16, 12, 0).getTime();

  assert.equal(isWithinQuietHours(plan, quietStart), true);
  assert.equal(isWithinQuietHours(plan, evening), true);
  assert.equal(isWithinQuietHours(plan, morning), true);
  assert.equal(isWithinQuietHours(plan, quietEnd), false);
  assert.equal(isWithinQuietHours(plan, daytime), false);
  assert.equal(
    quietHoursEnd(plan, evening),
    new Date(2025, 0, 16, 7, 0).getTime(),
  );
  assert.equal(
    quietHoursEnd(plan, morning),
    new Date(2025, 0, 16, 7, 0).getTime(),
  );
  assert.equal(quietHoursEnd(plan, daytime), null);
});

test("quiet hours during the day end on the same day", () => {
  const plan = {
    quietHours: { enabled: true, startMinutes: 13 * 60, endMinutes: 15 * 60 },
  };
  const at = new Date(2025, 0, 15, 14, 0).getTime();

  assert.equal(
    quietHoursEnd(plan, at),
    new Date(2025, 0, 15, 15, 0).getTime(),
  );
  assert.equal(
    isWithinQuietHours(plan, new Date(2025, 0, 15, 12, 59).getTime()),
    false,
  );
});

test("a reminder that lands in quiet hours waits for the quiet window to end", () => {
  const desired = new Date(2025, 0, 15, 22, 30).getTime();

  assert.equal(
    nextReminderAfterQuietHours(overnight, desired),
    new Date(2025, 0, 16, 7, 0).getTime(),
  );
  assert.equal(
    nextReminderAfterQuietHours(settings(), desired),
    desired,
  );
});

test("plans saved before goals and quiet hours fall back safely", () => {
  assert.equal(planDailyGoalMl(null), DEFAULT_DAILY_GOAL_ML);
  assert.equal(planDailyGoalMl({}), DEFAULT_DAILY_GOAL_ML);
  assert.deepEqual(planQuietHours(null), {
    enabled: false,
    startMinutes: DEFAULT_QUIET_START_MINUTES,
    endMinutes: DEFAULT_QUIET_END_MINUTES,
  });
  assert.deepEqual(planQuietHours({ quietHours: overnight.quietHours }), {
    ...overnight.quietHours,
  });
});

test("goal progress is clamped and reports what is left", () => {
  assert.deepEqual(waterGoalProgress(500, 2000), {
    percent: 25,
    remainingMl: 1500,
    reached: false,
  });
  assert.deepEqual(waterGoalProgress(3000, 2000), {
    percent: 100,
    remainingMl: 0,
    reached: true,
  });
});

test("time inputs round-trip through stored minutes", () => {
  assert.equal(minutesToTimeValue(22 * 60), "22:00");
  assert.equal(minutesToTimeValue(7 * 60 + 5), "07:05");
  assert.equal(timeValueToMinutes("22:00"), 22 * 60);
  assert.equal(timeValueToMinutes("07:05"), 7 * 60 + 5);
  assert.equal(timeValueToMinutes(""), null);
  assert.equal(timeValueToMinutes("25:00"), null);
});

test("history groups drinks by day, newest first", () => {
  const entries = [
    { id: 1, date: "2025-01-14", amount: 250, ts: 1 },
    { id: 2, date: "2025-01-15", amount: 250, ts: 2 },
    { id: 3, date: "2025-01-15", amount: 400, ts: 3 },
  ];

  const days = groupWaterHistory(entries);

  assert.deepEqual(
    days.map((day) => [day.date, day.totalMl]),
    [
      ["2025-01-15", 650],
      ["2025-01-14", 250],
    ],
  );
  assert.deepEqual(
    days[0].entries.map((entry) => entry.id),
    [3, 2],
  );
});

test("history trimming keeps every entry from the oldest kept day", () => {
  const entries = [
    { id: 1, date: "2025-01-14", amount: 250, ts: 1 },
    { id: 2, date: "2025-01-15", amount: 250, ts: 2 },
    { id: 3, date: "2025-01-15", amount: 400, ts: 3 },
    { id: 4, date: "2025-01-16", amount: 100, ts: 4 },
  ];

  const kept = recentWaterHistory(entries, 3);

  assert.deepEqual(
    kept.map((entry) => entry.id),
    [4, 3, 2],
  );
  assert.equal(groupWaterHistory(kept)[1].totalMl, 650);
});

test("history headings name today and yesterday", () => {
  const now = new Date(2025, 2, 10, 12, 0);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  assert.equal(waterHistoryDayLabel(dayKey(now), now), "Today");
  assert.equal(waterHistoryDayLabel(dayKey(yesterday), now), "Yesterday");
  assert.notEqual(waterHistoryDayLabel("2025-03-01", now), "Today");
});
