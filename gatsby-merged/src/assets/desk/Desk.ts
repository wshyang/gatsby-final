import * as THREE from "three";
import { makePaperTexture, makeWoodTexture } from "../../engine/textures";
import type { PagePose } from "./PaperSurface";

/**
 * Desk
 * ----
 * The physical setting the manuscript lives in: a table, a lamp, a moonlit
 * fill and optional props. Everything dissolves when the camera climbs into
 * the sky. Build a different table by passing different `DeskOptions`.
 */
export interface DeskOptions {
  size: readonly [width: number, depth: number];
  /** Centre of the table top (x, z). */
  centre: readonly [number, number];
  tableColor: number;
  /** Wood grain texture seed; null = flat colour. */
  woodSeed: number | null;
  woodRepeat: readonly [number, number];
  roughness: number;
  props: { stack: boolean; pen: boolean };
  lamp: { color: number; intensity: number; position: readonly [number, number, number]; target: readonly [number, number, number] };
  fill: { color: number; intensity: number; position: readonly [number, number, number] };
  hemi: { sky: number; ground: number; intensity: number };
  /** Where flat pages lie (x, z, yaw). Pages without their own pose take these in order. */
  pageAnchors: readonly PagePose[];
}

export const WALNUT_DESK: DeskOptions = {
  size: [2.6, 1.7],
  centre: [0, -0.1],
  tableColor: 0xb9a48a,
  woodSeed: 7,
  woodRepeat: [1.4, 1],
  roughness: 0.52,
  props: { stack: true, pen: true },
  lamp: { color: 0xffc38a, intensity: 3.4, position: [-0.6, 1.0, 0.35], target: [0.05, 0, -0.05] },
  fill: { color: 0x5f7fb0, intensity: 0.45, position: [0.9, 0.55, -0.7] },
  hemi: { sky: 0x3a2c22, ground: 0x070605, intensity: 0.25 },
  pageAnchors: [
    { x: -0.33, z: 0.11, yaw: 0.32 },
    { x: -0.12, z: 0.27, yaw: -0.12 },
    { x: 0.17, z: 0.24, yaw: 0.18 },
    { x: 0.38, z: 0.05, yaw: -0.42 },
  ],
};

/** A bare, pale table with no props; used by the standalone typewriter showcase. */
export const PLAIN_DESK: DeskOptions = {
  ...WALNUT_DESK,
  size: [1.6, 1.1],
  centre: [0, 0],
  tableColor: 0xcfc8bc,
  woodSeed: null,
  roughness: 0.8,
  props: { stack: false, pen: false },
  pageAnchors: [{ x: 0.3, z: 0.25, yaw: 0.1 }],
};

export class Desk {
  readonly group = new THREE.Group();
  readonly materials: THREE.Material[] = [];
  readonly lamp: THREE.SpotLight;
  readonly fill: THREE.PointLight;
  readonly hemi: THREE.HemisphereLight;
  readonly options: DeskOptions;
  private readonly lampIntensity: number;
  private readonly fillIntensity: number;

  constructor(options: DeskOptions = WALNUT_DESK) {
    this.options = options;
    this.lampIntensity = options.lamp.intensity;
    this.fillIntensity = options.fill.intensity;

    const deskMat = new THREE.MeshStandardMaterial({ roughness: options.roughness, metalness: 0.05, color: options.tableColor });
    if (options.woodSeed !== null) {
      const wood = makeWoodTexture(options.woodSeed);
      wood.repeat.set(options.woodRepeat[0], options.woodRepeat[1]);
      deskMat.map = wood;
    }
    const desk = new THREE.Mesh(new THREE.BoxGeometry(options.size[0], 0.05, options.size[1]), deskMat);
    desk.position.set(options.centre[0], -0.025, options.centre[1]);
    desk.receiveShadow = true;
    this.group.add(desk);
    this.materials.push(deskMat);

    if (options.props.stack) this.addStack();
    if (options.props.pen) this.addPen();

    this.lamp = new THREE.SpotLight(options.lamp.color, options.lamp.intensity, 0, 0.62, 0.75, 2);
    this.lamp.position.set(...options.lamp.position);
    this.lamp.target.position.set(...options.lamp.target);
    this.lamp.castShadow = true;
    this.lamp.shadow.mapSize.set(2048, 2048);
    this.lamp.shadow.camera.near = 0.3;
    this.lamp.shadow.camera.far = 3.5;
    this.lamp.shadow.bias = -0.00015;
    // Thin type bars (1.4 mm) need a small normal bias or they show shadow acne.
    this.lamp.shadow.normalBias = 0.0006;
    this.lamp.shadow.radius = 3;
    this.group.add(this.lamp, this.lamp.target);

    this.fill = new THREE.PointLight(options.fill.color, options.fill.intensity, 0, 2);
    this.fill.position.set(...options.fill.position);
    this.group.add(this.fill);

    this.hemi = new THREE.HemisphereLight(options.hemi.sky, options.hemi.ground, options.hemi.intensity);
    this.group.add(this.hemi);
  }

  /** Poses where `count` flat pages can lie on this table. */
  pageAnchors(count: number): PagePose[] {
    const a = this.options.pageAnchors;
    return Array.from({ length: count }, (_, i) => a[i % a.length]);
  }

  private addStack() {
    const stackTex = makePaperTexture({ seed: 77, age: 0.25 });
    const stackMat = new THREE.MeshStandardMaterial({ map: stackTex, roughness: 0.9 });
    const stackSide = new THREE.MeshStandardMaterial({ color: 0xcdbf9f, roughness: 0.95 });
    const stack = new THREE.Mesh(new THREE.BoxGeometry(0.216, 0.014, 0.279), [stackSide, stackSide, stackMat, stackSide, stackSide, stackSide]);
    stack.position.set(0.47, 0.007, -0.3);
    stack.rotation.y = 0.12;
    stack.castShadow = true;
    stack.receiveShadow = true;
    this.group.add(stack);
    this.materials.push(stackMat, stackSide);
  }

  private addPen() {
    const penBody = new THREE.MeshStandardMaterial({ color: 0x0b0a0c, roughness: 0.25, metalness: 0.2 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xb58d47, roughness: 0.35, metalness: 0.95 });
    const pen = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.125, 16), penBody);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 16), penBody);
    cap.position.y = 0.06;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0063, 0.0063, 0.004, 16), brass);
    band.position.y = 0.034;
    const clip = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.03, 0.0015), brass);
    clip.position.set(0, 0.065, 0.0062);
    const nib = new THREE.Mesh(new THREE.ConeGeometry(0.0045, 0.018, 12), brass);
    nib.position.y = -0.07;
    nib.rotation.x = Math.PI;
    pen.add(body, cap, band, clip, nib);
    pen.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    pen.position.set(0.05, 0.0075, 0.3);
    pen.rotation.set(0, 0.45, Math.PI / 2);
    this.group.add(pen);
    this.materials.push(penBody, brass);
  }

  /** Dissolve the desk while the camera climbs. */
  setOpacity(o: number) {
    const transparent = o < 0.999;
    for (const m of this.materials) {
      if (m.transparent !== transparent) {
        m.transparent = transparent;
        m.needsUpdate = true;
      }
      m.opacity = o;
    }
    this.lamp.intensity = this.lampIntensity * o;
    this.fill.intensity = this.fillIntensity * o;
    this.group.visible = o > 0.002;
  }
}
