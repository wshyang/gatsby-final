import { describe, expect, it } from "vitest";
import { GATSBY_CONTENT } from "./gatsby";
import { parseQuoteLine, quoteLine, STRONG_SCALE } from "./parseQuote";
import { lineText, type SceneContent } from "./types";
import { validateContent } from "./validate";

describe("parseQuoteLine", () => {
  it("parses plain words", () => {
    expect(parseQuoteLine("power of correction.")).toEqual([{ text: "power" }, { text: "of" }, { text: "correction." }]);
  });

  it("gives **strong** words the strong scale and strips the markers", () => {
    const words = parseQuoteLine("After Gatsby's **death,**");
    expect(words[2]).toEqual({ text: "death,", scale: STRONG_SCALE });
  });

  it("parses explicit scales", () => {
    expect(parseQuoteLine("was ^1.3^haunted^ for")[1]).toEqual({ text: "haunted", scale: 1.3 });
  });

  it("throws on unbalanced markup", () => {
    expect(() => parseQuoteLine("**death,")).toThrow(/unbalanced/);
  });

  it("throws on an empty line", () => {
    expect(() => parseQuoteLine("   ")).toThrow(/empty/);
  });
});

describe("quoteLine", () => {
  it("defaults the source to pages", () => {
    const l = quoteLine("a b", { size: 1, offset: [0, 0, 0], arrival: 1, wordStagger: 0.1 });
    expect(l.source).toBe("pages");
    expect(lineText(l)).toBe("a b");
  });
});

const base: SceneContent = {
  typedLine: "Hello world",
  sheetParagraphs: [],
  pages: [
    { paragraphs: ["abc"], x: 0, z: 0, yaw: 0, age: 0 },
    { paragraphs: ["abcdefghij klmnop"], x: 0, z: 0, yaw: 0, age: 0 },
  ],
  quote: [],
};

describe("validateContent", () => {
  it("passes untouched when every quote letter exists on the pages", () => {
    const content = { ...base, quote: [quoteLine("cab", { size: 1, offset: [0, 0, 0], arrival: 1, wordStagger: 0.1 })] };
    const out = validateContent(content);
    expect(out.warnings).toEqual([]);
    expect(out.content).toBe(content);
  });

  it("appends filler for missing letters to the least-full page without mutating the input", () => {
    const content = { ...base, quote: [quoteLine("zzz xx", { size: 1, offset: [0, 0, 0], arrival: 1, wordStagger: 0.1 })] };
    const out = validateContent(content);
    expect(out.warnings.join(" ")).toMatch(/lacked 5/);
    expect(out.content.pages[0].paragraphs).toEqual(["abc", "zzzxx"]);
    expect(content.pages[0].paragraphs).toEqual(["abc"]);
  });

  it("counts letters case-insensitively", () => {
    const content = { ...base, quote: [quoteLine("ABC", { size: 1, offset: [0, 0, 0], arrival: 1, wordStagger: 0.1 })] };
    expect(validateContent(content).warnings).toEqual([]);
  });

  it("warns when typed quote lines do not match the typed line", () => {
    const content = { ...base, quote: [quoteLine("Goodbye", { size: 1, offset: [0, 0, 0], arrival: 1, wordStagger: 0.1, source: "typed" })] };
    const out = validateContent(content);
    expect(out.warnings[0]).toMatch(/do not match the start of the typed line/);
  });

  it("accepts the default Gatsby content with no warnings", () => {
    expect(validateContent(GATSBY_CONTENT).warnings).toEqual([]);
  });

  it("uses the typed line for the first two default quote lines", () => {
    const typed = GATSBY_CONTENT.quote.filter((l) => l.source === "typed").map(lineText).join(" ");
    expect(GATSBY_CONTENT.typedLine).toBe(typed);
  });
});
