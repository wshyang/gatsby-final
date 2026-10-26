import * as THREE from "three";
import type { CameraFrame } from "../engine/CameraRig";
import type { Range } from "../engine/easing";
import { mulberry32 } from "../engine/GlyphAtlas";
import type { Timeline } from "../engine/Timeline";
import type { SourceGlyph, TargetSlot } from "./TextLayout";

/**
 * Mapping
 * -------
 * Connects glyphs that physically exist on paper (SourceGlyph) with cells of
 * the floating quote (TargetSlot) and bakes the result into per-instance GPU
 * attributes.
 *
 *   paper surface ──poseAt(u,v)──▶ SourceGlyph ──assignment──▶ TargetSlot
 *                                      │                           │
 *                                  aOrigin/aOriginQuat        aTarget/aTargetQuat
 *
 * Every particle therefore has a provable origin on a paper mesh; nothing is
 * ever emitted from empty space.
 *
 * Particle kinds (aTiming.w):
 *   1  member : flies from its paper origin to a quote slot and locks in
 *   0  chaff  : lifts off and settles into the drifting "sea" of letters
 *
 * Every glyph on every page lifts; none stay behind.
 */

export const KIND_CHAFF = 0;
export const KIND_MEMBER = 1;

/** Slowest a member may take to land, however late it lifts. */
const MIN_MEMBER_FLIGHT = 2.5;
/** Seconds between neighbouring letters of the typed line leaving the paper. */
const TYPED_LIFT_STAGGER = 0.05;
/** Seconds between neighbouring words (in reading order) leaving the pages. */
const WORD_LIFT_STAGGER = 0.22;
/** Seconds between letters of a harvested word. */
const LETTER_LIFT_STAGGER = 0.06;
/** Distance from the wave origin (m) at which the chaff lift wave has fully spread. */
const WAVE_RADIUS = 0.55;
/** Lift-off wave origin: the front of the typewriter, sweeping outward over the pages. */
const WAVE_ORIGIN = new THREE.Vector3(0, 0.1, -0.02);
/** Glyph height as a fraction of the frame, before the random factor (opus: 0.0175 * 1.45). */
const SEA_SIZE_FRACTION = 0.0175 * 1.45;

export interface Assignment {
  slot: TargetSlot;
  source: SourceGlyph;
  liftTime: number;
}

export interface MappingStats {
  sources: number;
  members: number;
  chaff: number;
  identityMapped: number;
  searchMapped: number;
  fallbackClones: number;
}

export function emptyStats(): MappingStats {
  return { sources: 0, members: 0, chaff: 0, identityMapped: 0, searchMapped: 0, fallbackClones: 0 };
}

/* ------------------------------------------------------------------ */
/*  1. Assignment                                                      */
/* ------------------------------------------------------------------ */

const lerpRange = (r: Range, u: number) => r[0] + (r[1] - r[0]) * u;

/**
 * Decide which paper glyph travels to which quote slot.
 *
 * - "typed"  slots consume the live-typed line in column order (identity).
 * - "pages"  slots harvest glyphs from the scattered pages. For each word a
 *            random "harvest seed" is chosen on the pages and every letter of
 *            the word is taken from the nearest unused glyph with the same
 *            character, so the letters of one word lift off from the same
 *            neighbourhood and travel together as a readable swarm.
 *
 * A member lifts as late as its flight allows (arrival - flight) but never
 * before `memberLiftStart`, so the quote is read in order as it lifts.
 */
