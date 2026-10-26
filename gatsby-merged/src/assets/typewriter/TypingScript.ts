import { normalizeChar } from "../../engine/GlyphAtlas";
import type { ResolvedKey, ResolvedLayout } from "./layout";

/** One keystroke. */
export interface TypingEvent {
  /** Index in the script; equals the carriage column once this keystroke is done. */
  index: number;
  char: string;
  /** Second at which the key goes down. */
  time: number;
  /** Second at which the type bar hits the paper (the glyph appears here). */
  impactTime: number;
  /** Null when the layout cannot type the character (nothing moves except the carriage). */
  key: ResolvedKey | null;
}

export interface TypingScriptOptions {
  /** Time of the first keystroke. */
  start: number;
  /** Seconds between keystrokes. */
  interval: number;
  /** Seconds from key-down to the type bar hitting the paper. */
  impact: number;
}

/** A timed sequence of keystrokes. Immutable. */
export class TypingScript {
  private constructor(
    readonly events: readonly TypingEvent[],
    readonly options: Readonly<TypingScriptOptions>,
  ) {}

  /** Characters are normalised (curly quotes, dashes) before they are looked up on the layout. */
  static fromText(text: string, layout: ResolvedLayout, options: TypingScriptOptions): TypingScript {
    const events = Array.from(text).map((raw, index): TypingEvent => {
      const char = normalizeChar(raw);
      const time = options.start + index * options.interval;
      return { index, char, time, impactTime: time + options.impact, key: layout.resolve(char) };
    });
    return new TypingScript(events, options);
  }

  get length(): number {
    return this.events.length;
  }

  /** Time of the last impact (0 for an empty script). */
  get endTime(): number {
    return this.events.length === 0 ? 0 : this.events[this.events.length - 1].impactTime;
  }

  /** Number of keystrokes whose key-down time is <= t, i.e. the carriage column at time t. */
  countStarted(t: number): number {
    let lo = 0;
    let hi = this.events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.events[mid].time <= t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Impact time of the keystroke at `index` (-1 when out of range). */
  impactOf(index: number): number {
    return this.events[index]?.impactTime ?? -1;
  }
}
