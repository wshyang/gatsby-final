import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { FlatPage, type PaperSurface } from "../assets/desk/PaperSurface";
import { quoteLine } from "../content/parseQuote";
import type { QuoteLineSpec } from "../content/types";
import type { CameraFrame } from "../engine/CameraRig";
import { GATSBY_TIMELINE } from "../engine/Timeline";
import { assignSlots, buildParticleBuffers, emptyStats, KIND_CHAFF, KIND_MEMBER, type SeaPlacement } from "./Mapping";
import { fillPageLines, layoutFormation, layoutOnSurface, linesPerPage, wrapParagraphs } from "./TextLayout";

const timeline = GATSBY_TIMELINE;
const atlas = { cellOf: (_c: string): [number, number] => [0, 0] };

const frame: CameraFrame = { position: new THREE.Vector3(0, 30, 20), quaternion: new THREE.Quaternion() };
const sea: SeaPlacement = { frame, tanHalfFov: Math.tan((46 * Math.PI) / 360), aspect: 16 / 9, depth: [1.3, 17] };

function page(id: number): PaperSurface {
  // A texture is only used for rendering; the layout never reads it.
  return new FlatPage(id, new THREE.Vector3(0, 0, 0), 0, new THREE.Texture());
}

function counter() {
  let i = 0;
  return () => i++;
}

function build(typedText: string, pageText: string[], quote: QuoteLineSpec[]) {
  const next = counter();
  const p = page(0);
  const sources = layoutOnSurface(p, wrapParagraphs(pageText), next, { seed: 1 });
  const sheet = page(1);
  const typed = layoutOnSurface(sheet, [typedText], next, { typedLines: new Set([0]), typedImpact: (s) => 1 + s * 0.1, seed: 2 });
  sources.push(...typed);
  const slots = layoutFormation(quote, frame, 18, next);
  return { sources, typed, slots };
}

const opts = (source: "typed" | "pages") => ({ size: 1, offset: [0, 0, 0] as const, arrival: 20, wordStagger: 0.3, source });

describe("wrapParagraphs", () => {
  it("indents paragraphs and never exceeds the column limit", () => {
    const lines = wrapParagraphs(["word ".repeat(60)], 40);
    expect(lines[0].startsWith("     word")).toBe(true);
    expect(lines.every((l) => l.length <= 40)).toBe(true);
  });

  it("separates paragraphs with one blank line", () => {
    expect(wrapParagraphs(["a", "b"])).toEqual(["     a", "", "     b"]);
  });
});

describe("linesPerPage", () => {
  it("fits a plausible number of typewritten lines on a sheet", () => {
    expect(linesPerPage()).toBeGreaterThan(40);
    expect(linesPerPage()).toBeLessThan(70);
  });
});

describe("fillPageLines", () => {
  it("repeats the paragraphs until the page is full, without overflowing it", () => {
    const lines = fillPageLines(["a short paragraph.", "another one."]);
    expect(lines).toHaveLength(linesPerPage());
    expect(lines.filter((l) => l.includes("another one.")).length).toBeGreaterThan(1);
  });

  it("truncates text that is already longer than a page", () => {
    expect(fillPageLines(["word ".repeat(2000)])).toHaveLength(linesPerPage());
  });

  it("returns the lines untouched when there is nothing to repeat", () => {
    expect(fillPageLines([])).toEqual([]);
  });

  it("starts repeating from the given offset so neighbouring pages differ", () => {
    const a = fillPageLines(["first.", "second."], 0);
    const b = fillPageLines(["first.", "second."], 1);
    expect(a).not.toEqual(b);
  });
});

describe("layoutOnSurface", () => {
  it("pins every glyph to the page plane and skips spaces", () => {
    const { sources } = build("hi", ["ab cd"], []);
    const onPage = sources.filter((g) => g.surfaceId === 0);
    expect(onPage.map((g) => g.char).join("")).toBe("abcd");
    expect(onPage.every((g) => Math.abs(g.position.y) < 1e-3)).toBe(true);
  });

  it("stamps typed glyphs with the impact time of their strike, counting spaces", () => {
    const { typed } = build("a b", ["x"], []);
    expect(typed.map((g) => g.typedAt)).toEqual([expect.closeTo(1, 9), expect.closeTo(1.2, 9)]);
  });
});

describe("layoutFormation", () => {
  it("scales highlighted words and keeps lines centred", () => {
    const slots = layoutFormation([quoteLine("a **bb**", opts("pages"))], frame, 18, counter());
    expect(slots.map((s) => s.size)).toEqual([1, 1.4, 1.4]);
    const mean = slots.reduce((a, s) => a + s.position.x, 0) / slots.length;
    expect(Math.abs(mean)).toBeLessThan(0.5);
  });

  it("staggers word arrivals", () => {
    const slots = layoutFormation([quoteLine("a b c", opts("pages"))], frame, 18, counter());
    expect(slots.map((s) => s.arrival)).toEqual([expect.closeTo(20, 9), expect.closeTo(20.3, 9), expect.closeTo(20.6, 9)]);
  });
});

