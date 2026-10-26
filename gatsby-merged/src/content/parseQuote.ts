import type { QuoteLineSpec, QuoteSource, WordSpec } from "./types";

/** Scale given to a word wrapped in `**double asterisks**`. */
export const STRONG_SCALE = 1.4;

/**
 * Parse one line of quote markup into words.
 *
 *   "After Gatsby's **death,**"           → "death," gets STRONG_SCALE
 *   "New York was ^1.25^haunted^ for me"  → "haunted" gets scale 1.25
 *
 * Words are separated by whitespace. A marked span must not contain spaces.
 */
export function parseQuoteLine(markup: string): WordSpec[] {
  const words: WordSpec[] = [];
  for (const token of markup.trim().split(/\s+/)) {
    if (token.length === 0) continue;
    const strong = /^\*\*(.+)\*\*$/.exec(token);
    if (strong) {
      words.push({ text: strong[1], scale: STRONG_SCALE });
      continue;
    }
    const scaled = /^\^(\d+(?:\.\d+)?)\^(.+)\^$/.exec(token);
    if (scaled) {
      const scale = Number(scaled[1]);
      if (!(scale > 0)) throw new Error(`parseQuoteLine: scale must be positive in "${token}"`);
      words.push({ text: scaled[2], scale });
      continue;
    }
    if (/\*\*|\^/.test(token)) throw new Error(`parseQuoteLine: unbalanced markup in "${token}"`);
    words.push({ text: token });
  }
  if (words.length === 0) throw new Error("parseQuoteLine: empty line");
  return words;
}

export interface QuoteLineOptions {
  size: number;
  offset: readonly [number, number, number];
  arrival: number;
  wordStagger: number;
  source?: QuoteSource;
}

/** Build a QuoteLineSpec from markup. `source` defaults to "pages". */
export function quoteLine(markup: string, opts: QuoteLineOptions): QuoteLineSpec {
  return {
    words: parseQuoteLine(markup),
    size: opts.size,
    offset: opts.offset,
    arrival: opts.arrival,
    wordStagger: opts.wordStagger,
    source: opts.source ?? "pages",
  };
}
