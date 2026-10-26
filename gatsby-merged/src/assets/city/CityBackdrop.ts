import * as THREE from "three";
import { OpusCity } from "./OpusCity";
import cityUrl from "./city.jpg";

export interface CityBackdropOptions {
  /** Defaults to the bundled city.jpg import. */
  imageUrl?: string;
}

export interface CityBackdropState {
  /** Scene time in seconds. */
  time: number;
  /** Seconds since the city camera started drifting: max(0, time - 10). */
  elapsed: number;
  /** 0 = sharp, 1 = fully blurred (radius = 0.6 + 2.6*blur, two passes, as opus). */
  blur: number;
}

const CITY_NEAR = 2;
const CITY_FAR = 12000;
const BLUR_RADIUS_BASE = 0.6;
const BLUR_RADIUS_GAIN = 2.6;
/** Second blur pass is wider, as in opus. */
const BLUR_SECOND_PASS_SCALE = 2.2;
const BLUR_MIX_GAIN = 1.15;
const MSAA_SAMPLES = 4;
/** Drift of the helicopter-scale city camera relative to the desk camera. */
const DRIFT = { x: 3.2, y0: 90, y: 0.6, z0: 140, z: -5.5 } as const;

const quadVert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

function makeBlurMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { tInput: { value: null }, uDir: { value: new THREE.Vector2() } },
    vertexShader: quadVert,
    fragmentShader: /* glsl */ `
      uniform sampler2D tInput; uniform vec2 uDir; varying vec2 vUv;
      void main(){
        vec3 c = texture2D(tInput, vUv).rgb * 0.227;
        c += (texture2D(tInput, vUv + uDir * 1.385).rgb + texture2D(tInput, vUv - uDir * 1.385).rgb) * 0.316;
        c += (texture2D(tInput, vUv + uDir * 3.231).rgb + texture2D(tInput, vUv - uDir * 3.231).rgb) * 0.070;
        gl_FragColor = vec4(c, 1.0);
      }`,
    depthTest: false,
    depthWrite: false,
  });
}

function makeMixMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { tCity: { value: null }, tBlur: { value: null }, uBlur: { value: 1 } },
    vertexShader: quadVert,
    fragmentShader: /* glsl */ `
      uniform sampler2D tCity, tBlur; uniform float uBlur; varying vec2 vUv;
      void main(){
        gl_FragColor = vec4(mix(texture2D(tCity, vUv).rgb, texture2D(tBlur, vUv).rgb, uBlur), 1.0);
      }`,
    depthTest: false,
    depthWrite: false,
  });
}

function makeFullscreenTriangle(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  return geo;
}

/**
 * Renders the NYC aerial backdrop on its own camera (near 2 / far 12000) into a
 * linear HalfFloat texture, optionally blurred, for use as `scene.background`.
 * No tone mapping, gamma, vignette or grain is applied here.
 */
export class CityBackdrop {
  readonly texture: THREE.Texture;
  readonly fogColor: THREE.Color;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly city = new OpusCity();
  private readonly camCity = new THREE.PerspectiveCamera(40, 1, CITY_NEAR, CITY_FAR);
  private readonly rtCity: THREE.WebGLRenderTarget;
  private readonly rtA: THREE.WebGLRenderTarget;
  private readonly rtB: THREE.WebGLRenderTarget;
  private readonly rtOut: THREE.WebGLRenderTarget;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh;
  private readonly blurMat = makeBlurMaterial();
  private readonly mixMat = makeMixMaterial();
  private readonly savedClear = new THREE.Color();
  private isReady = false;
  private isDisposed = false;