export function assignSlots(
  sources: SourceGlyph[],
  slots: readonly TargetSlot[],
  typedGlyphs: readonly SourceGlyph[],
  timeline: Timeline,
  stats: MappingStats,
  seed = 99,
): Assignment[] {
  const rnd = mulberry32(seed);
  const used = new Set<number>();
  const assignments: Assignment[] = [];
  const floor = timeline.memberLiftStart;

  // Index pages glyphs by character for fast matching (sheet glyphs excluded:
  // the sheet is the typed page, we harvest only from the scattered pages).
  const typedIds = new Set(typedGlyphs.map((g) => g.id));
  const byChar = new Map<string, SourceGlyph[]>();
  for (const g of sources) {
    if (g.onCarriage || typedIds.has(g.id)) continue;
    let arr = byChar.get(g.char);
    if (!arr) byChar.set(g.char, (arr = []));
    arr.push(g);
  }

  // --- identity mapping of the typed line ------------------------------
  let typedCursor = 0;
  for (const slot of slots) {
    if (slot.source !== "typed") continue;
    const g = typedGlyphs[typedCursor];
    if (g && g.char === slot.char) {
      used.add(g.id);
      const lift = Math.max(floor + typedCursor * TYPED_LIFT_STAGGER + rnd() * 0.04, slot.arrival - lerpRange(timeline.memberFlight, rnd()));
      assignments.push({ slot, source: g, liftTime: lift });
      stats.identityMapped++;
      typedCursor++;
    } else {
      // Typed line and quote diverged: harvest from the pages instead.
      const alt = harvest(slot, byChar, used, null, sources, stats);
      const lift = Math.max(floor + 0.6 + rnd() * 0.5, slot.arrival - lerpRange(timeline.memberFlight, rnd()));
      assignments.push({ slot, source: alt, liftTime: lift });
    }
  }

  // --- nearest-neighbour harvesting for the remaining lines ----------------
  const pageGlyphs = sources.filter((g) => !g.onCarriage);
  let currentWord = -1;
  let currentLine = -1;
  let seedPoint: THREE.Vector3 | null = null;
  let wordLift = 0;
  for (const slot of slots) {
    if (slot.source !== "pages") continue;
    if (slot.word !== currentWord || slot.line !== currentLine) {
      currentWord = slot.word;
      currentLine = slot.line;
      seedPoint = pageGlyphs.length > 0 ? pageGlyphs[Math.floor(rnd() * pageGlyphs.length)].position : null;
      // Words lift as groups, in reading order, as late as their flight allows.
      const firstArrival = slot.arrival - slot.charInWord * 0.045;
      const earliest = floor + 0.1 + (slot.line * 6 + slot.word) * WORD_LIFT_STAGGER + rnd() * 0.25;
      wordLift = Math.max(earliest, firstArrival - lerpRange(timeline.memberFlight, rnd()));
    }
    const g = harvest(slot, byChar, used, seedPoint, sources, stats);
    assignments.push({ slot, source: g, liftTime: wordLift + slot.charInWord * LETTER_LIFT_STAGGER });
  }

  return assignments;
}

/** Pick the closest unused glyph with the right character (case-insensitive fallback, clone as last resort). */
function harvest(
  slot: TargetSlot,
  byChar: Map<string, SourceGlyph[]>,
  used: Set<number>,
  seedPoint: THREE.Vector3 | null,
  sources: SourceGlyph[],
  stats: MappingStats,
): SourceGlyph {
  for (const ch of [slot.char, slot.char.toLowerCase(), slot.char.toUpperCase()]) {
    const pool = byChar.get(ch);
    if (!pool) continue;
    let best: SourceGlyph | null = null;
    let bestD = Infinity;
    for (const g of pool) {
      if (used.has(g.id)) continue;
      const d = seedPoint ? g.position.distanceToSquared(seedPoint) : 0;
      if (d < bestD) {
        bestD = d;
        best = g;
        if (!seedPoint) break;
      }
    }
    if (best) {
      used.add(best.id);
      stats.searchMapped++;
      return best;
    }
  }
  // Last resort: a duplicate strike at the nearest glyph's location. It still
  // originates from the paper: it is simply printed on top of its neighbour.
  let nearest = sources[0];
  if (seedPoint) {
    let bestD = Infinity;
    for (const g of sources) {
      if (g.onCarriage) continue;
      const d = g.position.distanceToSquared(seedPoint);
      if (d < bestD) {
        bestD = d;
        nearest = g;
      }
    }
  }
  const clone: SourceGlyph = { ...nearest, id: sources.length, char: slot.char, position: nearest.position.clone(), quaternion: nearest.quaternion.clone() };
  sources.push(clone);
  used.add(clone.id);
  stats.fallbackClones++;
  return clone;
}

/* ------------------------------------------------------------------ */
/*  2. The sea of letters                                              */
/* ------------------------------------------------------------------ */

/** Where the sea of letters rests: a volume in front of a reference camera. */
export interface SeaPlacement {
  frame: CameraFrame;
  /** tan(vertical fov / 2) of the reference camera. */
  tanHalfFov: number;
  aspect: number;
  /** Distance range from the reference camera. */
  depth: Range;
}

const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _fwd = new THREE.Vector3();

/**
 * A resting point for one sea glyph, spread through (and 20% beyond) the
 * reference view. Returns the world position and the glyph size that makes
 * every glyph about the same size on screen whatever its depth.
 */
export function seaPoint(rnd: () => number, sea: SeaPlacement, out: THREE.Vector3): { size: number; depth: number } {
  _right.set(1, 0, 0).applyQuaternion(sea.frame.quaternion);
  _up.set(0, 1, 0).applyQuaternion(sea.frame.quaternion);
  _fwd.set(0, 0, -1).applyQuaternion(sea.frame.quaternion);
  const depth = sea.depth[0] + (sea.depth[1] - sea.depth[0]) * Math.pow(rnd(), 1.05);
  const fx = (rnd() * 2 - 1) * 1.2 * sea.aspect;
  const fy = -1.2 + rnd() * 2.3;
  const h = sea.tanHalfFov * depth;
  out
    .copy(sea.frame.position)
    .addScaledVector(_fwd, depth)
    .addScaledVector(_right, fx * h)
    .addScaledVector(_up, fy * h);
  const size = SEA_SIZE_FRACTION * h * (0.6 + 0.6 * rnd());
  return { size, depth };
}

