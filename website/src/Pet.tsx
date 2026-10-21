import cat from "./assets/cat.png";
import catheart from "./assets/catheart.png";
import catdrink from "./assets/catdrink.png";
import catwork from "./assets/catwork.png";

export type PetMode = "idle" | "happy" | "drink" | "work";

/**
 * Sprite sheets are 64px frames with generous transparent padding, so each
 * mode also carries the crop window (in sprite pixels) that frames the cat.
 */
const SHEETS: Record<
  PetMode,
  { src: string; frames: number; step: string; win: { x: number; y: number; w: number; h: number } }
> = {
  idle: { src: cat, frames: 3, step: "0.75s", win: { x: 6, y: 24, w: 36, h: 30 } },
  happy: { src: catheart, frames: 2, step: "0.5s", win: { x: 6, y: 24, w: 36, h: 30 } },
  drink: { src: catdrink, frames: 2, step: "0.6s", win: { x: 6, y: 10, w: 36, h: 46 } },
  work: { src: catwork, frames: 3, step: "0.8s", win: { x: 6, y: 8, w: 36, h: 46 } },
};

/** The pixel cat, cropped tight from the app's own sprite sheets. */
export function Pet({
  mode = "idle",
  size = 96,
  className = "",
  bob = false,
}: {
  mode?: PetMode;
  size?: number;
  className?: string;
  bob?: boolean;
}) {
  const sheet = SHEETS[mode];
  const scale = size / sheet.win.h;
  return (
    <div
      className="pet-crop"
      style={{ width: scale * sheet.win.w, height: scale * sheet.win.h }}
    >
      <div
        className={`pet pet--${mode} ${bob ? "pet--bob" : ""} ${className}`.trim()}
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
