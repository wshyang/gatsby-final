import * as THREE from "three";
import { lineText, type QuoteLineSpec, type QuoteSource } from "../content/types";
import { newPose, type PaperSurface } from "../assets/desk/PaperSurface";
import type { CameraFrame } from "../engine/CameraRig";
import { mulberry32, normalizeChar } from "../engine/GlyphAtlas";
import { TYPE } from "../engine/world";

/* ------------------------------------------------------------------ */
/*  Data model                                                         */
/* ------------------------------------------------------------------ */

/**
 * A glyph as it physically exists on a sheet of paper.
 * `position`/`quaternion` are derived from `surface.poseAt(u, v)`, i.e.
 * every glyph is pinned to a real coordinate on a rendered paper mesh.
 */
export interface SourceGlyph {
  id: number;
  char: string;
  surfaceId: number;
  line: number;
  col: number;
  /** Paper coordinates (0‥1). */
  u: number;
  v: number;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  /** Quad side length in world units. */
  size: number;
  /** Second at which the type bar hits the paper (-1 = already on the page). */
  typedAt: number;
  /** Rides on the carriage (needs the live carriage offset). */
  onCarriage: boolean;
}

/** One character cell in the floating quote formation. */
export interface TargetSlot {
  id: number;
  char: string;
  line: number;
  word: number;
  /** Index of this character within its word. */
  charInWord: number;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  size: number;
  /** Second at which the glyph must be locked in place. */
  arrival: number;
  source: QuoteSource;
}

/* ------------------------------------------------------------------ */
/*  Manuscript wrapping                                                */
/* ------------------------------------------------------------------ */

