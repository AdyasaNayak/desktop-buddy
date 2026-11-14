const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isInside,
  isInteractivePoint,
  petHitBox,
} = require("../src/clickThrough.ts");

const CAT_PREVIEW = { x: 6, y: 24, w: 36, h: 30 };

test("the pet hit box follows the visible body, not the full draw box", () => {
  assert.deepEqual(petHitBox(40, 90, 160, CAT_PREVIEW), {
    x: 55,
    y: 150,
    width: 90,
    height: 75,
  });
});

test("the transparent halo around the pet is not interactive", () => {
  const hitBox = petHitBox(40, 90, 160, CAT_PREVIEW);
  assert.equal(isInside(hitBox, 60, 160), true);
  // inside the 160x160 draw box, but left of the visible cat
  assert.equal(isInside(hitBox, 45, 160), false);
  assert.equal(isInside(hitBox, 150, 200), false);
});

test("the pet, menus, and dialogs keep the mouse", () => {
  const pet = petHitBox(0, 0, 160, CAT_PREVIEW);
  const noElement = () => null;
  assert.equal(isInteractivePoint(50, 100, pet, noElement), true);
  assert.equal(isInteractivePoint(5, 10, null, noElement), false);

  const button = { closest: () => ({}) };
  assert.equal(isInteractivePoint(5, 10, null, () => button), true);
});
