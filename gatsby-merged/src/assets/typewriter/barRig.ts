import * as THREE from "three";

/**
 * Geometry of the type-bar basket, as pure math.
 *
 * Every bar is a rigid arm that pivots about `sideAxis` through `pivot`. The
 * pivot is placed exactly `length` back from the printing point along
 * `strikeDir`, so at strike = 1 the tip lands precisely on the printing point.
 * At strike = 0 the arm is folded `restRad` away, onto the rest pad.
 */
export interface BarRig {
  count: number;
  length: number;
  restRad: number;
  printingPoint: THREE.Vector3;
  pivots: THREE.Vector3[];
  strikeDirs: THREE.Vector3[];
  sideAxes: THREE.Vector3[];
}

export interface BarRigOptions {
  count: number;
  length: number;
  fanDeg: number;
  restDeg: number;
}

export function buildBarRig(printingPoint: THREE.Vector3, opts: BarRigOptions): BarRig {
  const { count, length } = opts;
  const pivots: THREE.Vector3[] = [];
  const strikeDirs: THREE.Vector3[] = [];
  const sideAxes: THREE.Vector3[] = [];
  const fan = THREE.MathUtils.degToRad(opts.fanDeg);

  for (let i = 0; i < count; i++) {
    const u = count === 1 ? 0.5 : i / (count - 1);
    const phi = -fan + 2 * fan * u;
    const sinP = Math.sin(phi);
    const cosP = Math.cos(phi);

    // Direction from the pivot up and back to the printing point.
    const strikeDir = new THREE.Vector3(-sinP * 0.64, 0.66 + 0.06 * cosP, -0.64 * cosP - 0.14).normalize();
    const pivot = printingPoint.clone().addScaledVector(strikeDir, -length);

    // Direction the arm folds towards when resting.
    const outward = new THREE.Vector3(sinP * 0.72, -0.38 - 0.08 * (1 - cosP), cosP * 0.78 + 0.18).normalize();
    const sideAxis = new THREE.Vector3().crossVectors(strikeDir, outward).normalize();

    pivots.push(pivot);
    strikeDirs.push(strikeDir);
    sideAxes.push(sideAxis);
  }

  return {
    count,
    length,
    restRad: THREE.MathUtils.degToRad(opts.restDeg),
    printingPoint: printingPoint.clone(),
    pivots,
    strikeDirs,
    sideAxes,
  };
}

const _y = new THREE.Vector3();
const _z = new THREE.Vector3();

/** Direction the arm points (pivot → tip) at strike progress 0‥1. */
export function barDirection(rig: BarRig, i: number, strike: number, out: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
  const angle = (1 - THREE.MathUtils.clamp(strike, 0, 1)) * rig.restRad;
  return out.copy(rig.strikeDirs[i]).applyAxisAngle(rig.sideAxes[i], angle).normalize();
}

/** Position of the hammer tip at strike progress 0‥1. */
export function barTip(rig: BarRig, i: number, strike: number, out: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
  return barDirection(rig, i, strike, out).multiplyScalar(rig.length).add(rig.pivots[i]);
}

/** Rest-pad point under the resting arm, used to draw the felt cushion. */
export function restPadPoint(rig: BarRig, i: number): THREE.Vector3 {
  return barTip(rig, i, 0).sub(rig.pivots[i]).multiplyScalar(0.82).add(rig.pivots[i]);
}

/** Local frame of the arm: +Y along the arm, +X along the hinge, origin at the pivot. */
export function barMatrix(rig: BarRig, i: number, strike: number, out: THREE.Matrix4 = new THREE.Matrix4()): THREE.Matrix4 {
  barDirection(rig, i, strike, _y);
  const x = rig.sideAxes[i];
  _z.crossVectors(x, _y).normalize();
  return out.makeBasis(x, _y, _z).setPosition(rig.pivots[i]);
}
