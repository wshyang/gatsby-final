// ---------------------------------------------------------------------------
//  Glyph particle – vertex stage
//
//  One instance = one typewritten character. The instance starts *exactly*
//  on its paper surface (aOrigin / aOriginQuat, derived from PaperSurface.
//  poseAt) and travels along a cubic Bézier towards aTarget / aTargetQuat.
//  All motion is a pure function of uTime, so the sequence can be scrubbed.
// ---------------------------------------------------------------------------

attribute vec3  aOrigin;      // rest position on the paper (world)
attribute vec4  aOriginQuat;  // rest orientation: +X reading dir, +Y up the page, +Z paper normal
attribute vec3  aTarget;      // destination (quote slot or drift point)
attribute vec4  aTargetQuat;  // destination orientation
attribute vec2  aGlyph;       // atlas cell origin
attribute vec4  aTiming;      // (appear, lift, duration, kind)   kind: -1 stay, 0 chaff, 1 member
attribute vec4  aSeed;        // per-particle random numbers
attribute vec2  aScale;       // (size on the paper, size at the destination)
attribute float aCarriage;    // 1 → follows the typewriter carriage while typing

uniform float uTime;
uniform vec3  uRefPos;        // reference camera of the sea (drift scales with distance to it)
uniform float uSeaOrigin;     // time at which the sea has formed (slow fall is zero here)
uniform float uSeaDim;        // 1 = full brightness, lower = dimmed while the quote forms
uniform float uCarriageX;
uniform float uFocusDist;     // glyph-only depth of field
uniform float uFocusRange;
uniform float uDeskFade;      // 1 = desk visible, 0 = dissolved
uniform float uDissolve;      // 0 … 1 at the very end
uniform float uFogDensity;
uniform vec2  uCellSize;
uniform float uPixelsPerUnit; // viewport height (device px) / (2·tan(fov/2))
uniform float uCellPx;        // atlas cell size in texels

varying vec2  vUv;
varying vec2  vLocal;         // 0‥1 inside the quad
varying float vAlpha;
varying float vDefocus;
varying float vBias;          // mip bias used to fake bokeh
varying float vLit;           // 0 = ink on paper … 1 = luminous airborne letter
varying float vFog;

const float PI = 3.141592653589793;

/* ---- quaternion helpers ---------------------------------------------- */
vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
vec4 qmul(vec4 a, vec4 b) {
  return vec4(a.w * b.xyz + b.w * a.xyz + cross(a.xyz, b.xyz), a.w * b.w - dot(a.xyz, b.xyz));
}
vec4 qaxis(vec3 axis, float ang) { float h = ang * 0.5; return vec4(normalize(axis) * sin(h), cos(h)); }
vec4 qnlerp(vec4 a, vec4 b, float t) { if (dot(a, b) < 0.0) b = -b; return normalize(mix(a, b, t)); }

/* ---- easing / curves --------------------------------------------------- */
float smooth01(float x) { return x * x * (3.0 - 2.0 * x); }

// Three-act member flight: a slow peel off the paper, a long glide, then a snap into the slot.
float easeOutBack(float x, float c) { float c3 = c + 1.0; float u = x - 1.0; return 1.0 + c3 * u * u * u + c * u * u; }
float flightEase(float p) {
  if (p < 0.30) { float s = p / 0.30; return 0.12 * s * s; }
  if (p < 0.78) { return 0.12 + 0.55 * (p - 0.30) / 0.48; }
  float s = (p - 0.78) / 0.22;
  return 0.67 + 0.33 * easeOutBack(s, 1.7);
}

// Slow, bounded drift of the sea of letters: sway, a gentle fall and a faint wind.
// Every term scales with distance from the reference camera, so the motion looks
// the same speed on screen at every depth.
vec3 seaDrift(vec3 base, float t, vec4 s) {
  float d = length(base - uRefPos);
  float tt = t - uSeaOrigin;
  vec3 drift = vec3(
      sin(t * (0.11 + 0.08 * s.x) + s.y * 40.0),
      sin(t * (0.09 + 0.07 * s.z) + s.w * 40.0) * 0.8,
      sin(t * (0.10 + 0.06 * s.y) + s.x * 40.0)) * (0.035 * d);
  drift += vec3(0.0, -0.0045 * d * tt, 0.0) * (0.6 + 0.8 * s.z);
  drift += vec3(-0.0025 * d * tt, 0.0, 0.0);
  return base + drift;
}
vec3 bezier(vec3 p0, vec3 p1, vec3 p2, vec3 p3, float t) {
  float u = 1.0 - t;
  return u * u * u * p0 + 3.0 * u * u * t * p1 + 3.0 * u * t * t * p2 + t * t * t * p3;
}

