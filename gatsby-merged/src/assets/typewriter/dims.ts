import { WORLD } from "../../engine/world";

/**
 * Every measurement the typewriter is built from (metres, degrees), in
 * typewriter-local space. Override any field to reshape the machine.
 */
export interface Box {
  /** Centre. */
  c: readonly [number, number, number];
  /** Full size. */
  s: readonly [number, number, number];
}

export interface TypewriterDims {
  platenCenter: readonly [number, number, number];
  platenRadius: number;

  /** Solid parts the type bars must never pass through. */
  base: Box;
  housing: Box;
  sideFrames: readonly Box[];
  carriageBed: Box;
  /** Carriage rail: axis along x at (y, z), radius r. */
  rail: { y: number; z: number; r: number; length: number };

  keys: {
    pitch: number;
    /** Per row, front to back. */
    rowZ: readonly number[];
    rowY: readonly number[];
    rowShift: readonly number[];
    /** How far a key travels when pressed. */
    pressDepth: number;
    /** Forward tilt (degrees) of a fully pressed key cap. */
    tiltDeg: number;
    /** Height of the bottom of the key stems. */
    stemBottom: number;
  };
  spaceBar: { y: number; z: number; width: number };

  bars: {
    /** Pivot to hammer tip. */
    length: number;
    /** Fan half-angle across the basket (degrees). */
    fanDeg: number;
    /** How far a resting bar is folded away from its strike line (degrees). */
    restDeg: number;
  };
}

const [px, py, pz] = WORLD.platenCenter;

export const DEFAULT_DIMS: TypewriterDims = {
  platenCenter: WORLD.platenCenter,
  platenRadius: WORLD.platenRadius,

  base: { c: [0, 0.031, 0], s: [0.37, 0.062, 0.31] },
  housing: { c: [0, 0.1, -0.08], s: [0.33, 0.085, 0.17] },
  sideFrames: [
    { c: [-0.165, 0.125, -0.13], s: [0.03, 0.07, 0.11] },
    { c: [0.165, 0.125, -0.13], s: [0.03, 0.07, 0.11] },
  ],
  // Bed and rail sit behind the platen axis: every bar converges on the printing point
  // (z = pz + radius) from in front and below, so anything forward of the axis is in the swing path.
  carriageBed: { c: [px, py - 0.028, pz - 0.0275], s: [0.38, 0.022, 0.065] },
  rail: { y: 0.158, z: pz - 0.03, r: 0.0038, length: 0.42 },

  keys: {
    pitch: 0.019,
    rowZ: [0.118, 0.092, 0.066, 0.04],
    rowY: [0.075, 0.083, 0.091, 0.099],
    rowShift: [0.0, -0.007, 0.004, 0.012],
    pressDepth: 0.007,
    tiltDeg: 4,
    stemBottom: 0.06,
  },
  spaceBar: { y: 0.07, z: 0.145, width: 0.15 },

  bars: { length: 0.054, fanDeg: 72, restDeg: 130 },
};

/** Axis-aligned boxes that must stay clear of the type bars. The rail is approximated by its bounding box. */
export function solidBoxes(d: TypewriterDims): Box[] {
  return [
    d.base,
    d.housing,
    ...d.sideFrames,
    d.carriageBed,
    { c: [0, d.rail.y, d.rail.z], s: [d.rail.length, d.rail.r * 2, d.rail.r * 2] },
  ];
}
