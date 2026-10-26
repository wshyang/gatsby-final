import * as THREE from "three";
import type { GlyphAtlas } from "../../engine/GlyphAtlas";
import { TYPE } from "../../engine/world";
import { buildBody, type BodyParts } from "./body";
import { buildCarriage } from "./carriage";
import { DEFAULT_DIMS, type TypewriterDims } from "./dims";
import { Keyboard } from "./keyboard";
import { DEFAULT_LAYOUT, ResolvedLayout, type KeyboardLayout } from "./layout";
import { createTypewriterMaterials, type TypewriterMaterials } from "./materials";
import { TypeBars } from "./typebars";
import type { TypewriterPose } from "./TypewriterDriver";

/**
 * Typewriter
 * ----------
 * A self-contained 1920s desktop typewriter. It knows nothing about the
 * Gatsby scene, timeline or content, so it can be dropped into any scene:
 *
 *   const tw = new Typewriter({ legendAtlas, envMap });
 *   scene.add(tw.group);
 *   const driver = new TypewriterDriver(TypingScript.fromText("Hello", tw.layout, {...}));
 *   // every frame:
 *   const pose = driver.poseAt(t);
 *   tw.apply(pose);
 *   tw.setCarriageX(carriageXAtColumn(pose.column));
 *
 * Which key and which strike arm types a character is decided by `layout`.
 */
export interface TypewriterOptions {
  /** Atlas holding the key legends (upper-case letters, digits, punctuation). */
  legendAtlas: GlyphAtlas;
  envMap?: THREE.Texture | null;
  layout?: KeyboardLayout;
  dims?: TypewriterDims;
  /** Replace the default finishes. */
  materials?: TypewriterMaterials;
}

/** Carriage x offset that puts paper column `column` (fractional) under the printing point. */
export function carriageXAtColumn(column: number): number {
  return -(TYPE.marginLeft + (column + 0.5) * TYPE.cellWidth - TYPE.pageWidth / 2);
}

export class Typewriter {
  readonly group = new THREE.Group();
  readonly carriage: THREE.Group;
  readonly layout: ResolvedLayout;
  readonly dims: TypewriterDims;
  readonly materialSet: TypewriterMaterials;
  /** Every material of the machine (including the sheet once attached), for fading. */
  readonly materials: THREE.Material[];
  /** Where the type bars strike, in typewriter-local space. */
  readonly printingPoint: THREE.Vector3;

  private readonly body: BodyParts;
  private readonly keyboard: Keyboard;
  private readonly bars: TypeBars;

  constructor(opts: TypewriterOptions) {
    this.dims = opts.dims ?? DEFAULT_DIMS;
    this.layout = new ResolvedLayout(opts.layout ?? DEFAULT_LAYOUT);
    this.materialSet = opts.materials ?? createTypewriterMaterials(opts.envMap ?? null);
    const [px, py, pz] = this.dims.platenCenter;
    this.printingPoint = new THREE.Vector3(px, py, pz + this.dims.platenRadius);

    this.body = buildBody(this.group, this.dims, this.materialSet);
    this.bars = new TypeBars(this.group, this.printingPoint, this.layout.barCount, this.dims, this.materialSet);
    this.keyboard = new Keyboard(this.group, this.layout, opts.legendAtlas, this.dims, this.materialSet);
    this.carriage = buildCarriage(this.dims, this.materialSet);
    this.group.add(this.carriage);

    this.materials = Object.values(this.materialSet);
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  /** The manuscript sheet rides on the carriage. */
  attachSheet(mesh: THREE.Mesh) {
    this.carriage.add(mesh);
    const mat = mesh.material as THREE.Material;
    if (!this.materials.includes(mat)) this.materials.push(mat);
  }

  setCarriageX(x: number) {
    this.carriage.position.x = x;
    const spin = x * 8.5;
    this.body.leftSpool.rotation.y = spin;
    this.body.rightSpool.rotation.y = spin;
  }

  /** Pose keys, type bars, shift and ribbon vibrator. Pure function of `pose`. */
  apply(pose: TypewriterPose) {
    this.keyboard.apply(pose.presses, pose.shift);
    this.bars.apply(pose.swings);
    let strike = 0;
    for (const s of pose.swings) strike = Math.max(strike, s.amount);
    this.body.vibrator.position.y = this.body.vibratorBaseY + strike * 0.0082;
  }

  /** Fade the whole machine (used while the desk dissolves into the sky). */
  setOpacity(o: number) {
    const transparent = o < 0.999;
    for (const m of this.materials) {
      if (m.transparent !== transparent && m !== this.materialSet.decal) {
        m.transparent = transparent;
        m.needsUpdate = true;
      }
      m.opacity = o;
    }
    this.keyboard.legendMaterial.uniforms.uOpacity.value = o;
    this.group.visible = o > 0.002;
  }
}
