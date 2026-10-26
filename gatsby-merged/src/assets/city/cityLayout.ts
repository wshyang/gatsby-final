/**
 * Pure, deterministic layout helpers for the procedural Manhattan backdrop
 * (no three.js dependency, unit-testable).
 */

/** World-space Y of the city ground plane. */
export const CITY_GROUND = -205;
/** Full width of the river corridor. */
export const RIVER_W = 400;

/** X of the river centre line at depth z (the river runs diagonally). */
export const riverX = (z: number): number => -170 + 0.36 * z;

/** Small deterministic PRNG (kept identical to the opus build so the layout matches). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BuildingBox {
  x: number;
  z: number;
  w: number;
  d: number;
  y0: number;
  h: number;
  tint: number;
}

export interface Spire {
  x: number;
  z: number;
  y: number;
  r: number;
  h: number;
}

export interface CityLayout {
  boxes: BuildingBox[];
  spires: Spire[];
}

const gauss = (x: number, z: number, cx: number, cz: number, r: number): number =>
  Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r));

/** Places ~6 000 towers on a Manhattan-like grid, skipping the river corridor. */
export function layoutBuildings(seed = 1925): CityLayout {
  const R = rng(seed);
  const G = CITY_GROUND;
  const boxes: BuildingBox[] = [];
  const spires: Spire[] = [];

  for (let ax = -2600; ax < 2600; ax += 260) {
    for (let sz = 500; sz > -5200; sz -= 80) {
      const dRiver = ax + 130 - riverX(sz);
      if (Math.abs(dRiver) < RIVER_W / 2 + 140) continue;
      const manhattan = dRiver > 0;
      let x = ax + 14;
      while (x < ax + 246) {
        const w = 22 + R() * 42;
        if (x + w > ax + 246) break;
        const d = 30 + R() * 34;
        const zc = sz - 40;
        let h = manhattan ? 14 + R() * 34 : 8 + R() * 18;
        if (manhattan) {
          const boost = Math.max(gauss(x, zc, 380, -2150, 650), gauss(x, zc, 260, -950, 380) * 0.85);
          if (R() < 0.18 + boost * 0.7) h += boost * (90 + R() * 210) + R() * 25;
        }
        const tint = 0.25 + R() * 0.25;
        boxes.push({ x: x + w / 2, z: zc + (R() - 0.5) * 6, w, d, y0: G, h, tint });
        // setback tiers for tall towers (1920s zoning law silhouettes)
        if (h > 95) {
          let y = G + h;
          let tw = w * 0.72;
          let td = d * 0.72;
          const tiers = 1 + Math.floor(R() * 3);
          for (let k = 0; k < tiers; k++) {
            const th = h * (0.18 + R() * 0.2);
            boxes.push({ x: x + w / 2, z: zc, w: tw, d: td, y0: y, h: th, tint });
            y += th;
            tw *= 0.7;
            td *= 0.7;
          }
          if (R() < 0.55) spires.push({ x: x + w / 2, z: zc, y, r: Math.min(tw, td) * 0.6, h: 20 + R() * 55 });
        }
        x += w + 4 + R() * 10;
      }
    }
  }
  return { boxes, spires };
}
