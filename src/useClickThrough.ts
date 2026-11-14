import { useCallback, useEffect, useRef, type RefObject } from "react";
import {
  afterPointerLeft,
  afterWindowShown,
  clickThroughFor,
  INITIAL_CLICK_THROUGH_STATE,
  isInteractivePoint,
  withClickThrough,
  withPointer,
  withPressed,
  withRemotePointer,
  type Rect,
} from "./clickThrough";

/**
 * Hands the transparent parts of the pet window back to the desktop.
 *
 * The pet view starts click-through instead of waiting for the first mouse
 * move. On Windows and macOS forwarded moves tell us when the pointer reaches
 * the buddy; elsewhere, and after the window is shown, the main process polls
 * the cursor and sends the same information. Only the pet view uses this: the
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

    let state = INITIAL_CLICK_THROUGH_STATE;
    let frame = 0;

    const apply = (ignore: boolean) => {
      const next = withClickThrough(state, ignore);
      if (next === state) return;
      state = next;
      buddy.setClickThrough(ignore);
    };

    const update = () => {
      frame = 0;
      apply(
        clickThroughFor(state, (point) =>
          isInteractivePoint(point.x, point.y, petBox.current, (x, y) =>
            document.elementFromPoint(x, y),
          ),
        ),
      );
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    const handleMove = (event: MouseEvent) => {
      state = withPointer(state, { x: event.clientX, y: event.clientY });
      schedule();
    };

    const handleLeave = (event: MouseEvent) => {
      state = afterPointerLeft(state, event.buttons);
      if (state.point === null) apply(true);
    };

    const handlePointerDown = () => {
      state = withPressed(state, true);
    };

    const handlePointerUp = () => {
      state = withPressed(state, false);
    };

    refreshRef.current = schedule;

    // Opening or closing a menu, bubble, or panel changes what sits under a
    // pointer that has not moved since.
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseleave", handleLeave);
    window.addEventListener("blur", handlePointerUp);
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    // Covers platforms without forwarded moves and windows that were just
    // shown while the pointer was already sitting still somewhere on screen.
    const unsubscribePointer = buddy.onPointerPosition?.((point) => {
      if (!point) return;
      state = withRemotePointer(state, point);
      if (point.inside) {
        schedule();
        return;
      }
      if (state.pressed) return;
      apply(true);
    });

    // The main process forces click-through on show, before the renderer has
    // had a chance to look at the pointer. Drop the cached value so the next
    // update is sent even when it matches what this renderer last applied.
    const unsubscribeShown = buddy.onWindowShown?.(() => {
      state = afterWindowShown(state);
      apply(true);
      schedule();
    });

    // Never leave a freshly mounted pet view blocking the desktop while it
    // waits for the first pointer update.
    const current = buddy.getPointerPosition?.();
    if (current?.inside) {
      state = withRemotePointer(state, current);
      update();
    } else {
      apply(true);
    }

    return () => {
      refreshRef.current = () => {};
      observer.disconnect();
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseleave", handleLeave);
      window.removeEventListener("blur", handlePointerUp);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      unsubscribePointer?.();
      unsubscribeShown?.();
      if (frame) cancelAnimationFrame(frame);
      // never leave the window click-through after the pet view is gone
      buddy.setClickThrough(false);
    };
  }, [enabled, petBox]);

  // Lets the pet loop re-check while the buddy walks under a still pointer.
  return useCallback(() => refreshRef.current(), []);
}
