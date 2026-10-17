import type { CSSProperties } from "react";
import cat from "../assets/cat.png";
import catdrink from "../assets/catdrink.png";
import catheart from "../assets/catheart.png";
import catwork from "../assets/catwork.png";

export type PetMood = "idle" | "happy" | "drink" | "work";

const SPRITES: Record<PetMood, { src: string; frames: number }> = {
  idle: { src: cat, frames: 3 },
  happy: { src: catheart, frames: 2 },
  drink: { src: catdrink, frames: 2 },
  work: { src: catwork, frames: 3 },
};

const FRAME = 64;
const SCALE = 3;

interface PetProps {
  mood?: PetMood;
  /** Show the pet from behind (facing away from the visitor). */
  turnedAway?: boolean;
}

function Pet({ mood = "idle", turnedAway = false }: PetProps) {
  const sprite = SPRITES[mood];
  const width = FRAME * SCALE;
  const style: CSSProperties = {
    backgroundImage: `url(${sprite.src})`,
    backgroundSize: `${sprite.frames * width}px ${width}px`,
    animation: `pet-step-${mood} ${mood === "idle" ? 0.75 : 0.5}s steps(${sprite.frames}) infinite`,
    transform: turnedAway ? "scaleX(-1)" : undefined,
  };

  return (
    <div className="pet-wrap">
      <div
        className="pet"
        style={style}
        role="img"
        aria-label="A small pixel cat, idling softly"
      />
    </div>
  );
}

export default Pet;
