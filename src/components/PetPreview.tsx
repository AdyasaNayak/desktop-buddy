import { PET_FRAME_SIZE, PETS, type PetType } from "../pet/pets";

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
          width: PET_FRAME_SIZE * scale,
          height: PET_FRAME_SIZE * scale,
          marginLeft: -win.x * scale,
          marginTop: -win.y * scale,
          backgroundImage: `url(${definition.sheets.idle})`,
          backgroundSize: `${PET_FRAME_SIZE * scale * frames}px ${PET_FRAME_SIZE * scale}px`,
          ["--pet-preview-frame-width" as string]: `${PET_FRAME_SIZE * scale}px`,
          ["--pet-preview-frames" as string]: frames,
          ["--pet-preview-duration" as string]: `${(frames * definition.frameMs.idle) / 1000}s`,
        }}
      />
    </div>
  );
}
