import cat from "./assets/cat.png";
import catheart from "./assets/catheart.png";
import catdrink from "./assets/catdrink.png";
import catwork from "./assets/catwork.png";
import dog from "./assets/dog.png";
import dogheart from "./assets/dogheart.png";
import dogdrink from "./assets/dogdrink.png";
import dogwork from "./assets/dogwork.png";
import star from "./assets/star.png";
import starheart from "./assets/starheart.png";
import stardrink from "./assets/stardrink.png";
import starwork from "./assets/starwork.png";
import hamster from "./assets/hamster.png";
import hamsterheart from "./assets/hamsterheart.png";
import hamsterdrink from "./assets/hamsterdrink.png";
import hamsterwork from "./assets/hamsterwork.png";

export type PetType = "cat" | "dog" | "star" | "hamster";
export type PetMode = "idle" | "happy" | "drink" | "work";

/**
 * Sprite sheets are 64px frames with generous transparent padding, so each
 * mode also carries the crop window (in sprite pixels) that frames the pet.
 */
type Sheet = {
  src: string;
  frames: number;
  /** Full animation cycle; the keyframes traverse the whole strip. */
  step: string;
  win: { x: number; y: number; w: number; h: number };
};

const SHEETS: Record<PetType, Record<PetMode, Sheet>> = {
  cat: {
    idle: { src: cat, frames: 3, step: "0.75s", win: { x: 6, y: 24, w: 36, h: 30 } },
    happy: { src: catheart, frames: 2, step: "0.5s", win: { x: 6, y: 24, w: 36, h: 30 } },
    drink: { src: catdrink, frames: 2, step: "0.6s", win: { x: 6, y: 10, w: 36, h: 46 } },
    work: { src: catwork, frames: 3, step: "0.8s", win: { x: 6, y: 8, w: 36, h: 46 } },
  },
  dog: {
    idle: { src: dog, frames: 3, step: "1.5s", win: { x: 14, y: 19, w: 40, h: 32 } },
    happy: { src: dogheart, frames: 2, step: "0.9s", win: { x: 14, y: 14, w: 36, h: 36 } },
    drink: { src: dogdrink, frames: 2, step: "1.2s", win: { x: 14, y: 7, w: 40, h: 52 } },
    work: { src: dogwork, frames: 3, step: "1.5s", win: { x: 14, y: 12, w: 37, h: 38 } },
  },
  star: {
    idle: { src: star, frames: 3, step: "1.8s", win: { x: 15, y: 18, w: 36, h: 32 } },
    happy: { src: starheart, frames: 2, step: "1.4s", win: { x: 15, y: 6, w: 34, h: 44 } },
    drink: { src: stardrink, frames: 2, step: "1.6s", win: { x: 11, y: 0, w: 42, h: 55 } },
    work: { src: starwork, frames: 3, step: "2.1s", win: { x: 15, y: 0, w: 34, h: 50 } },
  },
  hamster: {
    idle: { src: hamster, frames: 3, step: "2.4s", win: { x: 15, y: 19, w: 32, h: 32 } },
    happy: { src: hamsterheart, frames: 2, step: "1.4s", win: { x: 15, y: 9, w: 32, h: 42 } },
    drink: { src: hamsterdrink, frames: 2, step: "1.6s", win: { x: 15, y: 1, w: 41, h: 50 } },
    work: { src: hamsterwork, frames: 3, step: "2.1s", win: { x: 15, y: 5, w: 32, h: 46 } },
  },
};

/** A pixel pet, cropped tight from the app's own sprite sheets. */
export function Pet({
  pet = "cat",
  mode = "idle",
  size = 96,
  className = "",
  bob = false,
}: {
  pet?: PetType;
  mode?: PetMode;
  size?: number;
  className?: string;
  bob?: boolean;
}) {
  const sheet = SHEETS[pet][mode];
  const scale = size / sheet.win.h;
  return (
    <div
      className="pet-crop"
      style={{ width: scale * sheet.win.w, height: scale * sheet.win.h }}
    >
      <div
        className={`pet pet--${pet} pet--${mode} ${bob ? "pet--bob" : ""} ${className}`.trim()}
        style={{
          width: 64 * scale,
          height: 64 * scale,
          marginLeft: -scale * sheet.win.x,
          marginTop: -scale * sheet.win.y,
          backgroundImage: `url(${sheet.src})`,
          backgroundSize: `${64 * scale * sheet.frames}px ${64 * scale}px`,
          ["--pet-w" as string]: `${64 * scale}px`,
          ["--pet-dur" as string]: sheet.step,
        }}
        aria-hidden="true"
      />
    </div>
  );
}
