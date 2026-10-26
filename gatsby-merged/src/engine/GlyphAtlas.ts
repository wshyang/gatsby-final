import * as THREE from "three";

/**
 * GlyphAtlas
 * ----------
 * Renders a character set into a power-of-two canvas grid and exposes the
 * UV rectangle of every glyph. The alpha channel carries the ink coverage.
 *
 * Every glyph particle in the scene samples this atlas through an
 * instanced `aGlyph` attribute (cell origin), so a single draw call renders
 * thousands of distinct characters.
 */
export interface AtlasOptions {
  /** Characters to rasterise. */
  chars: string;
  /** Pixel size of one (square) cell. */
  cell: number;
  /** Cells per row (texture width = cols * cell). */
  cols: number;
  /** CSS font family stack. */
  family: string;
  /** Font size relative to the cell. Typewriter: em = cell / quadScale. */
  emScale: number;
  /** Baseline offset from cell centre as fraction of em (positive = down). */
  baselineShift: number;
  /** Simulate ribbon/ink irregularities. */
  distress: boolean;
  bold?: boolean;
  /** Seed for deterministic erosion noise. */
  seed?: number;
}

export class GlyphAtlas {
  readonly texture: THREE.CanvasTexture;
  readonly canvas: HTMLCanvasElement;
  readonly cols: number;
  readonly rows: number;
  /** UV size of one cell (uniform `uCellSize`). */
  readonly cellSize: THREE.Vector2;
  private readonly uv = new Map<string, [number, number]>();
  private readonly fallback: [number, number];

  constructor(opts: AtlasOptions) {
    const { chars, cell, cols } = opts;
    const uniq = Array.from(new Set(chars.split("")));
    this.cols = cols;
    this.rows = Math.max(1, nextPow2(Math.ceil(uniq.length / cols)));

    const canvas = document.createElement("canvas");
    canvas.width = cols * cell;
    canvas.height = this.rows * cell;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const em = cell * opts.emScale;
    ctx.font = `${opts.bold ? "bold " : ""}${em}px ${opts.family}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#ffffff";

    const rnd = mulberry32(opts.seed ?? 1337);

    uniq.forEach((ch, i) => {
      const cx = i % cols;
      const cy = Math.floor(i / cols);
      const x = cx * cell + cell / 2;
      const y = cy * cell + cell / 2 + em * opts.baselineShift;

      if (opts.distress) {
        // Typewriter strike: a slightly heavy, soft impression built from
        // several low-alpha offset passes (ribbon bleed) around a core strike.
        ctx.globalAlpha = 0.28;
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          ctx.fillText(ch, x + Math.cos(a) * em * 0.018, y + Math.sin(a) * em * 0.018);
        }
        ctx.globalAlpha = 0.9;
        ctx.fillText(ch, x + (rnd() - 0.5) * em * 0.01, y + (rnd() - 0.5) * em * 0.01);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillText(ch, x, y);
      }

      // Flip v because CanvasTexture.flipY = true (v = 0 at canvas bottom).
      this.uv.set(ch, [cx / cols, 1 - (cy + 1) / this.rows]);
    });

    if (opts.distress) erode(ctx, canvas.width, canvas.height, rnd);

    this.canvas = canvas;
    this.cellSize = new THREE.Vector2(1 / cols, 1 / this.rows);
    this.fallback = this.uv.get("?") ?? this.uv.get(uniq[0]) ?? [0, 0];

    const tex = new THREE.CanvasTexture(canvas);
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 4;
    tex.colorSpace = THREE.NoColorSpace;
    tex.needsUpdate = true;
    this.texture = tex;
  }

  /** UV origin (bottom-left) of the cell holding `ch`. */
  cellOf(ch: string): [number, number] {
    return this.uv.get(ch) ?? this.uv.get(normalizeChar(ch)) ?? this.fallback;
  }

  has(ch: string): boolean {
    return this.uv.has(ch) || this.uv.has(normalizeChar(ch));
  }

  dispose() {
    this.texture.dispose();
  }
}

/** Printable ASCII, the character set available on the manuscript. */
export const ASCII_PRINTABLE = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join("");

/** Map typographic quotes/dashes onto their typewriter equivalents. */
export function normalizeChar(ch: string): string {
  switch (ch) {
    case "\u2018":
    case "\u2019":
      return "'";
    case "\u201C":
    case "\u201D":
      return '"';
    case "\u2013":
    case "\u2014":
      return "-";
    case "\u2026":
      return ".";
    default:
      return ch;
  }
}

/**
 * Multiply ink coverage by a grainy noise field so letters look like an
 * uneven ribbon impression rather than crisp vector type.
 */
function erode(ctx: CanvasRenderingContext2D, w: number, h: number, rnd: () => number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  // Low-res noise lattice, bilinearly sampled, two octaves.
  const n1 = 64;
  const lattice = new Float32Array(n1 * n1);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rnd();
  const sample = (x: number, y: number) => {
    const fx = x - Math.floor(x);
    const fy = y - Math.floor(y);
    const x0 = Math.floor(x) & (n1 - 1);
    const y0 = Math.floor(y) & (n1 - 1);
    const x1 = (x0 + 1) & (n1 - 1);
    const y1 = (y0 + 1) & (n1 - 1);
    const a = lattice[y0 * n1 + x0];
    const b = lattice[y0 * n1 + x1];
    const c = lattice[y1 * n1 + x0];
    const e = lattice[y1 * n1 + x1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + e * fx) * fy;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4 + 3;
      const a = d[idx];
      if (a === 0) continue;
      const n = 0.55 * sample(x * 0.21, y * 0.21) + 0.45 * sample(x * 0.047 + 11.3, y * 0.047 + 7.1);
      // Keep most of the ink; carve out speckles where the noise dips.
      const keep = 0.72 + 0.45 * n;
      d[idx] = Math.min(255, a * keep);
      d[idx - 1] = 255;
      d[idx - 2] = 255;
      d[idx - 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function nextPow2(n: number) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** Small deterministic PRNG. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Wait for a web font to be usable, with a hard timeout so the atlas can
 * always be rasterised (falls back to the next family in the stack).
 */
export async function waitForFont(family: string, timeoutMs = 2500): Promise<boolean> {
  if (!("fonts" in document)) return false;
  try {
    const result = await Promise.race([
      document.fonts.load(`64px "${family}"`).then((f) => f.length > 0),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
    ]);
    return result;
  } catch {
    return false;
  }
}
