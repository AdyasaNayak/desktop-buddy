export type Rect = { x: number; y: number; width: number; height: number };
export type SpritePreview = {
  x: number;
  y: number;
  w: number;
  h: number;
};

const PET_SPRITE_SIZE = 64;

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

/**
 * The part of the drawn 160x160 pet box that actually contains the buddy. The
 * sprite sheets have transparent margins, so using the full draw box would
 * keep an invisible halo of desktop clicks from reaching the windows below.
 * `preview` is the pet's visible body in 64x64 sprite coordinates.
 */
export function petHitBox(
  petX: number,
  petY: number,
  drawnSize: number,
  preview: SpritePreview,
): Rect {
  const scale = drawnSize / PET_SPRITE_SIZE;
  return {
    x: petX + preview.x * scale,
    y: petY + preview.y * scale,
    width: preview.w * scale,
    height: preview.h * scale,
  };
}

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
