import { isInside, petHitBox, type Rect } from "./clickThrough";
import {
  GRAVITY,
  MAX_STEP_SECONDS,
  dangleTilt,
  gaitLift,
  hopHeight,
  idleDelay,
  pickWalkTarget,
  springSettled,
  stepSpring,
  walkStep,
  type Spring,
} from "./petMotion";
import { PET_FRAME_SIZE, type PetDefinition, type PetState } from "./pets";

/**
 * The buddy on the canvas: sprite animation plus a thin layer of procedural
 * motion (shadow, hops, squash and stretch, dangling while carried, little
 * pixel emotes) that makes the same sprite sheets feel alive.
 *
 * Performance rules, because this window sits on the desktop all day:
 * - `requestAnimationFrame` only runs while something is actually moving.
 *   A resting buddy sleeps until its next sprite frame is due.
 * - Nothing runs while the window is hidden (Electron keeps hidden windows
 *   "visible" because background throttling is off for the water timers).
 * - All motion is time-based, so speed does not depend on the refresh rate.
 * - The canvas backing store follows devicePixelRatio, so pixel art stays
 *   crisp at 125%/150% Windows scaling and on Retina screens.
 * - Window drags are coalesced to one IPC message per frame.
 */

export type PetReaction = "alert" | "happy" | "boop";
export type PetEntrance = "drop" | "poof" | "none";

export interface PetEngineOptions {
  canvas: HTMLCanvasElement;
  /** Receives --pet-x / --pet-head / --pet-feet so DOM overlays can follow. */
  stage: HTMLElement;
  pet: PetDefinition;
  size: number;
  start: { x: number; y: number } | null;
  entrance: PetEntrance;
  isWorking: () => boolean;
  onHitBoxChange: (box: Rect) => void;
  onClick: () => void;
  moveWindow?: (x: number, y: number) => void;
}

export interface PetEngine {
  /** Stop every timer and listener. Returns where the buddy was standing. */
  dispose: () => { x: number; y: number };
  setVisible: (visible: boolean) => void;
  react: (reaction: PetReaction) => void;
  /** Play the drinking animation for `ms`, measured in wall-clock time. */
  drink: (ms: number) => void;
  /** Something the loop reads (like the work timer) changed. */
  wake: () => void;
}

// ---------- tiny pixel emotes ----------

type ParticleKind = "heart" | "drop" | "z" | "bang" | "sparkle" | "dust";

const BITMAPS: Record<ParticleKind, string[]> = {
  heart: [".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."],
  drop: ["..#..", ".###.", "#####", "#####", ".###."],
  z: ["####", "..#.", ".#..", "####"],
  bang: ["##", "##", "##", "##", "..", "##"],
  sparkle: ["..#..", "..#..", "##.##", "..#..", "..#.."],
  dust: [".#.", "###", ".#."],
};

const COLORS: Record<ParticleKind, { fill: string; edge: string | null }> = {
  heart: { fill: "#ff7a95", edge: "#5a1f2b" },
  drop: { fill: "#7cc8ff", edge: "#1d4a66" },
  z: { fill: "#fff7e6", edge: "#3e2f1e" },
  bang: { fill: "#f2c14e", edge: "#3e2f1e" },
  sparkle: { fill: "#fff3b0", edge: "#8a6a2f" },
  dust: { fill: "rgba(232, 220, 196, 0.85)", edge: null },
};

interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  sway: number;
  cell: number;
}

const MAX_PARTICLES = 24;
const DOUBLE_CLICK_MS = 320;
const DRAG_THRESHOLD = 5;
const DOZE_AFTER_MS = 3 * 60 * 1000;
const FRAME_CAP_MS = 15; // never paint faster than ~60 fps on 120/144 Hz screens

const prefersReducedMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function startPetEngine(options: PetEngineOptions): PetEngine {
  const { canvas, stage, pet, size } = options;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable");
  const scale = size / PET_FRAME_SIZE;
  const hit = pet.hitBox;
  // Local sprite anchor: the middle of the idle body, at its feet. The hit
  // box is wider (it covers props and tail swings), so centring the shadow
  // or the facing flip on it would put them off to one side.
  const body = pet.body;
  const anchorX = (body.x + body.w / 2) * scale;
  const feetY = (body.y + body.h) * scale;
  const headY = body.y * scale;

  // ---------- sprites ----------
  const images = {} as Record<PetState, HTMLImageElement>;
  for (const state of ["idle", "heart", "drink", "work"] as PetState[]) {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      lastPaintKey = "";
      wake();
    };
    image.onerror = () => {
      console.error(`Could not load the ${state} sprite for ${pet.label}`);
    };
    image.src = pet.sheets[state];
    images[state] = image;
  }

  // ---------- state ----------
  let width = window.innerWidth;
  let height = window.innerHeight;
  let dpr = window.devicePixelRatio || 1;
  let groundY = height - size - 10;
  let x = options.start
    ? Math.max(0, Math.min(options.start.x, width - size))
    : width / 2 - size / 2;
  let y = groundY; // the buddy always settles on the ground
  let air = 0; // height above the ground
  let airVelocity = 0;
  let falling = false;
  let facing = 1;
  let squash: Spring = { value: 0, velocity: 0 };
  let tilt: Spring = { value: 0, velocity: 0 };
  let pop: Spring = { value: 1, velocity: 0 };

  let spriteState: PetState = "idle";
  let frame = 0;
  let nextFrameAt = performance.now() + pet.frameMs.idle;
  let drinkUntil = 0;

  type Mode = "rest" | "walk";
  let mode: Mode = "rest";
  let modeUntil = performance.now() + 2500;
  let walkTarget = x;
  let gaitPhase = 0;
  let hop: { start: number; duration: number; height: number } | null = null;
  let queuedHops = 0;

  let hovering = false;
  let pointerX: number | null = null;
  let pointerSeenAt = 0;
  let rubDistance = 0;
  let rubSince = 0;
  let lastInteraction = performance.now();
  let nextHeartAt = 0;
  let nextZAt = 0;
  let nextDropAt = 0;

  let pointerId: number | null = null;
  let dragging = false;
  let dragStart = { x: 0, y: 0 };
  let dragOffset = { x: 0, y: 0 };
  let lastScreenX = 0;
  let lastMoveAt = 0;
  let dragVelocityX = 0;
  let lastClickAt = 0;
  let pendingMove: { x: number; y: number } | null = null;
  let moveFrame = 0;

  const particles: Particle[] = [];

  let visible = true;
  let disposed = false;
  let raf = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastTick = 0;
  let lastPaintKey = "";
  let lastBoxKey = "";
  let lastAnchorKey = "";

  // ---------- canvas sizing ----------
  const resize = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    groundY = height - size - 10;
    y = Math.min(y, groundY);
    x = Math.max(0, Math.min(x, width - size));
    lastPaintKey = "";
    wake();
  };

  // ---------- helpers ----------
  const now = () => performance.now();
  const reducedMotion = prefersReducedMotion();
  const centerX = () => x + anchorX;
  const groundBox = () => petHitBox(x, y, size, hit);
  const petAt = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return isInside(groundBox(), clientX - rect.left, clientY - rect.top);
  };

  const spawn = (
    kind: ParticleKind,
    px: number,
    py: number,
    vx: number,
    vy: number,
    life: number,
    cell = 2.5,
  ) => {
    if (reducedMotion && kind !== "bang") return;
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push({
      kind,
      x: px,
      y: py,
      vx,
      vy,
      life,
      maxLife: life,
      sway: Math.random() * Math.PI * 2,
      cell,
    });
  };

  const startHop = (heightPx: number, durationMs = 380) => {
    if (reducedMotion) return;
    hop = { start: now(), duration: durationMs, height: heightPx };
    squash = { value: 0.12, velocity: 0 }; // stretch on take-off
  };

  const land = () => {
    if (reducedMotion) return;
    squash = { value: -0.2, velocity: 0 }; // squash on landing
    const footY = y + feetY;
    spawn("dust", centerX() - 26, footY - 4, -30, -12, 0.45, 2);
    spawn("dust", centerX() + 20, footY - 4, 30, -12, 0.45, 2);
  };

  const touch = () => {
    lastInteraction = now();
  };

  // ---------- scheduling ----------
  const cancel = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const schedule = (delay: number) => {
    if (disposed || !visible || raf) return;
    if (delay <= 0) {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      raf = requestAnimationFrame(tick);
      return;
    }
    if (timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (!raf && !disposed && visible) raf = requestAnimationFrame(tick);
    }, delay);
  };

  function wake() {
    schedule(0);
  }

  // ---------- update ----------
  const update = (time: number, seconds: number) => {
    // sprite state, in priority order
    const nextState: PetState =
      time < drinkUntil
        ? "drink"
        : options.isWorking()
          ? "work"
          : hovering || dragging
            ? "heart"
            : "idle";
    const dozing =
      nextState === "idle" && !dragging && time - lastInteraction > DOZE_AFTER_MS;
    if (nextState !== spriteState) {
      spriteState = nextState;
      frame = 0;
      nextFrameAt = time + pet.frameMs[spriteState];
    } else if (time >= nextFrameAt) {
      frame = (frame + 1) % pet.frameCount[spriteState];
      // a dozing buddy breathes slower
      nextFrameAt = time + pet.frameMs[spriteState] * (dozing ? 1.8 : 1);
    }

    // wandering: only a calm, idle buddy strolls around
    const canWander =
      spriteState === "idle" && !hovering && !dragging && !falling && !dozing;
    if (!canWander) {
      if (mode === "walk") mode = "rest";
      modeUntil = Math.max(modeUntil, time + 1500);
    } else if (mode === "walk") {
      const before = x;
      x = walkStep(x, walkTarget, seconds);
      gaitPhase += seconds;
      if (x !== before) facing = x > before ? 1 : -1;
      if (x === walkTarget) {
        mode = "rest";
        modeUntil = time + 4000 + Math.random() * 5000;
      }
    } else if (time >= modeUntil) {
      const roll = Math.random();
      if (roll < 0.62) {
        const target = pickWalkTarget(x, 6, width - size - 6, Math.random());
        if (target !== null) {
          walkTarget = target;
          mode = "walk";
          gaitPhase = 0;
        } else {
          modeUntil = time + 3000;
        }
      } else if (roll < 0.8) {
        facing = -facing; // look around
        modeUntil = time + 1800 + Math.random() * 2500;
      } else {
        startHop(12, 340); // a happy little hop
        modeUntil = time + 3500 + Math.random() * 4000;
      }
    }

    // look toward a nearby cursor while resting
    if (
      mode === "rest" &&
      !dragging &&
      pointerX !== null &&
      time - pointerSeenAt < 2500
    ) {
      const dx = pointerX - centerX();
      if (Math.abs(dx) > 36) facing = dx > 0 ? 1 : -1;
    }

    // hops
    if (hop && time - hop.start >= hop.duration) {
      hop = null;
      land();
      if (queuedHops > 0) {
        queuedHops -= 1;
        startHop(14, 300);
      }
    }

    // lifted while carried, then a real fall on release
    if (dragging && options.moveWindow) {
      air += (12 - air) * Math.min(1, seconds * 16);
    } else if (falling) {
      airVelocity += GRAVITY * seconds;
      air -= airVelocity * seconds;
      if (air <= 0) {
        air = 0;
        airVelocity = 0;
        falling = false;
        land();
      }
    }

    // springs
    squash = stepSpring(squash, 0, 320, 13, seconds);
    pop = stepSpring(pop, 1, 260, 16, seconds);
    const tiltTarget = dragging && !reducedMotion ? dangleTilt(dragVelocityX) : 0;
    dragVelocityX *= Math.max(0, 1 - seconds * 6);
    tilt = stepSpring(tilt, tiltTarget, 140, 9, seconds);

    // emotes
    const head = y + headY - air;
    if (spriteState === "heart" && hovering && !dragging && time >= nextHeartAt) {
      spawn("heart", centerX() + (Math.random() * 40 - 20), head + 6, 0, -34, 1.3);
      nextHeartAt = time + 750;
    }
    if (dozing && time >= nextZAt) {
      spawn("z", centerX() + 18, head + 2, 10, -16, 2.2);
      nextZAt = time + 2400;
    }
    if (spriteState === "drink" && time >= nextDropAt) {
      spawn("drop", centerX() - 10 + Math.random() * 20, head + 10, 0, -26, 0.9, 2);
      nextDropAt = time + 650;
    }
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const particle = particles[i];
      particle.life -= seconds;
      if (particle.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      particle.sway += seconds * 5;
      particle.x += particle.vx * seconds + Math.sin(particle.sway) * 0.25;
      particle.y += particle.vy * seconds;
    }

    // hit box and overlay anchors follow the ground position only, so the
    // bubble and menu stay steady while the buddy hops
    const box = groundBox();
    const boxKey = `${Math.round(box.x)}:${Math.round(box.y)}`;
    if (boxKey !== lastBoxKey) {
      lastBoxKey = boxKey;
      options.onHitBoxChange(box);
    }
    const anchorKey = `${Math.round(centerX())}:${Math.round(y + headY)}`;
    if (anchorKey !== lastAnchorKey) {
      lastAnchorKey = anchorKey;
      stage.style.setProperty("--pet-x", `${Math.round(centerX())}px`);
      stage.style.setProperty("--pet-head", `${Math.round(y + headY)}px`);
      stage.style.setProperty("--pet-feet", `${Math.round(y + feetY)}px`);
    }
  };

  const isAnimating = () =>
    mode === "walk" ||
    hop !== null ||
    falling ||
    dragging ||
    air > 0.01 ||
    particles.length > 0 ||
    !springSettled(squash) ||
    !springSettled(tilt) ||
    !springSettled(pop, 1);

  // ---------- render ----------
  const render = (time: number) => {
    const hopLift = hop
      ? hopHeight((time - hop.start) / hop.duration, hop.height)
      : 0;
    const gait =
      mode === "walk" && !reducedMotion ? gaitLift(gaitPhase, 3) : 0;
    const lift = air + hopLift + gait;
    const sy = (1 + squash.value) * pop.value;
    const sx = (1 - squash.value * 0.6) * pop.value;
    const key = [
      spriteState,
      frame,
      Math.round(x * dpr),
      Math.round(lift * dpr),
      facing,
      Math.round(sx * 200),
      Math.round(sy * 200),
      Math.round(tilt.value * 200),
      particles.length > 0 ? time : 0,
    ].join(":");
    if (key === lastPaintKey) return;
    lastPaintKey = key;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = false;

    const cx = centerX();
    const ground = y + feetY;
    // the shadow sits just under the feet so the buddy stands on it
    const shadowY = ground + 1;

    // soft pixel shadow that shrinks as the buddy leaves the ground
    const shadowScale = Math.max(0.35, 1 - lift / 70);
    const shadowWidth = body.w * scale * 1.05 * shadowScale;
    ctx.fillStyle = `rgba(30, 22, 12, ${0.24 * shadowScale})`;
    const cell = 2.5;
    ctx.fillRect(
      Math.round(cx - shadowWidth / 2),
      Math.round(shadowY - cell),
      Math.round(shadowWidth),
      cell * 2,
    );
    ctx.fillRect(
      Math.round(cx - shadowWidth * 0.36),
      Math.round(shadowY - cell * 2),
      Math.round(shadowWidth * 0.72),
      cell * 4,
    );

    const image = images[spriteState];
    if (image.complete && image.naturalWidth > 0) {
      ctx.save();
      ctx.translate(cx, ground - lift);
      if (Math.abs(tilt.value) > 0.001) {
        // carried by the scruff: swing around the top of the head
        const pivot = feetY - headY;
        ctx.translate(0, -pivot);
        ctx.rotate(tilt.value);
        ctx.translate(0, pivot);
      }
      ctx.scale(facing * sx, sy);
      ctx.drawImage(
        image,
        frame * PET_FRAME_SIZE,
        0,
        PET_FRAME_SIZE,
        PET_FRAME_SIZE,
        -anchorX,
        -feetY,
        size,
        size,
      );
      ctx.restore();
    }

    for (const particle of particles) drawParticle(particle);
    ctx.globalAlpha = 1;
  };

  const drawParticle = (particle: Particle) => {
    const rows = BITMAPS[particle.kind];
    const { fill, edge } = COLORS[particle.kind];
    const fade = Math.min(1, particle.life / 0.35, (particle.maxLife - particle.life) / 0.12 + 0.2);
    ctx.globalAlpha = Math.max(0, Math.min(1, fade));
    const c = particle.cell;
    const left = Math.round(particle.x - (rows[0].length * c) / 2);
    const top = Math.round(particle.y - (rows.length * c) / 2);
    const paint = (offsetX: number, offsetY: number) => {
      rows.forEach((row, r) => {
        for (let col = 0; col < row.length; col += 1) {
          if (row[col] === "#") {
            ctx.fillRect(left + col * c + offsetX, top + r * c + offsetY, c, c);
          }
        }
      });
    };
    if (edge) {
      // a one-cell outline keeps emotes readable on any wallpaper
      ctx.fillStyle = edge;
      paint(-c, 0);
      paint(c, 0);
      paint(0, -c);
      paint(0, c);
    }
    ctx.fillStyle = fill;
    paint(0, 0);
  };

  // ---------- loop ----------
  function tick(time: number) {
    raf = 0;
    if (disposed || !visible) return;
    if (lastTick && time - lastTick < FRAME_CAP_MS) {
      raf = requestAnimationFrame(tick);
      return;
    }
    if ((window.devicePixelRatio || 1) !== dpr) resize();
    const seconds = lastTick
      ? Math.min((time - lastTick) / 1000, MAX_STEP_SECONDS)
      : 1 / 60;
    lastTick = time;
    update(time, seconds);
    render(time);

    if (isAnimating()) {
      schedule(0);
    } else {
      // sleep until the next sprite frame or the next decision
      lastTick = 0;
      schedule(
        idleDelay(
          nextFrameAt - time,
          mode === "rest" ? modeUntil - time : 0,
          drinkUntil > time ? drinkUntil - time : Infinity,
          time - lastInteraction < DOZE_AFTER_MS
            ? DOZE_AFTER_MS - (time - lastInteraction)
            : Infinity,
        ),
      );
    }
  }

  // ---------- input ----------
  const handleMouseMove = (event: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    const over = isInside(groundBox(), mx, my);
    const time = now();
    if (over && pointerX !== null && hovering) {
      // rubbing back and forth over the buddy counts as petting
      if (time - rubSince > 1200) {
        rubSince = time;
        rubDistance = 0;
      }
      rubDistance += Math.abs(mx - pointerX);
      if (rubDistance > 420) {
        rubDistance = 0;
        rubSince = time;
        for (let i = 0; i < 3; i += 1) {
          spawn("heart", centerX() - 24 + i * 24, y + headY, (i - 1) * 18, -48, 1.4);
        }
        if (!hop) startHop(10, 300);
      }
    }
    pointerX = mx;
    pointerSeenAt = time;
    if (over !== hovering) {
      hovering = over;
      if (over) {
        touch();
        nextHeartAt = time + 250;
      }
    }
    if (!dragging) canvas.style.cursor = over ? "grab" : "default";
    wake();
  };

  const handleMouseLeave = () => {
    hovering = false;
    pointerX = null;
    if (!dragging) canvas.style.cursor = "default";
    wake();
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !petAt(event.clientX, event.clientY)) return;
    const rect = canvas.getBoundingClientRect();
    pointerId = event.pointerId;
    dragging = false;
    dragStart = { x: event.clientX, y: event.clientY };
    dragOffset = { x: event.clientX - rect.left - x, y: event.clientY - rect.top - y };
    lastScreenX = event.screenX;
    lastMoveAt = now();
    dragVelocityX = 0;
    canvas.setPointerCapture(event.pointerId);
    touch();
    event.preventDefault();
  };

  const flushMove = () => {
    moveFrame = 0;
    if (!pendingMove || !options.moveWindow) return;
    const { x: nx, y: ny } = pendingMove;
    pendingMove = null;
    options.moveWindow(nx, ny);
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    if (
      !dragging &&
      Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y) >
        DRAG_THRESHOLD
    ) {
      dragging = true;
      mode = "rest";
      hop = null;
      falling = false;
      airVelocity = 0;
      canvas.style.cursor = "grabbing";
      if (!reducedMotion) squash = { value: 0.08, velocity: 0 };
    }
    if (!dragging) return;

    const time = now();
    const dt = Math.max(1, time - lastMoveAt) / 1000;
    const instant = (event.screenX - lastScreenX) / dt;
    dragVelocityX = dragVelocityX * 0.6 + instant * 0.4;
    lastScreenX = event.screenX;
    lastMoveAt = time;

    if (options.moveWindow) {
      // The window moves under a still buddy. Coalesce the hundreds of
      // pointer events a fast mouse produces into one move per frame.
      pendingMove = {
        x: event.screenX - (x + dragOffset.x),
        y: event.screenY - (y + dragOffset.y),
      };
      if (!moveFrame) moveFrame = requestAnimationFrame(flushMove);
    } else {
      const rect = canvas.getBoundingClientRect();
      x = Math.max(0, Math.min(event.clientX - rect.left - dragOffset.x, width - size));
      const wantY = event.clientY - rect.top - dragOffset.y;
      air = Math.max(0, Math.min(groundY - wantY, groundY));
    }
    touch();
    wake();
    event.preventDefault();
  };

  const handlePointerUp = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    pointerId = null;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    if (moveFrame) {
      cancelAnimationFrame(moveFrame);
      flushMove();
    }
    const wasDragging = dragging;
    dragging = false;
    canvas.style.cursor = hovering ? "grab" : "default";
    if (wasDragging) {
      // let go: drop back to the ground
      falling = air > 0.5;
      airVelocity = 0;
      if (!falling) air = 0;
      modeUntil = now() + 2500;
    } else if (event.type === "pointerup") {
      const time = now();
      if (time - lastClickAt < DOUBLE_CLICK_MS) {
        // the second click of a double-click is a happy jump, not another
        // menu toggle (which used to close the menu it just opened)
        lastClickAt = 0;
        startHop(26, 460);
        spawn("heart", centerX() - 14, y + headY, -20, -50, 1.3);
        spawn("heart", centerX() + 14, y + headY, 20, -50, 1.3);
      } else {
        lastClickAt = time;
        if (!reducedMotion) squash = { value: -0.12, velocity: 0 };
        spawn("sparkle", centerX() + 26, y + headY + 10, 14, -26, 0.5, 2);
        options.onClick();
      }
    }
    touch();
    wake();
  };

  canvas.addEventListener("mousemove", handleMouseMove);
  canvas.addEventListener("mouseleave", handleMouseLeave);
  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", handlePointerUp);
  window.addEventListener("resize", resize);
  resize();

  // ---------- entrance ----------
  const enter = (entrance: PetEntrance) => {
    if (reducedMotion || entrance === "none") return;
    if (entrance === "drop") {
      air = Math.min(groundY + headY, 150);
      airVelocity = 0;
      falling = true;
    } else {
      pop = { value: 0.55, velocity: 0 };
      const cx = centerX();
      const cy = y + (headY + feetY) / 2;
      for (let i = 0; i < 8; i += 1) {
        const angle = (i / 8) * Math.PI * 2;
        spawn("sparkle", cx, cy, Math.cos(angle) * 70, Math.sin(angle) * 70, 0.6, 2);
      }
    }
  };
  enter(options.entrance);
  wake();

  return {
    dispose() {
      disposed = true;
      cancel();
      if (moveFrame) cancelAnimationFrame(moveFrame);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerUp);
      for (const image of Object.values(images)) {
        image.onload = null;
        image.onerror = null;
      }
      return { x, y };
    },
    setVisible(next) {
      if (next === visible) return;
      visible = next;
      if (!visible) {
        cancel();
        return;
      }
      lastTick = 0;
      lastPaintKey = "";
      enter("drop");
      touch();
      wake();
    },
    react(reaction) {
      touch();
      if (reaction === "alert") {
        spawn("bang", centerX(), y + headY - 14, 0, -6, 1.8);
        startHop(14, 300);
        queuedHops = 1;
      } else if (reaction === "happy") {
        startHop(18, 400);
        for (let i = 0; i < 3; i += 1) {
          spawn("heart", centerX() - 20 + i * 20, y + headY, (i - 1) * 16, -44, 1.3);
        }
      } else {
        if (!reducedMotion) squash = { value: -0.12, velocity: 0 };
      }
      wake();
    },
    drink(ms) {
      drinkUntil = Math.max(drinkUntil, now() + ms);
      touch();
      wake();
    },
    wake() {
      lastPaintKey = "";
      wake();
    },
  };
}