/** Greedy word wrap with a 5-space paragraph indent and a blank line between paragraphs. */
export function wrapParagraphs(paragraphs: readonly string[], columns: number = TYPE.columns): string[] {
  const lines: string[] = [];
  for (const para of paragraphs) {
    let line = "     ";
    for (const word of para.split(/\s+/)) {
      if (line.trim().length === 0) {
        line += word;
      } else if (line.length + 1 + word.length <= columns) {
        line += " " + word;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line.trim().length) lines.push(line);
    lines.push("");
  }
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Number of printable lines that fit on one page. */
export function linesPerPage(): number {
  return Math.floor((TYPE.pageHeight - 2 * TYPE.marginTop) / TYPE.lineHeight);
}

/**
 * Wrap `paragraphs` and, if the page is not full, keep repeating them
 * (starting each cycle from `offset`) until it is. Never overflows the page.
 */
export function fillPageLines(paragraphs: readonly string[], offset = 0): string[] {
  const capacity = linesPerPage();
  const once = wrapParagraphs(paragraphs);
  if (once.length >= capacity || paragraphs.length === 0) return once.slice(0, capacity);
  const lines = [...once];
  let i = offset;
  while (lines.length < capacity) {
    const next = wrapParagraphs([paragraphs[i % paragraphs.length]]);
    i++;
    lines.push("", ...next);
  }
  return lines.slice(0, capacity);
}

/* ------------------------------------------------------------------ */
/*  Layout onto a paper surface                                        */
/* ------------------------------------------------------------------ */

export interface LayoutOptions {
  /** Line indices that are typed live; their glyphs appear at `typedImpact(strikeIndex)`. */
  typedLines?: ReadonlySet<number>;
  /** Second at which the strike with this index (counting spaces) hits the paper. */
  typedImpact?: (strike: number) => number;
  seed?: number;
}

const _q = new THREE.Quaternion();
const _axisZ = new THREE.Vector3(0, 0, 1);
const _up = new THREE.Vector3();

/**
 * Place monospace lines on a paper surface at 10 cpi / 6 lpi.
 * Returns one SourceGlyph per non-space character.
 */
export function layoutOnSurface(surface: PaperSurface, lines: readonly string[], nextId: () => number, opts: LayoutOptions = {}): SourceGlyph[] {
  const out: SourceGlyph[] = [];
  const rnd = mulberry32(opts.seed ?? surface.id * 7919 + 13);
  const pose = newPose();
  const size = TYPE.lineHeight * TYPE.quadScale;
  let strike = 0;

  lines.forEach((text, line) => {
    const typed = opts.typedLines?.has(line) ?? false;
    for (let col = 0; col < text.length && col < TYPE.columns; col++) {
      const raw = text[col];
      if (raw === " ") {
        if (typed) strike++;
        continue;
      }
      const char = normalizeChar(raw);
      const u = (TYPE.marginLeft + (col + 0.5) * TYPE.cellWidth) / surface.width;
      const v = (TYPE.marginTop + (line + 0.5) * TYPE.lineHeight) / surface.height;
      surface.poseAt(u, v, pose);

      // Typewriter imperfections: baseline wobble and a hair of rotation.
      const wobble = (rnd() - 0.5) * 0.12 * TYPE.lineHeight;
      _up.set(0, 1, 0).applyQuaternion(pose.quaternion);
      const position = pose.position.clone().addScaledVector(_up, wobble);
      const quaternion = pose.quaternion.clone().multiply(_q.setFromAxisAngle(_axisZ, (rnd() - 0.5) * 0.04));

      const typedAt = typed && opts.typedImpact ? opts.typedImpact(strike) : -1;
      if (typed) strike++;

      out.push({ id: nextId(), char, surfaceId: surface.id, line, col, u, v, position, quaternion, size, typedAt, onCarriage: surface.onCarriage });
    }
  });
  return out;
}

/* ------------------------------------------------------------------ */
/*  Floating quote formation                                           */
/* ------------------------------------------------------------------ */

/**
 * Lay the quote out in the frame of the (settled) camera so the words face
 * the viewer. Each line has its own offset/depth; words get a little extra
 * depth jitter for parallax while the camera drifts. A word's `scale` sizes
 * its glyphs and widens its advance.
 *
 * @param distance distance from the camera to the formation centre
 */
export function layoutFormation(lines: readonly QuoteLineSpec[], camera: CameraFrame, distance: number, nextId: () => number): TargetSlot[] {
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const centre = camera.position.clone().addScaledVector(forward, distance);
  // Glyph quads face the camera: local +Z = towards the viewer.
  const facing = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, forward.clone().negate()));
  const rnd = mulberry32(4242);
  const slots: TargetSlot[] = [];

  lines.forEach((line, li) => {
    // Same proportions as the page: advance = 0.6 em, quad side = 1.25 em.
    const advancePer = (0.6 / TYPE.quadScale) * line.size;
    const spaceWidth = advancePer;
    const wordWidths = line.words.map((w) => Array.from(w.text).length * advancePer * (w.scale ?? 1));
    const width = wordWidths.reduce((a, b) => a + b, 0) + spaceWidth * Math.max(0, line.words.length - 1);
    let cursor = -width / 2;

    line.words.forEach((w, wi) => {
      const scale = w.scale ?? 1;
      const wordDepth = (rnd() - 0.5) * 0.9;
      const wordLift = (rnd() - 0.5) * 0.08 * line.size;
      const advance = advancePer * scale;
      let charInWord = 0;
      for (const ch of w.text) {
        const x = cursor + (charInWord + 0.5) * advance + line.offset[0];
        const y = line.offset[1] + wordLift;
        const z = line.offset[2] + wordDepth;
        const position = centre.clone().addScaledVector(right, x).addScaledVector(up, y).addScaledVector(forward, -z);
        const quaternion = facing.clone().multiply(_q.setFromAxisAngle(_axisZ, (rnd() - 0.5) * 0.03));
        slots.push({
          id: nextId(),
          char: normalizeChar(ch),
          line: li,
          word: wi,
          charInWord,
          position,
          quaternion,
          size: line.size * scale,
          arrival: line.arrival + wi * line.wordStagger + charInWord * 0.045,
          source: line.source,
        });
        charInWord++;
      }
      cursor += wordWidths[wi] + spaceWidth;
    });
  });
  return slots;
}

/** Text of each quote line, for logging and tests. */
export function quoteTexts(lines: readonly QuoteLineSpec[]): string[] {
  return lines.map(lineText);
}