describe("assignSlots + buildParticleBuffers", () => {
  const quote = [quoteLine("ab", opts("typed")), quoteLine("cd", opts("pages"))];
  const { sources, typed, slots } = build("ab", ["cdxyz abcd"], quote);
  const stats = emptyStats();
  const assignments = assignSlots(sources, slots, typed, timeline, stats);
  const buffers = buildParticleBuffers(sources, assignments, atlas, timeline, sea, stats);

  it("sources every quote letter from a real glyph of the same character", () => {
    expect(assignments).toHaveLength(slots.length);
    for (const a of assignments) expect(a.source.char.toLowerCase()).toBe(a.slot.char.toLowerCase());
    expect(new Set(assignments.map((a) => a.source.id)).size).toBe(assignments.length);
    expect(stats.fallbackClones).toBe(0);
  });

  it("maps the typed slots to the typed glyphs in column order", () => {
    const typedAssignments = assignments.filter((a) => a.slot.source === "typed");
    expect(typedAssignments.map((a) => a.source.id)).toEqual(typed.map((g) => g.id));
    expect(stats.identityMapped).toBe(2);
  });

  it("lifts every glyph: members plus chaff cover all sources", () => {
    expect(stats.members + stats.chaff).toBe(sources.length);
    const kinds = Array.from({ length: buffers.count }, (_, i) => buffers.timing[i * 4 + 3]);
    expect(kinds.every((k) => k === KIND_MEMBER || k === KIND_CHAFF)).toBe(true);
  });

  it("never lifts a member before memberLiftStart and lands it on its arrival", () => {
    for (const a of assignments) {
      expect(a.liftTime).toBeGreaterThanOrEqual(timeline.memberLiftStart - 1e-9);
    }
    for (let i = 0; i < buffers.count; i++) {
      if (buffers.timing[i * 4 + 3] !== KIND_MEMBER) continue;
      const lift = buffers.timing[i * 4 + 1];
      const dur = buffers.timing[i * 4 + 2];
      expect(lift + dur).toBeGreaterThanOrEqual(20 - 1e-3);
    }
  });

  it("lifts chaff inside the lift-off window and flies it for chaffFlight seconds", () => {
    for (let i = 0; i < buffers.count; i++) {
      if (buffers.timing[i * 4 + 3] !== KIND_CHAFF) continue;
      const lift = buffers.timing[i * 4 + 1];
      const dur = buffers.timing[i * 4 + 2];
      expect(lift).toBeGreaterThanOrEqual(timeline.chaffLiftStart);
      expect(lift).toBeLessThanOrEqual(timeline.chaffLiftStart + timeline.chaffLiftSpread + 1);
      expect(dur).toBeGreaterThanOrEqual(timeline.chaffFlight[0]);
      expect(dur).toBeLessThanOrEqual(timeline.chaffFlight[1]);
    }
  });

  it("keeps every sea glyph in front of the reference camera at a screen-constant size", () => {
    const fwd = new THREE.Vector3(0, 0, -1);
    const v = new THREE.Vector3();
    for (let i = 0; i < buffers.count; i++) {
      if (buffers.timing[i * 4 + 3] !== KIND_CHAFF) continue;
      v.set(buffers.target[i * 3], buffers.target[i * 3 + 1], buffers.target[i * 3 + 2]).sub(frame.position);
      const depth = v.dot(fwd);
      expect(depth).toBeGreaterThan(sea.depth[0] - 1e-3);
      expect(depth).toBeLessThan(sea.depth[1] + 1e-3);
      const frac = buffers.scale[i * 2 + 1] / (2 * sea.tanHalfFov * depth);
      expect(frac).toBeGreaterThan(0.005);
      expect(frac).toBeLessThan(0.03);
    }
  });

  it("is deterministic", () => {
    const again = buildParticleBuffers(sources, assignments, atlas, timeline, sea, emptyStats());
    expect(Array.from(again.timing)).toEqual(Array.from(buffers.timing));
    expect(Array.from(again.target)).toEqual(Array.from(buffers.target));
  });
});

describe("clone fallback", () => {
  it("clones a neighbouring glyph (still on paper) when the pages lack a letter, and counts it", () => {
    const quote = [quoteLine("zz", opts("pages"))];
    const { sources, typed, slots } = build("a", ["abc"], quote);
    const stats = emptyStats();
    const assignments = assignSlots(sources, slots, typed, timeline, stats);
    expect(stats.fallbackClones).toBe(2);
    for (const a of assignments) expect(a.source.surfaceId).toBe(0);
  });
});
