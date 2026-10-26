import { smooth } from "../../engine/easing";
import type { TypingScript } from "./TypingScript";

/** How long a key stays down (seconds). Longer than the typing interval, so neighbouring keys overlap like real fingers. */
export const KEY_DURATION = 0.12;
/** Fraction of KEY_DURATION spent going down; the rest is the slower spring back. */
const KEY_DOWN_FRACTION = 0.35;
/** Escapement starts this long after the bar impact and takes this long (clamped to the typing interval). */
const ESCAPE_DELAY = 0.005;
const ESCAPE_DURATION = 0.035;

export interface KeyPress {
  /** Row-major key index; -1 = space bar. */
  keyIndex: number;
  /** 0 = up, 1 = fully down. */
  amount: number;
}

export interface BarSwing {
  barIndex: number;
  /** 0 = at rest, 1 = tip on the paper. */
  amount: number;
}

export interface TypewriterPose {
  presses: KeyPress[];
  swings: BarSwing[];
  /** Shift key depression, 0‥1. */
  shift: number;
  /** Fractional carriage column: the column under the printing point. */
  column: number;
}

export function newPose(): TypewriterPose {
  return { presses: [], swings: [], shift: 0, column: 0 };
}

/** Fast down, slower return. phase 0‥1 → 0‥1. */
export function keyEnvelope(phase: number): number {
  if (phase <= 0 || phase >= 1) return 0;
  if (phase < KEY_DOWN_FRACTION) return smooth(0, KEY_DOWN_FRACTION, phase);
  return 1 - smooth(KEY_DOWN_FRACTION, 1, phase);
}

/** Sharp swing up, brief kiss at the platen (peak at phase 0.5), brisk return. */
export function barEnvelope(phase: number): number {
  if (phase <= 0 || phase >= 1) return 0;
  return Math.pow(Math.sin(phase * Math.PI), 0.75);
}

/**
 * Turns a TypingScript into the state of the machine at time t.
 * Pure: the same t always yields the same pose, so the animation can be scrubbed.
 */
export class TypewriterDriver {
  private readonly barDuration: number;
  private readonly escapeStart: number;
  private readonly escapeEnd: number;

  constructor(readonly script: TypingScript) {
    const { impact, interval } = script.options;
    // The bar peaks (touches the paper) exactly at `impact`.
    this.barDuration = Math.max(1e-3, impact * 2);
    const end = Math.min(impact + ESCAPE_DELAY + ESCAPE_DURATION, Math.max(interval, 1e-3));
    this.escapeEnd = end;
    this.escapeStart = Math.min(impact + ESCAPE_DELAY, end - 1e-3);
  }

  poseAt(t: number, out: TypewriterPose = newPose()): TypewriterPose {
    out.presses.length = 0;
    out.swings.length = 0;
    out.shift = 0;

    const events = this.script.events;
    const started = this.script.countStarted(t);
    const window = Math.max(KEY_DURATION, this.barDuration);
    for (let i = started - 1; i >= 0 && t - events[i].time < window; i--) {
      const ev = events[i];
      if (!ev.key) continue;
      const keyAmount = keyEnvelope((t - ev.time) / KEY_DURATION);
      if (keyAmount > 0) {
        out.presses.push({ keyIndex: ev.key.keyIndex, amount: keyAmount });
        if (ev.key.shift) out.shift = Math.max(out.shift, keyAmount);
      }
      if (ev.key.barIndex >= 0) {
        const swing = barEnvelope((t - ev.time) / this.barDuration);
        if (swing > 0) out.swings.push({ barIndex: ev.key.barIndex, amount: swing });
      }
    }

    out.column = this.columnAt(t, started);
    return out;
  }

  /** The carriage steps one column after each impact (escapement), so the next position sits under the printing point. */
  private columnAt(t: number, started: number): number {
    if (started === 0) return 0;
    const last = started - 1;
    const since = t - this.script.events[last].time;
    return last + smooth(this.escapeStart, this.escapeEnd, since);
  }
}
