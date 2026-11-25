const MAX_TASK_LENGTH = 60;

/** Running clock for the tray: "05:42" or "1:05:42". */
function formatWorkClock(ms) {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value) => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

/** Accept only the small status shape the renderer is allowed to report. */
function normalizeWorkStatus(status) {
  if (!status || typeof status !== "object") return null;
  if (typeof status.task !== "string") return null;
  if (!Number.isFinite(status.elapsedMs) || status.elapsedMs < 0) return null;

  const task = status.task.trim();
  if (!task || task.length > MAX_TASK_LENGTH) return null;

  return {
    task,
    elapsedMs: status.elapsedMs,
    paused: status.paused === true,
  };
}

function workState(work) {
  if (work.paused) return `paused: ${work.task}`;
  return `working: ${work.task}`;
}

/** Tray tooltip that keeps the work timer visible while the buddy is hidden. */
function trayTooltip({ visible, work }) {
  const base = "Desktop Buddy";
  if (!work) {
    return visible ? base : `${base} — click to bring me back`;
  }

  const state = workState(work);
  const summary = `${base} — ${state} (${formatWorkClock(work.elapsedMs)})`;
  return visible ? summary : `${summary} · click to bring me back`;
}

/** Disabled tray-menu row summarizing the running timer. */
function workStatusLabel(work) {
  if (!work) return null;
  return `${workState(work)} · ${formatWorkClock(work.elapsedMs)}`;
}

/** Minute-precision clock for the tray menu: "<1 min", "42 min", "1 h 05 min". */
function formatWorkMinutes(ms) {
  const totalMinutes = Math.floor(Math.max(0, ms) / 60_000);
  if (totalMinutes < 1) return "<1 min";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return `${hours} h ${String(minutes).padStart(2, "0")} min`;
}

/**
 * Tray-menu row for the running timer. Minute precision keeps the native menu
 * from being rebuilt every second; the tooltip carries the seconds.
 */
function workStatusMenuLabel(work) {
  if (!work) return null;
  return `${workState(work)} · ${formatWorkMinutes(work.elapsedMs)}`;
}

module.exports = {
  formatWorkClock,
  formatWorkMinutes,
  workStatusMenuLabel,
  normalizeWorkStatus,
  trayTooltip,
  workStatusLabel,
};
