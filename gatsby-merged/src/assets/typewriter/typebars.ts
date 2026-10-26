import * as THREE from "three";
import { addMesh } from "./body";
import { barMatrix, buildBarRig, restPadPoint, type BarRig } from "./barRig";
import type { TypewriterDims } from "./dims";
import type { TypewriterMaterials } from "./materials";
import type { BarSwing } from "./TypewriterDriver";

const BAR_THICKNESS = 0.0014;
const BAR_DEPTH = 0.0028;

/**
 * The type-bar basket: one steel arm and one chrome hammer slug per key,
 * pivoting on a curved segment. Poses come from `barRig`, so at full strike
 * each tip lands exactly on the printing point.
 */
export class TypeBars {
  readonly rig: BarRig;
  private readonly bars: THREE.InstancedMesh;
  private readonly slugs: THREE.InstancedMesh;
  private readonly active = new Set<number>();
  private readonly m = new THREE.Matrix4();

  constructor(parent: THREE.Object3D, printingPoint: THREE.Vector3, count: number, d: TypewriterDims, mats: TypewriterMaterials) {
    const { length } = d.bars;
    this.rig = buildBarRig(printingPoint, { count, ...d.bars });

    const barGeo = new THREE.BoxGeometry(BAR_THICKNESS, length, BAR_DEPTH);
    barGeo.translate(0, length / 2, 0); // pivot at the origin, arm extends along +Y
    const slugGeo = new THREE.BoxGeometry(0.0026, 0.0065, 0.0042);
    slugGeo.translate(0, length - 0.0025, 0.0012);

    this.bars = new THREE.InstancedMesh(barGeo, mats.steel, count);
    this.slugs = new THREE.InstancedMesh(slugGeo, mats.chrome, count);
    for (const mesh of [this.bars, this.slugs]) {
      mesh.castShadow = true;
      mesh.frustumCulled = false;
    }
    for (let i = 0; i < count; i++) this.setPose(i, 0);
    this.bars.instanceMatrix.needsUpdate = true;
    this.slugs.instanceMatrix.needsUpdate = true;
    parent.add(this.bars, this.slugs);

    // Curved segment the pivots sit on, and the felt/brass rest cushion under the resting arms.
    if (count >= 2) {
      const segment = new THREE.CatmullRomCurve3(this.rig.pivots.map((p) => p.clone()));
      addMesh(parent, new THREE.TubeGeometry(segment, 36, 0.0036, 8, false), mats.darkSteel, [0, -0.001, 0]);
      addMesh(parent, new THREE.TubeGeometry(segment, 36, 0.0018, 8, false), mats.chrome, [0, 0.0022, 0.001]);
      const pad = new THREE.CatmullRomCurve3(Array.from({ length: count }, (_, i) => restPadPoint(this.rig, i)));
      addMesh(parent, new THREE.TubeGeometry(pad, 36, 0.0032, 8, false), mats.felt, [0, -0.0028, 0]);
      addMesh(parent, new THREE.TubeGeometry(pad, 36, 0.0038, 8, false), mats.brass, [0, -0.0052, 0]);
    }
  }

  private setPose(i: number, strike: number) {
    barMatrix(this.rig, i, strike, this.m);
    this.bars.setMatrixAt(i, this.m);
    this.slugs.setMatrixAt(i, this.m);
  }

  /** Pose every bar for the given swings; bars not listed are returned to rest. */
  apply(swings: readonly BarSwing[]) {
    const now = new Set<number>();
    for (const s of swings) {
      if (s.barIndex < 0 || s.barIndex >= this.rig.count) continue;
      this.setPose(s.barIndex, s.amount);
      now.add(s.barIndex);
    }
    for (const i of this.active) if (!now.has(i)) this.setPose(i, 0);
    const changed = now.size > 0 || this.active.size > 0;
    this.active.clear();
    for (const i of now) this.active.add(i);
    if (changed) {
      this.bars.instanceMatrix.needsUpdate = true;
      this.slugs.instanceMatrix.needsUpdate = true;
    }
  }
}
