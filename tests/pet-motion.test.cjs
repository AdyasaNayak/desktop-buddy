const test = require("node:test");
const assert = require("node:assert/strict");
const {
  GAIT_PERIOD,
  MAX_STEP_SECONDS,
  WALK_SPEED,
  dangleTilt,
  gaitLift,
  hopHeight,
  idleDelay,
  pickWalkTarget,
  springSettled,
  stepSpring,
  walkStep,
} = require("../src/pet/petMotion.ts");

test("walking speed does not depend on the frame rate", () => {
  // one second of walking at 60 Hz and at 144 Hz covers the same ground
  let at60 = 0;
  for (let i = 0; i < 60; i += 1) at60 = walkStep(at60, 1000, 1 / 60);
  let at144 = 0;
  for (let i = 0; i < 144; i += 1) at144 = walkStep(at144, 1000, 1 / 144);
  assert.ok(Math.abs(at60 - at144) < 0.5, `${at60} vs ${at144}`);
  assert.ok(Math.abs(at60 - WALK_SPEED) < 0.5);
});

test("a walk eases into its target and never overshoots", () => {
  let x = 0;
  for (let i = 0; i < 600; i += 1) {
    x = walkStep(x, 80, 1 / 60);
    assert.ok(x <= 80);
  }
  assert.equal(x, 80);
  assert.equal(walkStep(80, 0, 1 / 60) < 80, true);
});

test("a stalled frame cannot teleport the buddy", () => {
  const moved = walkStep(0, 1000, 5);
  assert.ok(moved <= WALK_SPEED * MAX_STEP_SECONDS + 1e-9);
});

test("hops are parabolas that start and end on the ground", () => {
  assert.equal(hopHeight(0, 20), 0);
  assert.equal(hopHeight(1, 20), 0);
  assert.equal(hopHeight(0.5, 20), 20);
  assert.ok(hopHeight(0.25, 20) < 20);
  assert.equal(gaitLift(0, 3), 0);
  assert.ok(Math.abs(gaitLift(GAIT_PERIOD / 2, 3) - 3) < 1e-9);
});

test("springs settle back to their target", () => {
  let spring = { value: -0.2, velocity: 0 };
  for (let i = 0; i < 120; i += 1)
    spring = stepSpring(spring, 0, 320, 13, 1 / 60);
  assert.ok(springSettled(spring));
  // a huge step is split up instead of exploding
  const big = stepSpring({ value: 1, velocity: 0 }, 0, 320, 13, 10);
  assert.ok(Number.isFinite(big.value) && Math.abs(big.value) <= 1);
});

test("walk targets stay inside the window and far enough away", () => {
  for (const roll of [0, 0.1, 0.5, 0.9, 1]) {
    const target = pickWalkTarget(100, 6, 194, roll);
    if (target === null) continue;
    assert.ok(target >= 6 && target <= 194);
    assert.ok(Math.abs(target - 100) >= 70);
  }
  assert.equal(pickWalkTarget(10, 0, 40, 0.5), null);
});

test("an idle buddy sleeps until the next change, within sane bounds", () => {
  assert.equal(idleDelay(500, 2000), 500);
  assert.equal(idleDelay(2, 2000), 16);
  assert.equal(idleDelay(Infinity, 5000), 1000);
  assert.equal(idleDelay(), 1000);
});

test("dangling tilts against the drag and is capped", () => {
  assert.ok(dangleTilt(300) < 0);
  assert.ok(dangleTilt(-300) > 0);
  assert.equal(dangleTilt(1e6), -0.4);
  assert.equal(dangleTilt(0), 0);
});
