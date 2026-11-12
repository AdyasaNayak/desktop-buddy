// Written with the extension so the node test runner can load this module.
import { dayKey } from "./time.ts";

/** The water fields the history list needs. */
export interface WaterHistoryEntry {
  id?: number;
  date: string;
  amount: number;
  ts: number;
}

export interface WaterHistoryDay {
  date: string;
  totalMl: number;
  entries: WaterHistoryEntry[];
}

/**
 * Group logged drinks by local calendar day, newest day first and newest drink
 * first inside each day.
 */
export function groupWaterHistory(
  entries: readonly WaterHistoryEntry[],
): WaterHistoryDay[] {
  const days = new Map<string, WaterHistoryEntry[]>();
  for (const entry of entries) {
    const day = days.get(entry.date);
    if (day) day.push(entry);
    else days.set(entry.date, [entry]);
  }

  return [...days.entries()]
    .map(([date, dayEntries]) => ({
      date,
      totalMl: dayEntries.reduce((total, entry) => total + entry.amount, 0),
      entries: [...dayEntries].sort((a, b) => b.ts - a.ts),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Keep the newest entries up to a limit, but never cut a calendar day in half:
 * a day's total would otherwise understate what was logged. The oldest kept
 * day may push the result a little past the limit.
 */
export function recentWaterHistory<T extends WaterHistoryEntry>(
  entries: readonly T[],
  limit: number,
): T[] {
  if (limit <= 0) return [];
  const sorted = [...entries].sort((a, b) => b.ts - a.ts);
  if (sorted.length <= limit) return sorted;

  const oldestKeptDate = sorted[limit - 1].date;
  return sorted.filter((entry) => entry.date >= oldestKeptDate);
}

/** Calendar-day heading: "Today", "Yesterday", or "Mon 3 Mar". */
export function waterHistoryDayLabel(
  date: string,
  now = new Date(),
): string {
  if (date === dayKey(now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date === dayKey(yesterday)) return "Yesterday";

  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
