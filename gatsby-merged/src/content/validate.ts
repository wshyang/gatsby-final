import { normalizeChar } from "../engine/GlyphAtlas";
import { lineText, type PageSpec, type SceneContent } from "./types";

export interface ValidationResult {
  /** Content with filler appended where the pages lacked quote letters. Input is never mutated. */
  content: SceneContent;
  warnings: string[];
}

/** Case-folded, normalised key used for harvesting (the mapper falls back across case). */
function key(ch: string): string {
  return normalizeChar(ch).toLowerCase();
}

function countLetters(texts: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const text of texts) {
    for (const raw of text) {
      if (/\s/.test(raw)) continue;
      const k = key(raw);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  return counts;
}

function pageLength(page: PageSpec): number {
  return page.paragraphs.reduce((n, p) => n + p.length, 0);
}

/**
 * Enforce the "no spawning out of nowhere" rule on the content:
 *
 *  - every character of a "pages" quote line must exist on the pages (case-insensitively),
 *    otherwise a filler word made of the missing characters is appended to the
 *    least-full page and a warning is returned;
 *  - "typed" quote lines must be consumed in order from the typed line, otherwise
 *    a warning is returned (the mapper then falls back to harvesting from the pages).
 */
export function validateContent(content: SceneContent): ValidationResult {
  const warnings: string[] = [];

  const typedNeeded = content.quote.filter((l) => l.source === "typed").map(lineText);
  const typedStream = Array.from(content.typedLine).filter((c) => !/\s/.test(c)).map(key).join("");
  const typedWanted = Array.from(typedNeeded.join("").replace(/\s/g, "")).map(key).join("");
  const typedMatches = typedStream.startsWith(typedWanted);
  if (!typedMatches) {
    warnings.push(`typed quote lines "${typedNeeded.join(" / ")}" do not match the start of the typed line "${content.typedLine}"`);
  }

  const available = countLetters(content.pages.flatMap((p) => p.paragraphs));
  const needed = countLetters(content.quote.filter((l) => l.source === "pages").map(lineText));
  // Typed lines that do not match fall back to harvesting from the pages.
  if (!typedMatches) {
    for (const [k, n] of countLetters(typedNeeded)) needed.set(k, (needed.get(k) ?? 0) + n);
  }

  let filler = "";
  for (const [k, n] of needed) {
    const missing = n - (available.get(k) ?? 0);
    if (missing > 0) filler += k.repeat(missing);
  }

  if (filler.length === 0) return { content, warnings };

  warnings.push(`pages lacked ${filler.length} quote letter(s) (${Array.from(new Set(filler)).join("")}); appended filler text`);
  if (content.pages.length === 0) {
    warnings.push("no pages to hold filler; quote letters will be cloned from the nearest glyph");
    return { content, warnings };
  }

  let target = 0;
  content.pages.forEach((p, i) => {
    if (pageLength(p) < pageLength(content.pages[target])) target = i;
  });
  const pages = content.pages.map((p, i) => (i === target ? { ...p, paragraphs: [...p.paragraphs, filler] } : p));
  return { content: { ...content, pages }, warnings };
}
