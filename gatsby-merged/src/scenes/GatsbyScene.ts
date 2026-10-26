import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { CityBackdrop } from "../assets/city/CityBackdrop";
import { Desk, WALNUT_DESK, type DeskOptions } from "../assets/desk/Desk";
import { createFlatPages, PaperSurface, PlatenSheet } from "../assets/desk/PaperSurface";
import { carriageXAtColumn, Typewriter } from "../assets/typewriter/Typewriter";
import { DEFAULT_LAYOUT, type KeyboardLayout } from "../assets/typewriter/layout";
import { TypewriterDriver, newPose } from "../assets/typewriter/TypewriterDriver";
import { TypingScript } from "../assets/typewriter/TypingScript";
import { GATSBY_CONTENT } from "../content/gatsby";
import type { SceneContent } from "../content/types";
import { validateContent } from "../content/validate";
import { CameraRig, type CameraKey } from "../engine/CameraRig";
import { smoothRange } from "../engine/easing";
import { ASCII_PRINTABLE, GlyphAtlas, waitForFont } from "../engine/GlyphAtlas";
import { GlyphParticles } from "../engine/GlyphParticles";
import { PostFX } from "../engine/PostFX";
import { assertTimelineOrdered, GATSBY_TIMELINE, scaleTimeline, type Timeline } from "../engine/Timeline";
import { makePaperTexture } from "../engine/textures";
import { PALETTE, TYPE } from "../engine/world";
import { assignSlots, buildParticleBuffers, emptyStats, type MappingStats, type SeaPlacement } from "../layout/Mapping";
import { fillPageLines, layoutFormation, layoutOnSurface, wrapParagraphs, type SourceGlyph, type TargetSlot } from "../layout/TextLayout";
import { GATSBY_SHOTS } from "./gatsbyShots";

/**
 * GatsbyScene
 * -----------
 * The composition root. Builds the world from data and drives it from a single clock.
 *
 *   build:  content → paper surfaces → text layout (SourceGlyph) → quote layout (TargetSlot)
 *           → assignment → instance buffers → one instanced draw call
 *   frame:  t → camera rig, typewriter pose, fog/reveal ramps, shader uniforms, city backdrop
 *
 * Everything that varies is a constructor option: the content (quote, highlighted
 * words, page text), the timeline, the camera shots, the desk and the keyboard layout.
 */

export interface SceneStats extends MappingStats {
  slots: number;
  pages: number;
  fontUsed: string;
  warnings: string[];
}

export interface SceneCallbacks {
  onTime?: (t: number) => void;
  onReady?: (stats: SceneStats) => void;
}

export interface GatsbySceneOptions {
  content?: SceneContent;
  timeline?: Timeline;
  shots?: readonly CameraKey[];
  desk?: DeskOptions;
  keyboard?: KeyboardLayout;
  /** Speeds the whole timeline up (2) or down (0.5). */
  pace?: number;
}

export interface Phase {
  from: number;
  name: string;
  blurb: string;
}

export function buildPhases(tl: Timeline, lastArrival: number): Phase[] {
  return [
    { from: 0, name: "The source", blurb: "The last line of the manuscript is struck onto the sheet." },
    { from: tl.memberLiftStart, name: "Lift-off", blurb: "Characters peel away from the paper along its surface normal." },
    { from: tl.deskFade[0], name: "Ascent", blurb: "The desk dissolves; the swarm rises above the city." },
    { from: tl.holdFrameAt - 3.5, name: "Assembly", blurb: "Letters tumble a whole number of turns and lock into the quote." },
    { from: lastArrival + 1.5, name: "Hold", blurb: "The words float in depth; the camera drifts for parallax." },
    { from: tl.dissolve[0], name: "Dissolve", blurb: "The quote drifts away into the snow." },
  ];
}

/** Distance range of the sea of letters from the settled camera. */
const SEA_DEPTH: readonly [number, number] = [1.3, 17];
/** Distance from the settled camera to the centre of the quote. */
const QUOTE_DISTANCE = 18;
/** The city camera starts drifting at this time. */
const CITY_DRIFT_START = 10;
/** Fog density: thick over the desk, thin over the city. */
const FOG_DESK = 0.8;
const FOG_CITY = 0.0006;

