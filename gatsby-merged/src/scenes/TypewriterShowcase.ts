import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Desk, PLAIN_DESK, type DeskOptions } from "../assets/desk/Desk";
import { PlatenSheet } from "../assets/desk/PaperSurface";
import { DEFAULT_LAYOUT, type KeyboardLayout } from "../assets/typewriter/layout";
import { carriageXAtColumn, Typewriter } from "../assets/typewriter/Typewriter";
import { newPose, TypewriterDriver } from "../assets/typewriter/TypewriterDriver";
import { TypingScript } from "../assets/typewriter/TypingScript";
import { GlyphAtlas, waitForFont } from "../engine/GlyphAtlas";
import { makePaperTexture } from "../engine/textures";

/**
 * TypewriterShowcase
 * ------------------
 * The typewriter asset in a second, unrelated scene: a bare desk, one machine,
 * and whatever text you give it. It imports nothing from the Gatsby scene,
 * which is the proof that the typewriter is reusable. Use it to check which
 * key and strike arm types each letter, or to try a custom KeyboardLayout.
 */
export interface ShowcaseOptions {
  text?: string;
  layout?: KeyboardLayout;
  desk?: DeskOptions;
  /** Seconds between keystrokes. */
  interval?: number;
  /** Camera position and look-at, metres. */
  camera?: { pos: readonly [number, number, number]; look: readonly [number, number, number]; fov: number };
}

export const DEFAULT_SHOWCASE_TEXT = "Hello, World! The quick brown fox jumps over the lazy dog.";
const START = 0.6;
const IMPACT = 0.045;
const TAIL = 2.5;
const DEFAULT_INTERVAL = 0.12;
const DEFAULT_CAMERA = { pos: [0.12, 0.33, 0.08], look: [-0.01, 0.13, -0.25], fov: 40 } as const;

export class TypewriterShowcase {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.02, 50);
  readonly duration: number;
  time = 0;
  playing = true;
  loop = true;

  private typewriter!: Typewriter;
  private driver!: TypewriterDriver;
  private readonly pose = newPose();
  private raf = 0;
  private lastStamp = 0;
  private disposed = false;
  private readonly text: string;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: ShowcaseOptions = {},
  ) {
    this.text = options.text ?? DEFAULT_SHOWCASE_TEXT;
    this.duration = START + this.text.length * (options.interval ?? DEFAULT_INTERVAL) + TAIL;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.background = new THREE.Color(0x15110e);
  }

  async init() {
    await waitForFont("Special Elite");
    if (this.disposed) return;
    const legendAtlas = new GlyphAtlas({
      chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890,.?;:'\"-!#$%&_()",
      cell: 64,
      cols: 8,
      family: `Georgia, "Times New Roman", serif`,
      emScale: 0.62,
      baselineShift: 0.34,
      distress: false,
    });

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.12;
    pmrem.dispose();

    const desk = new Desk(this.options.desk ?? PLAIN_DESK);
    this.scene.add(desk.group);
    this.typewriter = new Typewriter({ legendAtlas, layout: this.options.layout ?? DEFAULT_LAYOUT });
    this.typewriter.group.position.set(0, 0, -0.22);
    this.typewriter.group.updateMatrixWorld(true);
    desk.group.add(this.typewriter.group);
    this.typewriter.attachSheet(new PlatenSheet(0, this.typewriter.group.matrixWorld, 1, makePaperTexture({ seed: 500, age: 0.2 })).mesh);

    const script = TypingScript.fromText(this.text, this.typewriter.layout, {
      start: START,
      interval: this.options.interval ?? DEFAULT_INTERVAL,
      impact: IMPACT,
    });
    this.driver = new TypewriterDriver(script);

    const cam = this.options.camera ?? DEFAULT_CAMERA;
    this.camera.fov = cam.fov;
    this.camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]);
    this.camera.lookAt(cam.look[0], cam.look[1], cam.look[2]);
    this.resize();
    this.apply(0);
    this.start();
  }

  /** Characters of the text the chosen layout cannot type. */
  get unsupported(): string[] {
    return this.typewriter ? this.typewriter.layout.unsupported(this.text) : [];
  }

  setTime(t: number) {
    this.time = THREE.MathUtils.clamp(t, 0, this.duration);
    this.apply(this.time);
  }

  private apply(t: number) {
    const pose = this.driver.poseAt(t, this.pose);
    this.typewriter.setCarriageX(carriageXAtColumn(pose.column));
    this.typewriter.apply(pose);
  }

  private start() {
    this.lastStamp = performance.now();
    const tick = (now: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - this.lastStamp) / 1000);
      this.lastStamp = now;
      if (this.playing) {
        this.time += dt;
        if (this.time >= this.duration) this.time = this.loop ? 0 : this.duration;
      }
      this.apply(this.time);
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(tick);
  }

  resize() {
    const parent = this.canvas.parentElement;
    const w = parent?.clientWidth || window.innerWidth;
    const h = parent?.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
    this.renderer.dispose();
  }
}