/* ------------------------------------------------------------------ */
/*  3. GPU buffers                                                     */
/* ------------------------------------------------------------------ */

export interface ParticleBuffers {
  count: number;
  origin: Float32Array; // vec3  rest position on the paper
  originQuat: Float32Array; // vec4  rest orientation (paper frame)
  target: Float32Array; // vec3  destination (quote slot or sea point)
  targetQuat: Float32Array; // vec4  destination orientation
  glyph: Float32Array; // vec2  atlas cell origin
  timing: Float32Array; // vec4  (appear, lift, duration, kind)
  seed: Float32Array; // vec4  per-particle random numbers
  scale: Float32Array; // vec2  (origin size, target size)
  carriage: Float32Array; // float 1 = follows the typewriter carriage
  /** Pairs of points (origin → target) for the mapping visualiser. */
  memberLinks: Float32Array;
}

export interface CellLookup {
  cellOf(ch: string): [number, number];
}

/**
 * Convert the mapping into flat typed arrays ready for InstancedBufferGeometry.
 * Every source glyph that is not a quote member becomes chaff and lifts into the sea.
 */
export function buildParticleBuffers(
  sources: readonly SourceGlyph[],
  assignments: readonly Assignment[],
  atlas: CellLookup,
  timeline: Timeline,
  sea: SeaPlacement,
  stats: MappingStats,
  seed = 1234,
): ParticleBuffers {
  const rnd = mulberry32(seed);
  const n = sources.length;
  const b: ParticleBuffers = {
    count: n,
    origin: new Float32Array(n * 3),
    originQuat: new Float32Array(n * 4),
    target: new Float32Array(n * 3),
    targetQuat: new Float32Array(n * 4),
    glyph: new Float32Array(n * 2),
    timing: new Float32Array(n * 4),
    seed: new Float32Array(n * 4),
    scale: new Float32Array(n * 2),
    carriage: new Float32Array(n),
    memberLinks: new Float32Array(assignments.length * 6),
  };

  const bySource = new Map<number, Assignment>();
  for (const a of assignments) bySource.set(a.source.id, a);

  const point = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  let linkIdx = 0;

  for (let i = 0; i < n; i++) {
    const g = sources[i];
    const a = bySource.get(g.id);

    b.origin.set([g.position.x, g.position.y, g.position.z], i * 3);
    b.originQuat.set([g.quaternion.x, g.quaternion.y, g.quaternion.z, g.quaternion.w], i * 4);
    b.glyph.set(atlas.cellOf(g.char), i * 2);
    b.seed.set([rnd(), rnd(), rnd(), rnd()], i * 4);
    b.carriage[i] = g.onCarriage ? 1 : 0;
    const appear = g.typedAt >= 0 ? g.typedAt : -1;

    if (a) {
      // ---- member: paper → quote slot --------------------------------
      const s = a.slot;
      const duration = Math.max(MIN_MEMBER_FLIGHT, s.arrival - a.liftTime);
      b.target.set([s.position.x, s.position.y, s.position.z], i * 3);
      b.targetQuat.set([s.quaternion.x, s.quaternion.y, s.quaternion.z, s.quaternion.w], i * 4);
      b.timing.set([appear, a.liftTime, duration, KIND_MEMBER], i * 4);
      b.scale.set([g.size, s.size], i * 2);
      b.memberLinks.set([g.position.x, g.position.y, g.position.z, s.position.x, s.position.y, s.position.z], linkIdx * 6);
      linkIdx++;
      stats.members++;
      continue;
    }

    // ---- chaff: paper → sea ---------------------------------------------
    const dist = g.position.distanceTo(WAVE_ORIGIN);
    const lineNoise = (Math.sin(g.line * 12.9898 + g.surfaceId * 78.233) * 0.5 + 0.5) * 0.45;
    const lift = timeline.chaffLiftStart + Math.min(1, dist / WAVE_RADIUS) * timeline.chaffLiftSpread + rnd() * 0.5 + lineNoise;
    const duration = lerpRange(timeline.chaffFlight, rnd());
    const { size } = seaPoint(rnd, sea, point);
    q.setFromEuler(e.set(rnd() * Math.PI * 2, rnd() * Math.PI * 2, rnd() * Math.PI * 2));

    b.target.set([point.x, point.y, point.z], i * 3);
    b.targetQuat.set([q.x, q.y, q.z, q.w], i * 4);
    b.timing.set([appear, lift, duration, KIND_CHAFF], i * 4);
    b.scale.set([g.size, size], i * 2);
    stats.chaff++;
  }
  b.memberLinks = b.memberLinks.subarray(0, linkIdx * 6);
  stats.sources = n;
  return b;
}