export class GatsbyScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly rig: CameraRig;
  readonly timeline: Timeline;
  readonly content: SceneContent;

  time = 0;
  playing = true;
  speed = 1;
  loop = true;
  phases: Phase[] = [];

  private desk!: Desk;
  private typewriter!: Typewriter;
  private driver!: TypewriterDriver;
  private surfaces: PaperSurface[] = [];
  private particles!: GlyphParticles;
  private backdrop!: CityBackdrop;
  private post!: PostFX;
  private readonly pose = newPose();
  private raf = 0;
  private lastStamp = 0;
  private lastReported = -1;
  private ready = false;
  private disposed = false;
  private readonly sample = CameraRig.newSample();
  private readonly seaRef = new THREE.Vector3();
  private readonly fogColor = new THREE.Color();
  private readonly deskFog = new THREE.Color(PALETTE.deskFog);
  private readonly warnings: string[];
  private readonly canvas: HTMLCanvasElement;
  private readonly callbacks: SceneCallbacks;
  private readonly options: GatsbySceneOptions;

  constructor(canvas: HTMLCanvasElement, callbacks: SceneCallbacks = {}, options: GatsbySceneOptions = {}) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.options = options;

    const base = options.timeline ?? GATSBY_TIMELINE;
    this.timeline = options.pace && options.pace !== 1 ? scaleTimeline(base, options.pace) : base;
    assertTimelineOrdered(this.timeline);
    this.rig = new CameraRig(scaleShots(options.shots ?? GATSBY_SHOTS, options.pace ?? 1));

    const checked = validateContent(options.content ?? GATSBY_CONTENT);
    this.content = checked.content;
    this.warnings = checked.warnings;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.02, 6000);
  }

  /* ------------------------------------------------------------------ */
  /*  Build                                                             */
  /* ------------------------------------------------------------------ */
  async init() {
    const tl = this.timeline;
    const content = this.content;
    const fontOk = await waitForFont("Special Elite");
    if (this.disposed) return;

    // Atlases ---------------------------------------------------------
    const typeAtlas = new GlyphAtlas({
      chars: ASCII_PRINTABLE,
      cell: 128,
      cols: 16,
      family: `"Special Elite", "Courier Prime", "Courier New", Courier, monospace`,
      emScale: 1 / TYPE.quadScale,
      baselineShift: 0.22,
      distress: true,
      seed: 7,
    });
    const legendAtlas = new GlyphAtlas({
      chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890,.?;:'\"-!#$%&_()",
      cell: 64,
      cols: 8,
      family: `Georgia, "Times New Roman", serif`,
      emScale: 0.62,
      baselineShift: 0.34,
      distress: false,
    });

    // Environment ----------------------------------------------------------
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.12;
    pmrem.dispose();

    // Desk + typewriter -------------------------------------------------------
    this.desk = new Desk(this.options.desk ?? WALNUT_DESK);
    this.scene.add(this.desk.group);
    this.typewriter = new Typewriter({ legendAtlas, envMap: null, layout: this.options.keyboard ?? DEFAULT_LAYOUT });
    this.typewriter.group.position.set(0, 0, -0.22);
    this.typewriter.group.updateMatrixWorld(true);
    this.desk.group.add(this.typewriter.group);

    const unsupported = this.typewriter.layout.unsupported(content.typedLine);
    if (unsupported.length > 0) this.warnings.push(`the keyboard cannot type: ${unsupported.join(" ")}`);

    // Typing script: when each key goes down and when its bar hits the paper ----------
    const script = TypingScript.fromText(content.typedLine, this.typewriter.layout, {
      start: tl.typingStart,
      interval: tl.typingInterval,
      impact: tl.strikeImpact,
    });
    this.driver = new TypewriterDriver(script);

    // Paper surfaces ---------------------------------------------------------
    let surfaceId = 0;
    const pages = createFlatPages(surfaceId, content.pages, this.desk.pageAnchors(content.pages.length));
    surfaceId += pages.length;
    for (const p of pages) this.desk.group.add(p.mesh);

    const sheetLines = [...wrapParagraphs(content.sheetParagraphs), "", content.typedLine];
    const typedLineIndex = sheetLines.length - 1;
    const sheet = new PlatenSheet(surfaceId++, this.typewriter.group.matrixWorld, sheetLines.length, makePaperTexture({ seed: 500, age: 0.3 }));
    this.typewriter.attachSheet(sheet.mesh);
    this.surfaces = [...pages, sheet];

    // Text layout: glyphs pinned to paper coordinates ---------------------------
    let glyphId = 0;
    const nextId = () => glyphId++;
    const sources: SourceGlyph[] = [];
    pages.forEach((page, i) => {
      const spec = content.pages[i];
      const lines = spec.fill === false ? wrapParagraphs(spec.paragraphs) : fillPageLines(spec.paragraphs, i);
      sources.push(...layoutOnSurface(page, lines, nextId, { seed: 31 + i }));
    });
    const sheetGlyphs = layoutOnSurface(sheet, sheetLines, nextId, {
      typedLines: new Set([typedLineIndex]),
      typedImpact: (strike) => script.impactOf(strike),
      seed: 99,
    });
    sources.push(...sheetGlyphs);
    const typedGlyphs = sheetGlyphs.filter((g) => g.line === typedLineIndex);

    // Quote layout in the settled camera's frame -------------------------------
    const hold = this.rig.sample(tl.holdFrameAt);
    const holdFrame = { position: hold.position.clone(), quaternion: hold.quaternion.clone() };
    let slotId = 0;
    const slots: TargetSlot[] = layoutFormation(content.quote, holdFrame, QUOTE_DISTANCE, () => slotId++);
    this.phases = buildPhases(tl, Math.max(...content.quote.map((l) => l.arrival)));

    // Mapping + GPU buffers -------------------------------------------------------
    const stats = emptyStats();
    const assignments = assignSlots(sources, slots, typedGlyphs, tl, stats);
    const sea: SeaPlacement = { frame: holdFrame, tanHalfFov: Math.tan(THREE.MathUtils.degToRad(hold.fov / 2)), aspect: 16 / 9, depth: SEA_DEPTH };
    this.seaRef.copy(holdFrame.position);
    const buffers = buildParticleBuffers(sources, assignments, typeAtlas, tl, sea, stats);
    this.particles = new GlyphParticles(buffers, typeAtlas);
    this.scene.add(this.particles.mesh, this.particles.links);

    // City + post ---------------------------------------------------------------------
    this.backdrop = new CityBackdrop(this.renderer);
    this.scene.background = this.backdrop.texture;
    const { width, height } = this.size();
    this.post = new PostFX(this.renderer, this.scene, this.camera, width, height);

    this.ready = true;
    this.resize();
    this.callbacks.onReady?.({
      ...stats,
      slots: slots.length,
      pages: this.surfaces.length,
      fontUsed: fontOk ? "Special Elite" : "Courier (fallback)",
      warnings: this.warnings,
    });
    this.start();
  }

  /* ------------------------------------------------------------------ */
  /*  Per-frame state                                                   */
  /* ------------------------------------------------------------------ */
  setTime(t: number) {
    this.time = THREE.MathUtils.clamp(t, 0, this.timeline.duration);
    this.apply(this.time);
  }

  private apply(t: number) {
    if (!this.ready) return;
    const tl = this.timeline;

    // Camera ------------------------------------------------------------
    const cam = this.rig.sample(t, this.sample);
    this.camera.position.copy(cam.position);
    this.camera.quaternion.copy(cam.quaternion);
    if (Math.abs(this.camera.fov - cam.fov) > 1e-3) {
      this.camera.fov = cam.fov;
      this.camera.updateProjectionMatrix();
    }

    // Atmosphere ramps ----------------------------------------------------
    const reveal = smoothRange(tl.cityReveal, t);
    const fogDensity = Math.exp(THREE.MathUtils.lerp(Math.log(FOG_DESK), Math.log(FOG_CITY), reveal));
    this.fogColor.copy(this.deskFog).lerp(this.backdrop.fogColor, reveal);
    const deskFade = 1 - smoothRange(tl.deskFade, t);
    const dissolve = smoothRange(tl.dissolve, t);
    const fade = smoothRange(tl.fadeIn, t) * (1 - smoothRange(tl.fadeOut, t));
    const seaDim =
      1 - tl.seaDim.firstAmount * smoothRange(tl.seaDim.first, t) - tl.seaDim.secondAmount * smoothRange(tl.seaDim.second, t);

    // Typewriter ------------------------------------------------------------------
    const pose = this.driver.poseAt(t, this.pose);
    const carriageX = carriageXAtColumn(pose.column);
    this.typewriter.setCarriageX(carriageX);
    this.typewriter.apply(pose);

    // Desk dissolve ----------------------------------------------------------------
    this.desk.setOpacity(deskFade);
    this.typewriter.setOpacity(deskFade);
    for (const s of this.surfaces) {
      const m = s.mesh.material as THREE.MeshStandardMaterial;
      const transparent = deskFade < 0.999;
      if (m.transparent !== transparent) {
        m.transparent = transparent;
        m.needsUpdate = true;
      }
      m.opacity = deskFade;
    }

    // Shaders ---------------------------------------------------------------------------
    this.particles.update({
      time: t,
      carriageX,
      focusDist: cam.focusDist,
      focusRange: cam.focusRange,
      deskFade,
      dissolve,
      fogDensity,
      fogColor: this.fogColor,
      opacity: 1,
      seaRefPos: this.seaRef,
      seaOrigin: tl.seaDriftOrigin,
      seaDim,
    });
    this.renderer.setClearColor(this.fogColor, 1);
    this.post.update(t, fade, smoothRange(tl.gradeBlend, t));

    // City backdrop: own camera + render target, blurred until the focus pull ----------------
    if (reveal > 0.001) {
      this.backdrop.render(this.camera, {
        time: t,
        elapsed: Math.max(0, t - CITY_DRIFT_START),
        blur: 1 - smoothRange(tl.cityFocus, t),
      });
    }
    // The backdrop fades in from black with the reveal rather than popping in at full strength.
    this.scene.background = reveal > 0.001 ? this.backdrop.texture : null;
    this.scene.backgroundIntensity = reveal;
  }

  /* ------------------------------------------------------------------ */
  /*  Loop / lifecycle                                                  */
  /* ------------------------------------------------------------------ */
  start() {
    cancelAnimationFrame(this.raf);
    this.lastStamp = performance.now();
    const tick = (now: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - this.lastStamp) / 1000);
      this.lastStamp = now;
      if (this.playing) {
        this.time += dt * this.speed;
        if (this.time >= this.timeline.duration) this.time = this.loop ? 0 : this.timeline.duration;
      }
      this.apply(this.time);
      this.post.render();
      if (Math.abs(this.time - this.lastReported) > 0.08) {
        this.lastReported = this.time;
        this.callbacks.onTime?.(this.time);
      }
    };
    this.raf = requestAnimationFrame(tick);
  }

  setShowMapping(show: boolean) {
    if (this.particles) this.particles.links.visible = show;
  }

  private size() {
    const parent = this.canvas.parentElement;
    return { width: parent?.clientWidth || window.innerWidth, height: parent?.clientHeight || window.innerHeight };
  }

  resize() {
    const { width, height } = this.size();
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.post?.setSize(width, height, this.renderer.getPixelRatio());
    this.backdrop?.setSize(width, height, this.renderer.getPixelRatio());
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.particles?.dispose();
    this.post?.dispose();
    this.backdrop?.dispose();
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

/** Retime the shot list with the same pace as the timeline. */
function scaleShots(shots: readonly CameraKey[], pace: number): readonly CameraKey[] {
  if (pace === 1) return shots;
  return shots.map((k) => ({ ...k, t: k.t / pace }));
}
