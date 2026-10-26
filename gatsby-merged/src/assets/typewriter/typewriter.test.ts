import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, interleavedBarOrder, ResolvedLayout, type KeyboardLayout } from "./layout";
import { barEnvelope, keyEnvelope, TypewriterDriver } from "./TypewriterDriver";
import { TypingScript } from "./TypingScript";

const layout = new ResolvedLayout(DEFAULT_LAYOUT);
const OPTS = { start: 1, interval: 0.085, impact: 0.045 };

describe("ResolvedLayout (default QWERTY)", () => {
  it("has one distinct type bar per key (4 rows of 10)", () => {
    expect(layout.keys).toHaveLength(40);
    expect(new Set(layout.barOrder).size).toBe(40);
    expect(layout.barCount).toBe(40);
  });

  it("types lower and upper case on the same key, upper needing shift", () => {
    const a = layout.resolve("a");
    const A = layout.resolve("A");
    expect(a).not.toBeNull();
    expect(A).not.toBeNull();
    expect(A?.keyId).toBe(a?.keyId);
    expect(A?.barIndex).toBe(a?.barIndex);
    expect(a?.shift).toBe(false);
    expect(A?.shift).toBe(true);
  });

  it("types punctuation through shifted keys", () => {
    expect(layout.resolve("?")).toMatchObject({ keyId: "comma", shift: true });
    expect(layout.resolve("'")).toMatchObject({ keyId: "8", shift: true });
    expect(layout.resolve(".")).toMatchObject({ keyId: "period", shift: false });
  });

  it("maps space to the space bar with no type bar", () => {
    expect(layout.resolve(" ")).toEqual({ keyId: "space", keyIndex: -1, barIndex: -1, shift: false });
  });

  it("gives different letters different keys and different strike arms", () => {
    const keys = new Set<number>();
    const bars = new Set<number>();
    for (const c of "abcdefghijklmnopqrstuvwxyz") {
      const r = layout.resolve(c);
      keys.add(r?.keyIndex ?? -99);
      bars.add(r?.barIndex ?? -99);
    }
    expect(keys.size).toBe(26);
    expect(bars.size).toBe(26);
  });

  it("separates neighbouring keys around the basket", () => {
    const q = layout.resolve("q")?.barIndex ?? 0;
    const w = layout.resolve("w")?.barIndex ?? 0;
    expect(Math.abs(q - w)).toBeGreaterThan(1);
  });

  it("reports characters the layout cannot type", () => {
    expect(layout.resolve("é")).toBeNull();
    expect(layout.unsupported("café é")).toEqual(["é"]);
  });
});

describe("custom layouts", () => {
  const custom: KeyboardLayout = {
    rows: [[{ id: "x", lower: "b" }, { id: "y", lower: "a" }]],
    barOrder: ["y", "x"],
  };
  const l = new ResolvedLayout(custom);

  it("changes which key and strike arm types each letter", () => {
    expect(l.resolve("a")).toMatchObject({ keyId: "y", keyIndex: 1, barIndex: 0 });
    expect(l.resolve("b")).toMatchObject({ keyId: "x", keyIndex: 0, barIndex: 1 });
  });

  it("rejects a character typed by two keys", () => {
    expect(() => new ResolvedLayout({ rows: [[{ id: "p", lower: "a" }, { id: "q", lower: "a" }]] })).toThrow(/more than one key/);
  });

  it("rejects duplicate key ids", () => {
    expect(() => new ResolvedLayout({ rows: [[{ id: "p", lower: "a" }, { id: "p", lower: "b" }]] })).toThrow(/duplicate key id/);
  });

  it("rejects a barOrder with unknown or repeated keys or the wrong length", () => {
    const rows = [[{ id: "p", lower: "a" }, { id: "q", lower: "b" }]];
    expect(() => new ResolvedLayout({ rows, barOrder: ["p"] })).toThrow(/entries/);
    expect(() => new ResolvedLayout({ rows, barOrder: ["p", "zzz"] })).toThrow(/unknown key/);
    expect(() => new ResolvedLayout({ rows, barOrder: ["p", "p"] })).toThrow(/repeats/);
  });
});

describe("interleavedBarOrder", () => {
  it("is a permutation for any key count", () => {
    for (const n of [1, 2, 7, 17, 34, 42, 51]) {
      const ids = Array.from({ length: n }, (_, i) => `k${i}`);
      expect(new Set(interleavedBarOrder(ids)).size).toBe(n);
    }
  });
});

