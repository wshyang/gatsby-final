import type { Range } from "./easing";

/**
 * Named beats of the whole sequence, in seconds. Every ramp in the scene
 * (lift-off, desk fade, city focus, sea dimming, dissolve) reads from here, so
 * retiming the piece means editing one object.
 */
export interface Timeline {
  duration: number;
  fadeIn: Range;
  fadeOut: Range;

  /** The typewriter starts striking the typed line. */
  typingStart: number;
  typingInterval: number;
  /** Seconds between a key press and the moment the type bar hits the paper. */
  strikeImpact: number;

  /** First glyph leaves the typed line (the quote members). */
  memberLiftStart: number;
  /** Non-quote glyphs lift in a wave that starts here and spreads over `chaffLiftSpread` seconds. */
  chaffLiftStart: number;
  chaffLiftSpread: number;
  /** Flight duration of a quote member (min, max seconds). */
  memberFlight: Range;
  /** Flight duration of a sea glyph (min, max seconds). */
  chaffFlight: Range;

  deskFade: Range;
  cityReveal: Range;
  /** The city goes from blurred to sharp. */
  cityFocus: Range;
  /** Colour grade slides from the warm desk to the cool city. */
  gradeBlend: Range;
  /** Time at which the falling-snow drift of the sea of letters is zero. */
  seaDriftOrigin: number;
  /** Sea brightness dips in two steps before / while the quote forms. */
  seaDim: { first: Range; firstAmount: number; second: Range; secondAmount: number };

  /** Camera time used to place the quote plane (the settled aerial frame). */
  holdFrameAt: number;
  dissolve: Range;
}

export const GATSBY_TIMELINE: Timeline = {
  duration: 34,
  fadeIn: [0, 1.3],
  fadeOut: [32.0, 33.6],

  typingStart: 0.9,
  typingInterval: 0.14,
  strikeImpact: 0.045,

  memberLiftStart: 8.6,
  chaffLiftStart: 8.8,
  chaffLiftSpread: 9.0,
  memberFlight: [7.6, 10.4],
  chaffFlight: [11.7, 21.6],

  deskFade: [13.0, 17.0],
  cityReveal: [14.0, 18.0],
  cityFocus: [15.0, 21.0],
  gradeBlend: [13.5, 17.5],
  seaDriftOrigin: 16,
  seaDim: { first: [16, 19], firstAmount: 0.2, second: [20, 22], secondAmount: 0.3 },

  holdFrameAt: 24,
  dissolve: [30.5, 33.0],
};

/** Scale every time value (used by `?pace=`). pace 2 = twice as fast. */
export function scaleTimeline(tl: Timeline, pace: number): Timeline {
  const k = 1 / pace;
  const r = (x: Range): Range => [x[0] * k, x[1] * k];
  return {
    duration: tl.duration * k,
    fadeIn: r(tl.fadeIn),
    fadeOut: r(tl.fadeOut),
    typingStart: tl.typingStart * k,
    typingInterval: tl.typingInterval * k,
    strikeImpact: tl.strikeImpact * k,
    memberLiftStart: tl.memberLiftStart * k,
    chaffLiftStart: tl.chaffLiftStart * k,
    chaffLiftSpread: tl.chaffLiftSpread * k,
    memberFlight: r(tl.memberFlight),
    chaffFlight: r(tl.chaffFlight),
    deskFade: r(tl.deskFade),
    cityReveal: r(tl.cityReveal),
    cityFocus: r(tl.cityFocus),
    gradeBlend: r(tl.gradeBlend),
    seaDriftOrigin: tl.seaDriftOrigin * k,
    seaDim: { first: r(tl.seaDim.first), firstAmount: tl.seaDim.firstAmount, second: r(tl.seaDim.second), secondAmount: tl.seaDim.secondAmount },
    holdFrameAt: tl.holdFrameAt * k,
    dissolve: r(tl.dissolve),
  };
}

/** Throws if any beat is out of order. Shared by tests and the scene constructor. */
export function assertTimelineOrdered(tl: Timeline): void {
  const ranges: [string, Range][] = [
    ["fadeIn", tl.fadeIn],
    ["fadeOut", tl.fadeOut],
    ["deskFade", tl.deskFade],
    ["cityReveal", tl.cityReveal],
    ["cityFocus", tl.cityFocus],
    ["gradeBlend", tl.gradeBlend],
    ["dissolve", tl.dissolve],
    ["memberFlight", tl.memberFlight],
    ["chaffFlight", tl.chaffFlight],
  ];
  for (const [name, [a, b]] of ranges) {
    if (!(b > a)) throw new Error(`Timeline.${name} must have end > start (got ${a}, ${b})`);
  }
  if (tl.dissolve[1] > tl.duration) throw new Error("Timeline.dissolve ends after duration");
  if (tl.memberLiftStart < tl.typingStart) throw new Error("Timeline.memberLiftStart precedes typing");
}
