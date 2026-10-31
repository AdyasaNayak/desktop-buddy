import catIdle from "./assets/cat.png";
import catHeart from "./assets/catheart.png";
import catDrink from "./assets/catdrink.png";
import catWork from "./assets/catwork.png";
import dogIdle from "./assets/dog.png";
import dogHeart from "./assets/dogheart.png";
import dogDrink from "./assets/dogdrink.png";
import dogWork from "./assets/dogwork.png";
import starIdle from "./assets/star.png";
import starHeart from "./assets/starheart.png";
import starDrink from "./assets/stardrink.png";
import starWork from "./assets/starwork.png";

export type PetType = "cat" | "dog" | "star";
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

export const PET_TYPES: PetType[] = ["cat", "dog", "star"];

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
  dog: {
    label: "dog",
    greeting: "woof!",
    sheets: {
      idle: dogIdle,
      heart: dogHeart,
      drink: dogDrink,
      work: dogWork,
    },
    frameCount: { idle: 3, heart: 2, drink: 2, work: 3 },
    frameMs: { idle: 500, heart: 450, drink: 600, work: 500 },
    preview: { x: 14, y: 19, w: 40, h: 32 },
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
};

/** Unknown or missing values fall back to the original cat. */
export function toPetType(value: unknown): PetType {
  return value === "dog" || value === "star" ? value : "cat";
}
