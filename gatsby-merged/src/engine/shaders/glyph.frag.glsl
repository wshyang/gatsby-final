// ---------------------------------------------------------------------------
//  Glyph particle – fragment stage
//  Samples the typewriter atlas; defocus is faked per-particle with a mip
//  bias (cheap bokeh) plus an alpha roll-off and a soft quad edge.
// ---------------------------------------------------------------------------
uniform sampler2D uAtlas;
uniform vec3  uInk;
uniform vec3  uCream;
uniform vec3  uFogColor;
uniform float uOpacity;

varying vec2  vUv;
varying vec2  vLocal;
varying float vAlpha;
varying float vDefocus;
varying float vBias;
varying float vLit;
varying float vFog;

void main() {
  float ink = texture2D(uAtlas, vUv, vBias).a;
  // Blurred glyphs: feather the quad border so nothing reads as a hard square.
  float border = max(abs(vLocal.x - 0.5), abs(vLocal.y - 0.5));
  float feather = smoothstep(0.5, 0.36, border);
  // Bokeh is round, never square: out-of-focus letters fade into soft discs.
  float disc = 1.0 - smoothstep(0.18, 0.46, length(vLocal - 0.5));
  float soften = clamp(vBias / 2.5, 0.0, 1.0);
  ink *= mix(1.0, mix(feather, disc, smoothstep(0.6, 2.2, vBias)), soften);
  // Out-of-focus letters thin out like bokeh.
  float soft = 1.0 / (1.0 + vDefocus * 0.9);
  float a = ink * vAlpha * soft * uOpacity;
  if (a < 0.004) discard;

  // Dark ribbon ink on paper → warm luminous letter once airborne.
  vec3 col = mix(uInk, uCream * (1.0 + 0.4 * vLit), vLit);
  col = mix(col, uFogColor, vFog * (1.0 - 0.35 * vLit));

  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
