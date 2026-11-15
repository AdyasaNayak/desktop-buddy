const test = require("node:test");
const assert = require("node:assert/strict");
const {
  INITIAL_CLICK_THROUGH_STATE,
  afterPointerLeft,
  afterWindowShown,
  clickThroughFor,
  withClickThrough,
  withPointer,
  withPressed,
  withRemotePointer,
} = require("../src/clickThrough.ts");

test("a pet view starts click-through before any pointer report", () => {
  assert.equal(
    clickThroughFor(INITIAL_CLICK_THROUGH_STATE, () => true),
    true,
  );
  assert.equal(
    clickThroughFor(INITIAL_CLICK_THROUGH_STATE, () => false),
    true,
  );
});

test("the pointer over the pet takes the mouse back", () => {
  const state = withPointer(INITIAL_CLICK_THROUGH_STATE, { x: 10, y: 20 });
  assert.equal(clickThroughFor(state, () => true), false);
  assert.equal(clickThroughFor(state, () => false), true);
});

test("a remote pointer outside clears the point unless dragging", () => {
  const inside = withRemotePointer(INITIAL_CLICK_THROUGH_STATE, {
    x: 10,
    y: 20,
    inside: true,
  });
  assert.deepEqual(inside.point, { x: 10, y: 20 });

  const outside = withRemotePointer(inside, { x: -5, y: 20, inside: false });
  assert.equal(outside.point, null);

  const dragging = withPressed(inside, true);
  assert.equal(
    withRemotePointer(dragging, { x: -5, y: 20, inside: false }),
    dragging,
  );
});

test("leaving the window clears the point unless a button is held", () => {
  const pointed = withPointer(INITIAL_CLICK_THROUGH_STATE, { x: 8, y: 9 });
  const left = afterPointerLeft(pointed, 0);
  assert.equal(left.point, null);
  assert.equal(left.pressed, false);

  const dragging = afterPointerLeft(withPressed(pointed, true), 1);
  assert.equal(dragging.pressed, true);
  assert.deepEqual(dragging.point, { x: 8, y: 9 });
});

test("pressed state only changes when the value changes", () => {
  const pressed = withPressed(INITIAL_CLICK_THROUGH_STATE, true);
  assert.equal(withPressed(pressed, true), pressed);
  assert.equal(withPressed(pressed, false).pressed, false);
});

test("showing the window drops the cached click-through value", () => {
  const applied = withClickThrough(INITIAL_CLICK_THROUGH_STATE, true);
  assert.equal(applied.ignoring, true);
  assert.equal(withClickThrough(applied, true), applied);

  const shown = afterWindowShown(applied);
  assert.equal(shown.ignoring, null);
  assert.deepEqual(shown.point, applied.point);
});
