import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/**
 * PostFX
 * ------
 * render → bloom (HDR) → tone-map/sRGB → film grade (vignette, grain, fade).
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uFade: { value: 1 },
    uVignette: { value: 1.1 },
    uGrain: { value: 0.035 },
    uWarmth: { value: 0 },
    /** 0 = warm lamplit desk, 1 = cool misty city. */
    uCity: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uFade;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uWarmth;
    uniform float uCity;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      // Gentle split tone: warm lift in the shadows, cooler highlights.
      float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      vec3 warm = vec3(1.04, 0.99, 0.93);
      vec3 cool = vec3(0.97, 0.99, 1.05);
      c.rgb *= mix(warm, cool, smoothstep(0.2, 0.9, lum)) * mix(1.0, 1.0, uWarmth);
      // The misty teal-grey look of the city (opus grade): desaturate, cool tint, lift the blacks.
      vec3 grey = vec3(dot(c.rgb, vec3(0.3, 0.55, 0.15)));
      vec3 city = mix(grey, c.rgb, 0.78) * vec3(0.9, 1.0, 1.05) + vec3(0.006, 0.012, 0.016);
      c.rgb = mix(c.rgb, city, uCity);
      // Vignette (a little stronger and slightly oval over the city)
      vec2 p = (vUv - 0.5) * mix(vec2(1.0), vec2(1.0, 1.2), uCity);
      float v = 1.0 - dot(p, p) * mix(uVignette, 1.15, uCity);
      c.rgb *= clamp(v, 0.0, 1.0);
      // Film grain
      float g = hash(vUv * 1000.0 + fract(uTime * 7.31) * 100.0) - 0.5;
      c.rgb += g * mix(uGrain, 0.045, uCity) * (0.4 + 0.6 * (1.0 - lum));
      c.rgb *= uFade;
      gl_FragColor = vec4(c.rgb, 1.0);
    }
  `,
};

export class PostFX {
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  readonly grade: ShaderPass;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, width: number, height: number) {
    const pr = renderer.getPixelRatio();
    const target = new THREE.WebGLRenderTarget(Math.max(1, width * pr), Math.max(1, height * pr), { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.3, 0.4, 0.95);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.setSize(width, height, renderer.getPixelRatio());
  }

  setSize(width: number, height: number, pixelRatio: number) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.bloom.setSize(width * pixelRatio, height * pixelRatio);
  }

  /** @param city 0‥1 blend from the warm desk grade to the cool city grade. */
  update(time: number, fade: number, city: number) {
    this.grade.uniforms.uTime.value = time;
    this.grade.uniforms.uFade.value = fade;
    this.grade.uniforms.uCity.value = city;
  }

  render() {
    this.composer.render();
  }

  dispose() {
    this.composer.dispose();
  }
}
