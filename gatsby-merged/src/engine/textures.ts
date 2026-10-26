import * as THREE from "three";
import { mulberry32 } from "./GlyphAtlas";

/**
 * Procedural textures (canvas based) so the whole prototype ships as a
 * single self-contained HTML file with no external assets.
 */

export interface PaperOptions {
  seed: number;
  width?: number;
  height?: number;
  /** Base tint; 0 = fresh cream, 1 = heavily aged. */
  age?: number;
  coffeeRing?: boolean;
  crease?: boolean;
}

/** Aged typewriter bond paper. The text itself is NOT baked in – glyphs are instanced quads. */
export function makePaperTexture(opts: PaperOptions): THREE.CanvasTexture {
  const w = opts.width ?? 512;
  const h = opts.height ?? 660;
  const rnd = mulberry32(opts.seed);
  const age = opts.age ?? 0.5;

  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;

  // Base: warm cream, darker with age.
  const base = new THREE.Color().setHSL(0.105, 0.38 + age * 0.12, 0.84 - age * 0.14);
  ctx.fillStyle = `#${base.getHexString()}`;
  ctx.fillRect(0, 0, w, h);

  // Soft foxing blotches.
  for (let i = 0; i < 14; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 40 + rnd() * 160;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const tint = rnd() < 0.5 ? "120,85,40" : "150,120,70";
    g.addColorStop(0, `rgba(${tint},${0.05 + rnd() * 0.09 * age})`);
    g.addColorStop(1, `rgba(${tint},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // Edge darkening / handling wear.
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  vg.addColorStop(0, "rgba(90,60,30,0)");
  vg.addColorStop(1, `rgba(90,60,30,${0.12 + 0.2 * age})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  if (opts.crease) {
    // A horizontal fold line, slightly lighter above and darker below.
    const y = h * (0.46 + rnd() * 0.08);
    const g = ctx.createLinearGradient(0, y - 6, 0, y + 6);
    g.addColorStop(0, "rgba(255,250,240,0)");
    g.addColorStop(0.45, "rgba(255,250,240,0.35)");
    g.addColorStop(0.55, "rgba(80,60,40,0.25)");
    g.addColorStop(1, "rgba(80,60,40,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 6, w, 12);
  }

  if (opts.coffeeRing) {
    const x = w * (0.2 + rnd() * 0.6);
    const y = h * (0.2 + rnd() * 0.6);
    const r = 70 + rnd() * 40;
    ctx.strokeStyle = "rgba(110,70,30,0.22)";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(110,70,30,0.10)";
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.arc(x, y, r - 4, 0.3, Math.PI * 1.4);
    ctx.stroke();
  }

  // Fine fibre grain.
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 18;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n * 0.8;
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Dark walnut desk top with long grain streaks. */
export function makeWoodTexture(seed = 7): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const rnd = mulberry32(seed);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#2a1a10";
  ctx.fillRect(0, 0, w, h);

  // Long grain streaks.
  for (let i = 0; i < 420; i++) {
    const y = rnd() * h;
    const len = 200 + rnd() * 900;
    const x = rnd() * w - 200;
    const light = rnd() < 0.5;
    ctx.strokeStyle = light ? `rgba(120,80,45,${0.05 + rnd() * 0.12})` : `rgba(10,5,2,${0.08 + rnd() * 0.18})`;
    ctx.lineWidth = 0.6 + rnd() * 2.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + len * 0.3, y + (rnd() - 0.5) * 8, x + len * 0.6, y + (rnd() - 0.5) * 8, x + len, y + (rnd() - 0.5) * 6);
    ctx.stroke();
  }
  // Broad tonal variation.
  for (let i = 0; i < 10; i++) {
    const g = ctx.createLinearGradient(0, rnd() * h, 0, rnd() * h);
    g.addColorStop(0, "rgba(60,35,18,0)");
    g.addColorStop(0.5, `rgba(60,35,18,${0.15 + rnd() * 0.2})`);
    g.addColorStop(1, "rgba(60,35,18,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 10;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** Glossy-but-worn black enamel: tiny speckles + scratches used as a roughness map. */
export function makeEnamelRoughness(seed = 3): THREE.CanvasTexture {
  const s = 256;
  const rnd = mulberry32(seed);
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#555";
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 160; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.05 + rnd() * 0.25})`;
    ctx.lineWidth = 0.5 + rnd();
    ctx.beginPath();
    const x = rnd() * s;
    const y = rnd() * s;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() - 0.5) * 80, y + (rnd() - 0.5) * 20);
    ctx.stroke();
  }
  const img = ctx.getImageData(0, 0, s, s);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 30;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Gold maker's plate for the front of the typewriter housing. */
export function makeTypewriterDecal(text = "UNDERWOOD", subtitle = "STANDARD TYPEWRITER  •  NEW YORK"): THREE.CanvasTexture {
  const w = 512;
  const h = 128;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(216, 178, 92, 0.85)";
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 14, w - 20, h - 28);
  ctx.strokeStyle = "rgba(216, 178, 92, 0.45)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(18, 22, w - 36, h - 44);

  ctx.fillStyle = "rgba(232, 196, 110, 0.92)";
  ctx.font = 'bold 34px Georgia, "Times New Roman", serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(Array.from(text).join(" "), w / 2, h / 2 - 8);

  ctx.fillStyle = "rgba(210, 172, 88, 0.75)";
  ctx.font = '16px Georgia, "Times New Roman", serif';
  ctx.fillText(subtitle, w / 2, h / 2 + 24);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
