/** Temporary arrangements for comparing visibility, not a final sprite grid. */
export type LayoutProbe = "front" | "isometric";

/** Logical positions of the same fifteen figures in both probes. */
export interface FigurePosition {
  /** Center of the figure in the 320×180 probe room. */
  readonly x: number;
  readonly y: number;
}

/** A logical 320×180 room; positions are stable under viewport changes. */
export function figurePositions(layout: LayoutProbe): readonly FigurePosition[] {
  return Array.from({ length: 15 }, (_, index) => {
    const column = index % 5;
    const row = Math.floor(index / 5);
    return layout === "front"
      ? { x: 40 + column * 58, y: 36 + row * 54 }
      : { x: 38 + column * 55 + row * 12, y: 50 + row * 42 - column * 5 };
  });
}

/** Screens too small for the logical room clip it instead of blurring fractional pixels. */
export function sceneScale(width: number, height: number): number {
  return Math.max(1, Math.floor(Math.min(width / 320, height / 180)));
}
