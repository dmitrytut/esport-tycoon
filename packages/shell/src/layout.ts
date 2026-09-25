/** Logical size of the 3/4 room; not a final art resolution (ADR 0016). */
export const ROOM_WIDTH = 360;
export const ROOM_HEIGHT = 400;

/** Where the back wall meets the floor in the logical room. */
export const WALL_HEIGHT = 130;

/** Number of hand-drawn placeholder heroes; member i takes placeholder i mod this. */
export const PLACEHOLDER_COUNT = 5;

/** A figure's feet on the floor and its depth scale; nearer figures stand lower and larger. */
export interface FloorSpot {
  /** Feet position in logical room units. */
  readonly x: number;
  readonly y: number;
  /** Size relative to a front-row figure, so the back row reads as further away. */
  readonly depth: number;
}

/** How the logical room sits inside the visible scene rectangle. */
export interface RoomFit {
  /** Uniform fractional scale; never rounded to whole numbers (ADR 0016). */
  readonly scale: number;
  /** Letterbox offsets that center the room. */
  readonly offsetX: number;
  readonly offsetY: number;
}

/** Fits the whole room into the rectangle, letterboxing the remainder. */
export function fitRoom(width: number, height: number): RoomFit {
  const scale = Math.max(0, Math.min(width / ROOM_WIDTH, height / ROOM_HEIGHT));
  return {
    scale,
    offsetX: (width - ROOM_WIDTH * scale) / 2,
    offsetY: (height - ROOM_HEIGHT * scale) / 2,
  };
}

/**
 * Floor spots for a roster in roster order: rows of three from the front, a shorter row
 * centered, so a five-person roster stands three in front and two behind, between them.
 * Returned in roster order; callers sort by `y` for back-to-front drawing.
 */
export function floorSpots(count: number): readonly FloorSpot[] {
  const perRow = 3;
  const rows = Math.max(1, Math.ceil(count / perRow));
  const rowGap = (ROOM_HEIGHT - WALL_HEIGHT - 60) / rows;
  const cell = (ROOM_WIDTH - 60) / perRow;
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / perRow);
    const inRow = Math.min(perRow, count - row * perRow);
    const centering = ((perRow - inRow) * cell) / 2;
    return {
      x: 30 + centering + cell * ((index % perRow) + 0.5),
      y: ROOM_HEIGHT - 28 - row * rowGap,
      depth: 1 - row * 0.14,
    };
  });
}
