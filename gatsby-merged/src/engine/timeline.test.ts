import { describe, expect, it } from "vitest";
import { assertTimelineOrdered, GATSBY_TIMELINE, scaleTimeline, type Timeline } from "./Timeline";

const tl = GATSBY_TIMELINE;

describe("GATSBY_TIMELINE", () => {
  it("has every beat in order", () => {
    expect(() => assertTimelineOrdered(tl)).not.toThrow();
  });

  it("lifts the typed line only after typing has finished", () => {
    const typingEnds = tl.typingStart + 52 * tl.typingInterval;
    expect(tl.memberLiftStart).toBeGreaterThanOrEqual(typingEnds);
    expect(tl.chaffLiftStart).toBeGreaterThanOrEqual(typingEnds);
  });

  it("dissolves the desk no later than the city arrives, so no slab floats against the sky", () => {
    expect(tl.deskFade[0]).toBeLessThanOrEqual(tl.cityReveal[0]);
    expect(tl.deskFade[1]).toBeLessThanOrEqual(tl.cityReveal[1]);
  });

  it("brings the city into focus only once it has been revealed", () => {
    expect(tl.cityFocus[0]).toBeGreaterThanOrEqual(tl.cityReveal[0]);
  });

  it("keeps the sea alive until the quote has been read, then dissolves everything before the end", () => {
    const lastLand = tl.chaffLiftStart + tl.chaffLiftSpread + tl.chaffFlight[1];
    expect(lastLand).toBeGreaterThan(tl.holdFrameAt);
    expect(tl.dissolve[1]).toBeLessThanOrEqual(tl.duration);
    expect(tl.fadeOut[1]).toBeLessThanOrEqual(tl.duration);
  });
});

describe("scaleTimeline", () => {
  it("scales every time but keeps the order of the beats", () => {
    const fast = scaleTimeline(tl, 2);
    expect(fast.duration).toBeCloseTo(tl.duration / 2, 9);
    expect(fast.typingInterval).toBeCloseTo(tl.typingInterval / 2, 9);
    expect(fast.deskFade[0]).toBeCloseTo(tl.deskFade[0] / 2, 9);
    expect(() => assertTimelineOrdered(fast)).not.toThrow();
  });

  it("leaves amounts alone", () => {
    const slow = scaleTimeline(tl, 0.5);
    expect(slow.seaDim.firstAmount).toBe(tl.seaDim.firstAmount);
  });
});

describe("assertTimelineOrdered", () => {
  it("rejects an inverted range", () => {
    const bad: Timeline = { ...tl, deskFade: [10, 5] };
    expect(() => assertTimelineOrdered(bad)).toThrow(/deskFade/);
  });

  it("rejects a dissolve that ends after the sequence", () => {
    expect(() => assertTimelineOrdered({ ...tl, dissolve: [30, tl.duration + 1] })).toThrow(/dissolve/);
  });

  it("rejects lifting before typing starts", () => {
    expect(() => assertTimelineOrdered({ ...tl, memberLiftStart: 0 })).toThrow(/typing/);
  });
});
