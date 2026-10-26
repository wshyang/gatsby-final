/**
 * Keyboard layout: which key types which character, and which type bar
 * (strike arm) belongs to which key. Pure data + lookup, no THREE.
 *
 * Swap the layout to change what each key and strike arm types. A key
 * carries a lower- and an upper-case character; the upper one needs shift.
 */

export interface KeySpec {
  /** Unique id; also the id of the type bar that belongs to this key. */
  id: string;
  lower: string;
  /** Character typed with shift held (defaults to the lower character upper-cased). */
  upper?: string;
}

export interface KeyboardLayout {
  /** Rows from the front (nearest the typist) to the back. */
  rows: KeySpec[][];
  /** Key ids in the order their bars sit around the basket, left to right. Defaults to an interleaved order. */
  barOrder?: string[];
  /** Id of the key used for the space bar. */
  spaceId?: string;
}

export interface ResolvedKey {
  keyId: string;
  /** Index of the key in row-major order (front row first); -1 for the space bar. */
  keyIndex: number;
  /** Index of this key's bar around the basket, or -1 for space. */
  barIndex: number;
  shift: boolean;
}

const k = (id: string, lower: string, upper?: string): KeySpec => ({ id, lower, upper });
const letters = (s: string): KeySpec[] => Array.from(s).map((c) => k(c.toLowerCase(), c.toLowerCase(), c.toUpperCase()));

/** A 1920s four-row QWERTY with a type bar per key. */
export const DEFAULT_LAYOUT: KeyboardLayout = {
  rows: [
    [...letters("ZXCVBNM"), k("comma", ",", "?"), k("period", "."), k("hyphen", "-")],
    [...letters("ASDFGHJKL"), k("semicolon", ";", ":")],
    letters("QWERTYUIOP"),
    [k("1", "1", "!"), k("2", "2", '"'), k("3", "3", "#"), k("4", "4", "$"), k("5", "5", "%"), k("6", "6", "_"), k("7", "7", "&"), k("8", "8", "'"), k("9", "9", "("), k("0", "0", ")")],
  ],
  spaceId: "space",
};

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Spread neighbouring keys around the basket (like a real segment: keys that are adjacent on the keyboard are far apart on it). */
export function interleavedBarOrder(keyIds: readonly string[]): string[] {
  const n = keyIds.length;
  let step = 17 % n || 1;
  while (gcd(step, n) !== 1) step++;
  return keyIds.map((_, i) => keyIds[(i * step) % n]);
}

/** Immutable lookup built from a KeyboardLayout. */
export class ResolvedLayout {
  readonly keys: readonly KeySpec[];
  readonly rowOfKey: readonly number[];
  readonly barOrder: readonly string[];
  readonly spaceId: string;
  private readonly byChar = new Map<string, { keyIndex: number; shift: boolean }>();
  private readonly keyIndexById = new Map<string, number>();
  private readonly barIndexById = new Map<string, number>();

  constructor(readonly layout: KeyboardLayout) {
    const keys: KeySpec[] = [];
    const rowOfKey: number[] = [];
    layout.rows.forEach((row, r) =>
      row.forEach((key) => {
        keys.push(key);
        rowOfKey.push(r);
      }),
    );
    this.keys = keys;
    this.rowOfKey = rowOfKey;
    this.spaceId = layout.spaceId ?? "space";

    keys.forEach((key, i) => {
      if (this.keyIndexById.has(key.id)) throw new Error(`layout: duplicate key id "${key.id}"`);
      this.keyIndexById.set(key.id, i);
      const upper = key.upper ?? key.lower.toUpperCase();
      this.claim(key.lower, i, false, key.id);
      if (upper !== key.lower) this.claim(upper, i, true, key.id);
    });

    this.barOrder = layout.barOrder ?? interleavedBarOrder(keys.map((x) => x.id));
    if (this.barOrder.length !== keys.length) throw new Error(`layout: barOrder has ${this.barOrder.length} entries for ${keys.length} keys`);
    this.barOrder.forEach((id, i) => {
      if (!this.keyIndexById.has(id)) throw new Error(`layout: barOrder names unknown key "${id}"`);
      if (this.barIndexById.has(id)) throw new Error(`layout: barOrder repeats key "${id}"`);
      this.barIndexById.set(id, i);
    });
  }

  private claim(char: string, keyIndex: number, shift: boolean, keyId: string) {
    if (this.byChar.has(char)) throw new Error(`layout: character "${char}" is typed by more than one key (second: "${keyId}")`);
    this.byChar.set(char, { keyIndex, shift });
  }

  get barCount(): number {
    return this.barOrder.length;
  }

  has(char: string): boolean {
    return char === " " || this.byChar.has(char);
  }

  /** Which key / bar / shift types `char`; null when this layout cannot type it. */
  resolve(char: string): ResolvedKey | null {
    if (char === " ") return { keyId: this.spaceId, keyIndex: -1, barIndex: -1, shift: false };
    const hit = this.byChar.get(char);
    if (!hit) return null;
    const keyId = this.keys[hit.keyIndex].id;
    return { keyId, keyIndex: hit.keyIndex, barIndex: this.barIndexById.get(keyId) ?? -1, shift: hit.shift };
  }

  keyIndexOf(id: string): number {
    return this.keyIndexById.get(id) ?? -1;
  }

  /** Characters of `text` this layout cannot type (deduplicated). */
  unsupported(text: string): string[] {
    return Array.from(new Set(Array.from(text).filter((c) => !this.has(c))));
  }
}
