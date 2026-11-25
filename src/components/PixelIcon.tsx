/**
 * Tiny pixel-art icons that match the sprites. Each icon is a 9×9 bitmap:
 * `#` uses the current text color and `o` the same color at lower opacity.
 */
const ICONS = {
  water: [
    "....#....",
    "...###...",
    "..##o##..",
    ".##o####.",
    ".##o####.",
    ".#######.",
    ".#######.",
    "..#####..",
    "...###...",
  ],
  work: [
    ".........",
    ".#######.",
    ".#ooooo#.",
    ".#ooooo#.",
    ".#ooooo#.",
    ".#######.",
    "#########",
    ".#######.",
    ".........",
  ],
  bell: [
    "....#....",
    "...###...",
    "..#####..",
    "..##o##..",
    "..##o##..",
    ".#######.",
    "#########",
    ".........",
    "...###...",
  ],
  moon: [
    "..####...",
    ".###.....",
    "###......",
    "##.......",
    "##.......",
    "###....#.",
    ".###..##.",
    "..#####..",
    "...###...",
  ],
} as const;

export type PixelIconName = keyof typeof ICONS;

export function PixelIcon({
  name,
  size = 18,
}: {
  name: PixelIconName;
  size?: number;
}) {
  const rows = ICONS[name];
  const cells: { x: number; y: number; soft: boolean }[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] !== ".") cells.push({ x, y, soft: row[x] === "o" });
    }
  });
  return (
    <svg
      className="pixel-icon"
      width={size}
      height={size}
      viewBox="0 0 9 9"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {cells.map((cell) => (
        <rect
          key={`${cell.x}-${cell.y}`}
          x={cell.x}
          y={cell.y}
          width={1}
          height={1}
          fill="currentColor"
          opacity={cell.soft ? 0.4 : 1}
        />
      ))}
    </svg>
  );
}
