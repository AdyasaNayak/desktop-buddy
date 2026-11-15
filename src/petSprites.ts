export interface SpriteRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Every sheet is a horizontal strip of PET_FRAME_SIZE×PET_FRAME_SIZE frames. */
export const PET_FRAME_SIZE = 64;

/**
 * The union of visible pixels across the idle, heart, drink, and work sheets,
 * in frame coordinates. This is deliberately larger than the idle `preview`
 * crop used by picker thumbnails: work props and the drink glass draw outside
 * that crop and must still keep the mouse.
 *
 * The sheet bounds test measures the PNG alpha channels and fails if any
 * animation grows outside these boxes.
 */
export const PET_HIT_BOXES: Record<
  "cat" | "star" | "hamster" | "jellyfish" | "dog",
  SpriteRect
> = {
  cat: { x: 9, y: 11, w: 30, h: 43 },
  star: { x: 13, y: 1, w: 39, h: 53 },
  hamster: { x: 16, y: 2, w: 39, h: 48 },
  jellyfish: { x: 5, y: 5, w: 48, h: 46 },
  dog: { x: 16, y: 1, w: 37, h: 50 },
};