void main() {
  float t      = uTime;
  float appear = aTiming.x;
  float lift   = aTiming.y;
  float dur    = aTiming.z;
  float kind   = aTiming.w;
  bool  member = kind > 0.5;
  bool  chaff  = kind > -0.5 && kind < 0.5;

  // Glyphs typed live only exist once the type bar has struck the paper.
  float visible = appear < 0.0 ? 1.0 : step(appear, t);

  // Carriage-bound glyphs slide with the platen while the line is typed.
  vec3 origin = aOrigin + vec3(uCarriageX * aCarriage, 0.0, 0.0);

  // Flight progress 0 → 1 (kind -1 has lift = 1e9 and never leaves).
  float p = clamp((t - lift) / dur, 0.0, 1.0);
  float e = member ? flightEase(p) : smooth01(p);

  /* ---- trajectory ------------------------------------------------------ */
  vec3 n    = qrot(aOriginQuat, vec3(0.0, 0.0, 1.0));   // paper normal
  vec3 up   = vec3(0.0, 1.0, 0.0);
  // Sea glyphs keep drifting after they land; members settle on their slot.
  vec3 target = chaff ? seaDrift(aTarget, t, aSeed) : aTarget;
  vec3 span = target - origin;
  float dist = max(length(span), 1e-4);
  vec3 dir  = span / dist;
  vec3 side1 = normalize(cross(dir, abs(dir.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : up));
  vec3 side2 = cross(dir, side1);

  // 1) peel: the character lifts off the paper along its normal…
  vec3 c1 = origin + n * (0.05 + 0.14 * aSeed.x) + up * (0.03 + 0.08 * aSeed.y);
  // 2) …then swings out on a wide arc before converging on the destination.
  float arc = dist * (0.18 + 0.22 * aSeed.z);
  vec3 c2 = mix(origin, target, 0.62)
          + side1 * (aSeed.y - 0.5) * 2.0 * arc
          + up    * (0.4 + 0.4 * aSeed.w) * arc;

  vec3 pos = bezier(origin, c1, c2, target, e);

  // Spiral / turbulence while airborne (vanishes at both ends of the flight).
  float air   = sin(p * PI);
  float phase = t * (1.2 + aSeed.x) + aSeed.w * 6.2831853;
  float swirlR = (0.02 + 0.06 * aSeed.z) * dist * air;
  pos += (side1 * sin(phase) + side2 * cos(phase)) * swirlR;
  pos += up * sin(t * 0.9 + aSeed.y * 9.0) * 0.08 * air * (0.2 + e);

  // Settled letters breathe very slightly (phase tied to position so words move together).
  float settled = member ? step(0.999, p) : 0.0;
  pos += vec3(0.0, sin(t * 0.8 + aTarget.x * 0.35 + aTarget.y * 0.6) * 0.02 * aScale.y, 0.0) * settled;

  // End of the sequence: drift away from the viewer and dissolve.
  vec3 away = qrot(aTargetQuat, vec3(0.0, 0.0, -1.0));
  float dis = uDissolve * uDissolve;
  pos += (away * 3.0 + up * 1.5 + side1 * (aSeed.x - 0.5) * 3.0) * dis * (0.6 + aSeed.w);

  /* ---- orientation ------------------------------------------------------ */
  vec4 q = qnlerp(aOriginQuat, aTargetQuat, e);
  // Whole number of tumbles so the glyph lands exactly aligned with its slot.
  float turns = member ? floor(1.0 + aSeed.w * 2.0) : floor(1.0 + aSeed.w * 3.0);
  vec3 axis = normalize(vec3(aSeed.x - 0.5, aSeed.y - 0.5, aSeed.z - 0.5) + vec3(0.001));
  q = qmul(q, qaxis(axis, smooth01(p) * turns * 2.0 * PI));
  // dissolve: slow spin outwards
  q = qmul(q, qaxis(vec3(0.0, 1.0, 0.0), dis * 2.5 * (aSeed.z - 0.5)));

  /* ---- size & vertex ---------------------------------------------------- */
  float sc = mix(aScale.x, aScale.y, e);
  vec3 local = vec3(position.xy * sc, 0.0);
  // Sit a hair above the paper so the ink never z-fights with the page.
  vec3 world = pos + qrot(q, local) + n * 0.00035 * (1.0 - e);

  /* ---- visibility ---------------------------------------------------------- */
  float onPaper = 1.0 - step(0.0001, p);
  float alpha = visible;
  alpha *= mix(1.0, uDeskFade, onPaper);               // printed glyphs vanish with the desk
  // The sea stays: it only dims a little as it settles, then by uSeaDim while the quote forms.
  if (chaff) alpha *= (1.0 - 0.35 * smoothstep(0.55, 1.0, p)) * uSeaDim;
  alpha *= mix(0.84 + 0.16 * aSeed.z, 1.0, e);         // uneven ribbon strike on the page
  alpha *= 1.0 - uDissolve;

  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  float depth = -mv.z;
  float defocus = abs(depth - uFocusDist) / max(uFocusRange, 1e-3);
  // Bokeh is faked with a mip bias. Never let the total LOD exceed ~3.4 or the
  // blurred ink would smear across the whole atlas cell and read as a square.
  float quadPx = sc * uPixelsPerUnit / max(depth, 1e-3);
  float baseLod = log2(uCellPx / max(quadPx, 1.0));
  vBias = clamp(min(defocus * 2.0, 3.4 - baseLod), 0.0, 3.0);
  vDefocus = defocus;
  vFog = 1.0 - exp(-pow(depth * uFogDensity, 2.0));
  vLit = smoothstep(0.0, 0.45, p) * (member ? 1.0 : 0.78);
  vAlpha = alpha;
  vLocal = uv;
  vUv = aGlyph + uv * uCellSize;

  gl_Position = projectionMatrix * mv;
}