  constructor(renderer: THREE.WebGLRenderer, options: CityBackdropOptions = {}) {
    this.renderer = renderer;
    this.fogColor = this.city.fog;

    const opts = { type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace } as const;
    this.rtCity = new THREE.WebGLRenderTarget(1, 1, { ...opts, depthBuffer: true, samples: MSAA_SAMPLES });
    this.rtA = new THREE.WebGLRenderTarget(1, 1, { ...opts, depthBuffer: false });
    this.rtB = new THREE.WebGLRenderTarget(1, 1, { ...opts, depthBuffer: false });
    this.rtOut = new THREE.WebGLRenderTarget(1, 1, { ...opts, depthBuffer: false });
    this.texture = this.rtOut.texture;

    this.quad = new THREE.Mesh(makeFullscreenTriangle(), this.blurMat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    new THREE.TextureLoader().load(options.imageUrl ?? cityUrl, (tex) => {
      if (this.isDisposed) {
        tex.dispose();
        return;
      }
      this.city.setPainting(tex);
      this.isReady = true;
    });
  }

  get ready(): boolean {
    return this.isReady;
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    const w = Math.max(1, Math.round(width * pixelRatio));
    const h = Math.max(1, Math.round(height * pixelRatio));
    const hw = Math.max(1, Math.floor(w / 2));
    const hh = Math.max(1, Math.floor(h / 2));
    this.rtCity.setSize(w, h);
    this.rtOut.setSize(w, h);
    this.rtA.setSize(hw, hh);
    this.rtB.setSize(hw, hh);
  }

  render(deskCamera: THREE.PerspectiveCamera, state: CityBackdropState): void {
    this.updateCamera(deskCamera, state.elapsed);
    this.city.update(state.time, this.camCity);

    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevAutoClear = r.autoClear;
    const prevAlpha = r.getClearAlpha();
    r.getClearColor(this.savedClear);
    const prevCubeFace = r.getActiveCubeFace();
    const prevMip = r.getActiveMipmapLevel();

    r.autoClear = true;
    r.setRenderTarget(this.rtCity);
    r.render(this.city.scene, this.camCity);

    const mixAmount = Math.min(1, state.blur * BLUR_MIX_GAIN);
    if (mixAmount > 0) this.blurChain(state.blur);
    this.mixInto(mixAmount);

    r.autoClear = prevAutoClear;
    r.setClearColor(this.savedClear, prevAlpha);
    r.setRenderTarget(prevTarget, prevCubeFace, prevMip);
  }

  dispose(): void {
    this.isDisposed = true;
    this.city.dispose();
    this.quad.geometry.dispose();
    this.blurMat.dispose();
    this.mixMat.dispose();
    [this.rtCity, this.rtA, this.rtB, this.rtOut].forEach((t) => t.dispose());
  }

  private updateCamera(desk: THREE.PerspectiveCamera, e: number): void {
    const cam = this.camCity;
    cam.quaternion.copy(desk.quaternion);
    if (cam.fov !== desk.fov || cam.aspect !== desk.aspect) {
      cam.fov = desk.fov;
      cam.aspect = desk.aspect;
      cam.updateProjectionMatrix();
    }
    cam.position.set(
      desk.position.x + DRIFT.x * e,
      desk.position.y + DRIFT.y0 + DRIFT.y * e,
      desk.position.z + DRIFT.z0 + DRIFT.z * e,
    );
    cam.updateMatrixWorld();
  }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget): void {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  /** Two separable Gaussian passes at half resolution (H, V, wider H, wider V). Result in rtB. */
  private blurChain(blur: number): void {
    const bu = this.blurMat.uniforms;
    const px = 1 / this.rtA.width;
    const py = 1 / this.rtA.height;
    const rad = BLUR_RADIUS_BASE + BLUR_RADIUS_GAIN * blur;
    const wide = rad * BLUR_SECOND_PASS_SCALE;
    const dir = bu.uDir.value as THREE.Vector2;

    bu.tInput.value = this.rtCity.texture;
    dir.set(px * rad, 0);
    this.pass(this.blurMat, this.rtA);
    bu.tInput.value = this.rtA.texture;
    dir.set(0, py * rad);
    this.pass(this.blurMat, this.rtB);
    bu.tInput.value = this.rtB.texture;
    dir.set(px * wide, 0);
    this.pass(this.blurMat, this.rtA);
    bu.tInput.value = this.rtA.texture;
    dir.set(0, py * wide);
    this.pass(this.blurMat, this.rtB);
  }

  private mixInto(mixAmount: number): void {
    const u = this.mixMat.uniforms;
    u.tCity.value = this.rtCity.texture;
    u.tBlur.value = this.rtB.texture;
    u.uBlur.value = mixAmount;
    this.pass(this.mixMat, this.rtOut);
  }
}
