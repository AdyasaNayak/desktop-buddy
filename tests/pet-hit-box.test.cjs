const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const {
  isInside,
  isInteractivePoint,
  petHitBox,
} = require("../src/clickThrough.ts");
const {
  PET_FRAME_SIZE,
  PET_HIT_BOXES,
} = require("../src/petSprites.ts");

const ASSETS = path.join(__dirname, "..", "src", "assets");
const PET_TYPES = ["cat", "star", "hamster", "jellyfish", "dog"];
const PET_STATES = ["idle", "heart", "drink", "work"];

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpperLeft = Math.abs(estimate - upperLeft);
  if (toLeft <= toUp && toLeft <= toUpperLeft) return left;
  return toUp <= toUpperLeft ? up : upperLeft;
}

function readRgbaPng(file) {
  const png = fs.readFileSync(file);
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.equal(png[24], 8, `${file} must use 8-bit channels`);
  assert.equal(png[25], 6, `${file} must be RGBA`);

  const idat = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") idat.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
    if (type === "IEND") break;
  }

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const pixels = Buffer.alloc(height * stride);
  let previous = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = Buffer.alloc(stride);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
      const up = previous[x];
      const upperLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += Math.floor((left + up) / 2);
      else if (filter === 4) value += paeth(left, up, upperLeft);
      else assert.equal(filter, 0, `${file} uses unknown PNG filter ${filter}`);
      row[x] = value & 0xff;
    }
    row.copy(pixels, y * stride);
    previous = row;
  }

  return { width, height, pixels };
}

/** Visible alpha bounds in frame-local coordinates across every frame. */
function visibleFrameBounds(file) {
  const { width, height, pixels } = readRgbaPng(file);
  assert.equal(height, PET_FRAME_SIZE, `${file} frame height`);
  assert.equal(width % PET_FRAME_SIZE, 0, `${file} frame width`);

  const bounds = {
    minX: PET_FRAME_SIZE,
    minY: PET_FRAME_SIZE,
    maxX: -1,
    maxY: -1,
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] === 0) continue;
      const frameX = x % PET_FRAME_SIZE;
      bounds.minX = Math.min(bounds.minX, frameX);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, frameX);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }
  assert.notEqual(bounds.maxX, -1, `${file} has no visible pixels`);
  return bounds;
}

test("the pet hit box follows the visible body, not the full draw box", () => {
  assert.deepEqual(petHitBox(0, 0, 128, PET_HIT_BOXES.cat), {
    x: 18,
    y: 22,
    width: 60,
    height: 86,
  });
});

test("work props above the idle crop still keep the mouse", () => {
  const hitBox = petHitBox(0, 0, PET_FRAME_SIZE, PET_HIT_BOXES.cat);
  // the cat's work lightbulb sits above row 24, where the idle preview starts
  assert.equal(isInside(hitBox, 20, 11), true);
});

test("the transparent halo around the pet is not interactive", () => {
  const hitBox = petHitBox(40, 90, 160, PET_HIT_BOXES.cat);
  assert.equal(isInside(hitBox, 70, 130), true);
  // inside the 160x160 draw box, but left of the visible cat
  assert.equal(isInside(hitBox, 45, 160), false);
  assert.equal(isInside(hitBox, 150, 200), false);
});

test("the pet, menus, and dialogs keep the mouse", () => {
  const pet = petHitBox(0, 0, 160, PET_HIT_BOXES.cat);
  const noElement = () => null;
  assert.equal(isInteractivePoint(50, 100, pet, noElement), true);
  assert.equal(isInteractivePoint(5, 10, null, noElement), false);

  const button = { closest: () => ({}) };
  assert.equal(isInteractivePoint(5, 10, null, () => button), true);
});

for (const pet of PET_TYPES) {
  for (const state of PET_STATES) {
    test(`${pet} ${state} sheet fits inside the pet hit box`, () => {
      const file = path.join(
        ASSETS,
        state === "idle" ? `${pet}.png` : `${pet}${state}.png`,
      );
      const bounds = visibleFrameBounds(file);
      const box = PET_HIT_BOXES[pet];
      const label = `${pet} ${state}`;
      assert.ok(
        bounds.minX >= box.x,
        `${label} starts at x=${bounds.minX}, before hit box x=${box.x}`,
      );
      assert.ok(
        bounds.minY >= box.y,
        `${label} starts at y=${bounds.minY}, before hit box y=${box.y}`,
      );
      assert.ok(
        bounds.maxX < box.x + box.w,
        `${label} reaches x=${bounds.maxX}, past hit box right edge`,
      );
      assert.ok(
        bounds.maxY < box.y + box.h,
        `${label} reaches y=${bounds.maxY}, past hit box bottom edge`,
      );
    });
  }
}
