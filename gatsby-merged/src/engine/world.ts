/**
 * World-space constants shared by the typewriter, desk, layout and scene.
 * Units are metres; the desk surface sits at y = 0.
 */

/** 10 characters per inch / 6 lines per inch (12pt pica typewriter). */
export const TYPE = {
  cellWidth: 0.0254 / 10,
  lineHeight: 0.0254 / 6,
  /** Square glyph quad side as multiple of the line height (room for descenders + ink spread). */
  quadScale: 1.25,
  columns: 65,
  pageWidth: 0.216,
  pageHeight: 0.279,
  marginLeft: 0.026,
  marginTop: 0.03,
} as const;

export const WORLD = {
  /** y of the city ground plane. */
  cityGround: -205,
  /** Platen centre in typewriter space. */
  platenCenter: [0, 0.185, -0.14] as const,
  platenRadius: 0.022,
} as const;

export const PALETTE = {
  ink: 0x1b1a22,
  cream: 0xfff1d6,
  gold: 0xd9b45b,
  deskFog: 0x0a0705,
  /** Opus city haze, linear-ish teal grey. */
  cityFog: 0x546670,
} as const;
