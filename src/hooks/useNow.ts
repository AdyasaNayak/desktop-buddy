import { useEffect, useState } from "react";

/**
 * Current time that refreshes every `intervalMs` while `enabled`. Keep it in
 * the small component that shows a clock, so the ticking re-renders only that
 * component instead of the whole buddy.
 */
export function useNow(intervalMs: number, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    const refresh = () => setNow(Date.now());
    // catch up straight away after being re-enabled, then keep ticking
    const first = window.setTimeout(refresh, 0);
    const timer = window.setInterval(refresh, intervalMs);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [intervalMs, enabled]);

  return now;
}
