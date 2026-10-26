export type Range = readonly [number, number];

/** Map [a, b] onto [0, 1] (clamped), then apply smoothstep. */
export function smooth(a: number, b: number, x: number): number {
  const s = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return s * s * (3 - 2 * s);
}

/** Smoothstep over a [start, end] range. */
export function smoothRange(range: Range, x: number): number {
  return smooth(range[0], range[1], x);
}
