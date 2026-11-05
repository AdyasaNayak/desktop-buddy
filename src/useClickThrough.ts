import { useCallback, useEffect, useRef, type RefObject } from "react";
import { isInteractivePoint, type Rect } from "./clickThrough";

/**
 * Hands the transparent parts of the pet window back to the desktop.
 *
 * While click-through is on, Electron still forwards mouse moves to the
 * renderer, so the window switches back to normal as soon as the pointer
 * reaches the buddy, a bubble, or a panel. Only the pet view uses this: the
 * setup window is fully opaque and should keep every click.
 */
export function useClickThrough(
  enabled: boolean,
  petBox: RefObject<Rect | null>,
) {
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    const buddy = window.desktopBuddy;
    if (!enabled || !buddy) return;

    let ignoring: boolean | null = null;
    let lastPoint: { x: number; y: number } | null = null;
    let frame = 0;

    const apply = (ignore: boolean) => {
      if (ignoring === ignore) return;
      ignoring = ignore;
      buddy.setClickThrough(ignore);
    };

    const update = () => {
      frame = 0;
      if (!lastPoint) return;
      apply(
        !isInteractivePoint(lastPoint.x, lastPoint.y, petBox.current, (x, y) =>
          document.elementFromPoint(x, y),
        ),
      );
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    const handleMove = (event: MouseEvent) => {
      lastPoint = { x: event.clientX, y: event.clientY };
      schedule();
    };

    const handleLeave = (event: MouseEvent) => {
      // a held mouse button means the buddy is being dragged; the window is
      // following the pointer, so do not hand the drag to the desktop
      if (event.buttons !== 0) return;
      lastPoint = null;
      apply(true);
    };

    refreshRef.current = schedule;

    // Opening or closing a menu, bubble, or panel changes what sits under a
    // pointer that has not moved since.
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseleave", handleLeave);

    return () => {
      refreshRef.current = () => {};
      observer.disconnect();
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseleave", handleLeave);
      if (frame) cancelAnimationFrame(frame);
      // never leave the window click-through after the pet view is gone
      buddy.setClickThrough(false);
    };
  }, [enabled, petBox]);

  // Lets the pet loop re-check while the buddy walks under a still pointer.
  return useCallback(() => refreshRef.current(), []);
}