describe("TypingScript", () => {
  const script = TypingScript.fromText("Hi t", layout, OPTS);

  it("times each keystroke on a fixed interval and offsets the impact", () => {
    script.events.forEach((e, i) => expect(e.time).toBeCloseTo(1 + i * 0.085, 9));
    expect(script.events[0].impactTime).toBeCloseTo(1.045, 9);
    expect(script.endTime).toBeCloseTo(1.3, 9);
  });

  it("resolves capitals to shifted keys", () => {
    expect(script.events[0].key?.shift).toBe(true);
    expect(script.events[1].key?.shift).toBe(false);
  });

  it("normalises curly quotes and dashes before lookup", () => {
    const s = TypingScript.fromText("’—", layout, OPTS);
    expect(s.events.map((e) => e.char)).toEqual(["'", "-"]);
    expect(s.events.every((e) => e.key !== null)).toBe(true);
  });

  it("keeps untypable characters as events without a key", () => {
    expect(TypingScript.fromText("é", layout, OPTS).events[0].key).toBeNull();
  });

  it("counts started keystrokes by time", () => {
    expect(script.countStarted(0.5)).toBe(0);
    expect(script.countStarted(1)).toBe(1);
    expect(script.countStarted(1.2)).toBe(3);
    expect(script.countStarted(99)).toBe(4);
  });
});

describe("envelopes", () => {
  it("are zero outside (0,1) and peak inside", () => {
    expect(keyEnvelope(0)).toBe(0);
    expect(keyEnvelope(1)).toBe(0);
    expect(keyEnvelope(0.35)).toBeCloseTo(1, 6);
    expect(barEnvelope(0)).toBe(0);
    expect(barEnvelope(0.5)).toBeCloseTo(1, 6);
    expect(barEnvelope(1)).toBe(0);
  });

  it("go down faster than they come back up", () => {
    // The key reaches 90% by phase ~0.26 on the way down, but only falls back to 90% around phase ~0.43.
    const down = [0.1, 0.2, 0.3].findIndex((p) => keyEnvelope(p) > 0.9);
    expect(down).toBeGreaterThanOrEqual(0);
    expect(keyEnvelope(0.5)).toBeGreaterThan(0.85);
  });
});

describe("TypewriterDriver", () => {
  const script = TypingScript.fromText("Hi", layout, OPTS);
  const driver = new TypewriterDriver(script);

  it("is idle before the first keystroke", () => {
    const p = driver.poseAt(0.5);
    expect(p.presses).toEqual([]);
    expect(p.swings).toEqual([]);
    expect(p.shift).toBe(0);
    expect(p.column).toBe(0);
  });

  it("presses the right key and swings the right bar, reaching the paper exactly at impact", () => {
    const h = layout.resolve("H");
    const p = driver.poseAt(1 + OPTS.impact);
    expect(p.swings).toHaveLength(1);
    expect(p.swings[0].barIndex).toBe(h?.barIndex);
    expect(p.swings[0].amount).toBeCloseTo(1, 6);
    expect(p.presses[0].keyIndex).toBe(h?.keyIndex);
  });

  it("dips shift for capitals only", () => {
    expect(driver.poseAt(1.03).shift).toBeGreaterThan(0.2);
    expect(driver.poseAt(1.085 + 0.1).shift).toBe(0);
  });

  it("keeps the carriage put until the bar has hit, then steps one column", () => {
    expect(driver.poseAt(1 + OPTS.impact - 0.01).column).toBe(0);
    expect(driver.poseAt(1 + OPTS.impact + 0.001).column).toBeLessThan(0.2);
    expect(driver.poseAt(1 + OPTS.interval - 0.001).column).toBeCloseTo(1, 1);
  });

  it("returns every key and bar to rest after the last keystroke", () => {
    const p = driver.poseAt(OPTS.start + 5);
    expect(p.presses).toEqual([]);
    expect(p.swings).toEqual([]);
    expect(p.column).toBe(2);
  });

  it("is a pure function of time", () => {
    const a = structuredClone(driver.poseAt(1.06));
    const b = driver.poseAt(3);
    const c = driver.poseAt(1.06);
    expect(b.swings).toEqual([]);
    expect(c).toEqual(a);
  });

  it("lets neighbouring keystrokes overlap when the interval is short", () => {
    const fast = new TypewriterDriver(TypingScript.fromText("ab", layout, { start: 0, interval: 0.03, impact: 0.045 }));
    expect(fast.poseAt(0.05).swings.length).toBe(2);
  });
});
