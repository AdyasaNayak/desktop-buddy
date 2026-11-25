import { PET_FRAME_SIZE, type SpriteRect } from "../pet/petSprites.ts";

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
  ".buddy-pop",
  ".buddy-tag",
].join(",");

/**
 * The part of the drawn 160x160 pet box that actually contains the buddy. The
 * sprite sheets have transparent margins, so using the full draw box would
 * keep an invisible halo of desktop clicks from reaching the windows below.
 * `hitBox` is the union of the pet's visible pixels across every animation,
 * in PET_FRAME_SIZE sprite coordinates.
 */
export function petHitBox(
  petX: number,
  petY: number,
  drawnSize: number,
  hitBox: SpriteRect,
): Rect {
  const scale = drawnSize / PET_FRAME_SIZE;
  return {
    x: petX + hitBox.x * scale,
    y: petY + hitBox.y * scale,
    width: hitBox.w * scale,
    height: hitBox.h * scale,
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

export type Point = { x: number; y: number };
export type PointerPosition = Point & { inside: boolean };

/** What the click-through hook last told the main process and where the pointer is. */
export interface ClickThroughState {
  ignoring: boolean | null;
  point: Point | null;
  pressed: boolean;
}

export const INITIAL_CLICK_THROUGH_STATE: ClickThroughState = {
  ignoring: null,
  point: null,
  pressed: false,
};

export function withPointer(
  state: ClickThroughState,
  point: Point,
): ClickThroughState {
  return { ...state, point };
}

/** A pointer report from the main process, which may be outside the window. */
export function withRemotePointer(
  state: ClickThroughState,
  point: PointerPosition,
): ClickThroughState {
  if (!point.inside) {
    if (state.pressed) return state;
    return { ...state, point: null };
  }
  return { ...state, point: { x: point.x, y: point.y } };
}

export function afterPointerLeft(
  state: ClickThroughState,
  buttons: number,
): ClickThroughState {
  // A held button is a drag; a leave without buttons also clears a press
  // whose release was missed.
  if (buttons !== 0) return { ...state, pressed: true };
  return { ...state, pressed: false, point: null };
}

export function withPressed(
  state: ClickThroughState,
  pressed: boolean,
): ClickThroughState {
  return state.pressed === pressed ? state : { ...state, pressed };
}

export function afterWindowShown(state: ClickThroughState): ClickThroughState {
  // Drop the cached value so the next decision is sent even when it matches
  // what this renderer last applied.
  return { ...state, ignoring: null };
}

export function clickThroughFor(
  state: ClickThroughState,
  isInteractive: (point: Point) => boolean,
): boolean {
  return state.point ? !isInteractive(state.point) : true;
}

export function withClickThrough(
  state: ClickThroughState,
  ignoring: boolean,
): ClickThroughState {
  return state.ignoring === ignoring ? state : { ...state, ignoring };
}
