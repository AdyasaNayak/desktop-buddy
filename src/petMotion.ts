/**
 * Small, frame-rate independent motion helpers for the pet. Everything here
 * takes elapsed time explicitly so the buddy moves at the same speed on a
 * 60 Hz laptop and a 144 Hz monitor, and so the rules can be tested in Node.
 */

/** Walking speed in CSS pixels per second. */
export const WALK_SPEED = 46;
/** Seconds per hop while walking. */
export const GAIT_PERIOD = 0.34;
/** Gravity for falls and drops, in CSS pixels per second squared. */
export const GRAVITY = 2400;
/** The longest step a single update may take, so a stall never teleports. */
export const MAX_STEP_SECONDS = 0.1;

export interface Spring {
  value: number;
  velocity: number;
}

/**
 * Advance a damped spring toward `target`. Large steps are split so a slow
 * frame cannot make the spring explode.
 */
export function stepSpring(
  spring: Spring,
  target: number,
  stiffness: number,
  damping: number,
  seconds: number,
): Spring {
  let { value, velocity } = spring;
  let left = Math.min(Math.max(0, seconds), MAX_STEP_SECONDS);
  while (left > 0) {
    const dt = Math.min(left, 1 / 120);
    const force = -stiffness * (value - target) - damping * velocity;
    velocity += force * dt;
    value += velocity * dt;
    left -= dt;
  }
  return { value, velocity };
}

/** True once a spring is close enough to rest that drawing it is pointless. */
export function springSettled(spring: Spring, target = 0): boolean {
  return (
    Math.abs(spring.value - target) < 0.002 && Math.abs(spring.velocity) < 0.02
  );
}

/**
 * Move `x` toward `target` at walking pace, slowing down for the last few
 * pixels so the buddy eases into a stop instead of halting mid-stride.
 */
export function walkStep(x: number, target: number, seconds: number): number {
  const distance = target - x;
  if (Math.abs(distance) < 0.5) return target;
  const speed = Math.min(WALK_SPEED, 14 + Math.abs(distance) * 2.2);
  const step = speed * Math.min(Math.max(0, seconds), MAX_STEP_SECONDS);
  if (step >= Math.abs(distance)) return target;
  return x + Math.sign(distance) * step;
}

/** Height of a hop at `progress` (0..1): a parabola peaking at `height`. */
export function hopHeight(progress: number, height: number): number {
  if (progress <= 0 || progress >= 1) return 0;
  return 4 * height * progress * (1 - progress);
}

/** Bounce of the walking gait at `phase` seconds into a walk. */
export function gaitLift(phase: number, height: number): number {
  const cycle = (phase / GAIT_PERIOD) % 1;
  return Math.abs(Math.sin(cycle * Math.PI)) * height;
}

/**
 * Keep a random walk target inside the window and far enough from the
 * current position to read as a deliberate stroll.
 */
export function pickWalkTarget(
  x: number,
  minX: number,
  maxX: number,
  random: number,
  minDistance = 70,
): number | null {
  if (maxX - minX < minDistance) return null;
  const target = minX + random * (maxX - minX);
  if (Math.abs(target - x) >= minDistance) return target;
  // mirror a short hop to the other side so most rolls still produce a walk
  const mirrored = x + Math.sign(x - target || 1) * minDistance;
  return mirrored >= minX && mirrored <= maxX ? mirrored : null;
}

/**
 * Milliseconds until anything about an idle pet can change, so the loop can
 * sleep instead of polling every display frame.
 */
export function idleDelay(...deadlines: number[]): number {
  const next = Math.min(...deadlines.filter((value) => Number.isFinite(value)));
  if (!Number.isFinite(next)) return 1000;
  return Math.max(16, Math.min(1000, Math.ceil(next)));
}

/** Tilt (radians) for a buddy dangling from the cursor at `velocityX` px/s. */
export function dangleTilt(velocityX: number): number {
  if (velocityX === 0) return 0;
  return Math.max(-0.4, Math.min(0.4, -velocityX * 0.0007));
}
