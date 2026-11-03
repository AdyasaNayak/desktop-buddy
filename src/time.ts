/** Local calendar day, used to group water glasses and work sessions. */
export function todayKey(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Wall-clock milliseconds, read when an event actually happens. */
export function nowMs() {
  return Date.now();
}

/** Timestamp a given number of minutes from now, for reminder schedules. */
export function minutesFromNow(minutes: number) {
  return nowMs() + minutes * 60 * 1000;
}

/** mm:ss until an hour, then h:mm:ss. */
export function formatClock(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(rest).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Friendly, compact durations for timers and the work log. */
export function formatDuration(ms: number) {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes < 1) return "<1m";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${minutes}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${String(rest).padStart(2, "0")}m`;
}

export function formatInterval(minutes: number) {
  if (minutes === 60) return "hour";
  if (minutes % 60 === 0) return `${minutes / 60} hours`;
  return `${minutes} min`;
}

export function formatTimeOfDay(ts: number) {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
