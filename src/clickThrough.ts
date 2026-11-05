export type Rect = { x: number; y: number; width: number; height: number };

// Everything the pet window actually draws that should keep the mouse: the
// pet itself is checked separately, and the rest of the 360x260 window is
// transparent and must let clicks reach whatever is underneath.
const INTERACTIVE_SELECTOR = [
  "button",
  "a[href]",
  "input",
  "select",
  "textarea",
  "label",
  "[role='dialog']",
  ".buddy-bubble",
  ".buddy-menu",
  ".buddy-timer",
].join(",");

export function isInside(rect: Rect, x: number, y: number) {
  return (
    x >= rect.x &&
    x <= rect.x + rect.width &&
    y >= rect.y &&
    y <= rect.y + rect.height
  );
}

/**
 * Whether the mouse at (x, y) is over something the pet window shows. The
 * element lookup is injected so the rule can be checked without a browser.
 */
export function isInteractivePoint(
  x: number,
  y: number,
  pet: Rect | null,
  elementAt: (x: number, y: number) => Element | null,
) {
  if (pet && isInside(pet, x, y)) return true;
  return elementAt(x, y)?.closest(INTERACTIVE_SELECTOR) != null;
}
