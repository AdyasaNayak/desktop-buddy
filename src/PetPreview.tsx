import { PETS, type PetType } from "./pets";

export function PetPreview({
  pet,
  size = 52,
  className,
}: {
  pet: PetType;
  size?: number;
  className?: string;
}) {
  const definition = PETS[pet];
  const frames = definition.frameCount.idle;
  const win = definition.preview;
  const scale = size / win.h;
  return (
    <div
      className={className}
      style={{ width: win.w * scale, height: size, overflow: "hidden", flex: "none" }}
    >
      <div
        className="pet-preview"
        aria-hidden="true"
        style={{
          width: 64 * scale,
          height: 64 * scale,
          marginLeft: -win.x * scale,
          marginTop: -win.y * scale,
          backgroundImage: `url(${definition.sheets.idle})`,
          backgroundSize: `${64 * scale * frames}px ${64 * scale}px`,
          ["--pet-preview-frame-width" as string]: `${64 * scale}px`,
          ["--pet-preview-frames" as string]: frames,
          ["--pet-preview-duration" as string]: `${(frames * definition.frameMs.idle) / 1000}s`,
        }}
      />
    </div>
  );
}
