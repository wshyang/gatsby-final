/**
 * Everything the scene needs to know about *what* is typed, printed and
 * floated. Swap this object to change the quote, its highlighted words, the
 * text on the pages or the page arrangement; no layout or mapping code holds
 * any strings of its own.
 */

/** One word of the quote. */
export interface WordSpec {
  text: string;
  /** Glyph size multiplier for this word (default 1). */
  scale?: number;
}

export type QuoteSource = "typed" | "pages";

export interface QuoteLineSpec {
  words: WordSpec[];
  /** Glyph quad size (world units) of the line. */
  size: number;
  /** Offset from the formation centre, in camera space (right, up, towards camera). */
  offset: readonly [number, number, number];
  /** Second at which the first word locks into place. */
  arrival: number;
  /** Seconds between consecutive words locking in. */
  wordStagger: number;
  /**
   * Where the letters are harvested from:
   *  - "typed": the line the typewriter types live (identity mapping by column)
   *  - "pages": nearest same-character glyphs on the scattered pages
   */
  source: QuoteSource;
}

export interface PageSpec {
  /** Paragraphs typed onto this page. */
  paragraphs: string[];
  /**
   * Position on the desk (metres) and rotation about the vertical axis (radians).
   * Omit to take the desk's own page anchors, so swapping the desk rearranges the pages.
   */
  x?: number;
  z?: number;
  yaw?: number;
  /** 0 = fresh, 1 = badly aged. */
  age: number;
  /**
   * Fill the page to the bottom by repeating its paragraphs (default true).
   * Every printed letter lifts into the sea, so fuller pages give a denser sea.
   */
  fill?: boolean;
  coffeeRing?: boolean;
  crease?: boolean;
}

export interface SceneContent {
  /** Typed live on the platen sheet. */
  typedLine: string;
  /** Paragraphs already on the platen sheet, above the typed line. */
  sheetParagraphs: string[];
  pages: PageSpec[];
  quote: QuoteLineSpec[];
}

/** Plain text of a quote line (words joined by single spaces). */
export function lineText(line: QuoteLineSpec): string {
  return line.words.map((w) => w.text).join(" ");
}
