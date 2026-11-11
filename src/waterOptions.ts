export interface WaterOption {
  value: number;
  label: string;
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
