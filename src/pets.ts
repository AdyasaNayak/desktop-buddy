import catIdle from "./assets/cat.png";
import catHeart from "./assets/catheart.png";
import catDrink from "./assets/catdrink.png";
import catWork from "./assets/catwork.png";
import starIdle from "./assets/star.png";
import starHeart from "./assets/starheart.png";
import starDrink from "./assets/stardrink.png";
import starWork from "./assets/starwork.png";
import hamsterIdle from "./assets/hamster.png";
import hamsterHeart from "./assets/hamsterheart.png";
import hamsterDrink from "./assets/hamsterdrink.png";
import hamsterWork from "./assets/hamsterwork.png";
import jellyfishIdle from "./assets/jellyfish.png";
import jellyfishHeart from "./assets/jellyfishheart.png";
import jellyfishDrink from "./assets/jellyfishdrink.png";
import jellyfishWork from "./assets/jellyfishwork.png";

export type PetType = "cat" | "star" | "hamster" | "jellyfish";
export type PetState = "idle" | "heart" | "drink" | "work";

/** Every sheet is a horizontal strip of 64×64 frames. */
export interface PetDefinition {
  label: string;
  greeting: string;
  sheets: Record<PetState, string>;
  frameCount: Record<PetState, number>;
  frameMs: Record<PetState, number>;
  preview: { x: number; y: number; w: number; h: number };
}

export const PET_TYPES: PetType[] = ["cat", "star", "hamster", "jellyfish"];

export const PETS: Record<PetType, PetDefinition> = {
  cat: {
    label: "cat",
    greeting: "meow!",
    sheets: {
      idle: catIdle,
      heart: catHeart,
      drink: catDrink,
      work: catWork,
    },
    frameCount: { idle: 3, heart: 2, drink: 2, work: 3 },
    frameMs: { idle: 500, heart: 400, drink: 600, work: 300 },
    preview: { x: 6, y: 24, w: 36, h: 30 },
  },
  star: {
    label: "star",
    greeting: "twinkle!",
    sheets: {
      idle: starIdle,
      heart: starHeart,
      drink: starDrink,
      work: starWork,
    },
    frameCount: { idle: 3, heart: 2, drink: 2, work: 3 },
    // Kept between 1 and 2 fps so the star stays calm and readable.
    frameMs: { idle: 600, heart: 700, drink: 800, work: 700 },
    preview: { x: 15, y: 18, w: 36, h: 32 },
  },
  hamster: {
    label: "hamster",
    greeting: "squeak!",
    sheets: {
      idle: hamsterIdle,
      heart: hamsterHeart,
      drink: hamsterDrink,
      work: hamsterWork,
    },
    frameCount: { idle: 3, heart: 2, drink: 2, work: 3 },
    // Kept between 1 and 2 fps so the hamster stays calm and readable.
    frameMs: { idle: 800, heart: 700, drink: 800, work: 700 },
    preview: { x: 15, y: 19, w: 32, h: 32 },
  },
  jellyfish: {
    label: "jellyfish",
    greeting: "blub!",
    sheets: {
      idle: jellyfishIdle,
      heart: jellyfishHeart,
      drink: jellyfishDrink,
      work: jellyfishWork,
    },
    frameCount: { idle: 3, heart: 2, drink: 2, work: 3 },
    // Kept between 1 and 2 fps so the jellyfish drifts calmly.
    frameMs: { idle: 800, heart: 700, drink: 800, work: 800 },
    preview: { x: 10, y: 14, w: 44, h: 38 },
  },
};

/** Unknown or missing values fall back to the original cat. */
export function toPetType(value: unknown): PetType {
  return value === "star" || value === "hamster" || value === "jellyfish" ? value : "cat";
}
