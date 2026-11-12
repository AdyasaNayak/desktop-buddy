// Written with the extension so the node test runner can load this module.
import { formatInterval } from "./time.ts";

export interface WaterOption {
  value: number;
  label: string;
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
