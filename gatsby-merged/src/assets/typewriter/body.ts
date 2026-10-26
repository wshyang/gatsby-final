import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Box, TypewriterDims } from "./dims";
import type { TypewriterMaterials } from "./materials";

/** Adds a shadow-casting mesh to `parent`. */
export function addMesh(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  pos: readonly [number, number, number],
  rot?: THREE.Euler,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(pos[0], pos[1], pos[2]);
  if (rot) m.rotation.copy(rot);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export const rotZ90 = () => new THREE.Euler(0, 0, Math.PI / 2);

export function addBox(parent: THREE.Object3D, b: Box, mat: THREE.Material, radius: number): THREE.Mesh {
  return addMesh(parent, new RoundedBoxGeometry(b.s[0], b.s[1], b.s[2], 3, radius), mat, b.c);
}

export interface BodyParts {
  leftSpool: THREE.Group;
  rightSpool: THREE.Group;
  /** Ribbon vibrator; rises to the printing line on every strike. */
  vibrator: THREE.Group;
  vibratorBaseY: number;
}

/** Fixed frame: cast-iron body, side frames, rail, ribbon spools, vibrator. */
export function buildBody(parent: THREE.Object3D, d: TypewriterDims, m: TypewriterMaterials): BodyParts {
  const [, py, pz] = d.platenCenter;

  addBox(parent, d.base, m.enamel, 0.011);
  for (const fx of [-0.16, 0.16]) {
    for (const fz of [-0.12, 0.12]) addMesh(parent, new THREE.CylinderGeometry(0.014, 0.016, 0.008, 16), m.rubber, [fx, 0.004, fz]);
  }
  addBox(parent, d.housing, m.enamel, 0.014);
  for (const f of d.sideFrames) addBox(parent, f, m.enamel, 0.006);

  // Brass pinstripe and maker's plate on the front of the housing, above the key rows.
  const frontZ = d.housing.c[2] + d.housing.s[2] / 2;
  addMesh(parent, new THREE.BoxGeometry(0.26, 0.0025, 0.002), m.brass, [0, d.housing.c[1] + 0.028, frontZ + 0.001]);
  addMesh(parent, new THREE.PlaneGeometry(0.11, 0.022), m.decal, [0, d.housing.c[1] + 0.012, frontZ + 0.0016]);

  // Carriage rail.
  addMesh(parent, new THREE.CylinderGeometry(d.rail.r, d.rail.r, d.rail.length, 16), m.chrome, [0, d.rail.y, d.rail.z], rotZ90());

  // Ribbon spools.
  const leftSpool = new THREE.Group();
  const rightSpool = new THREE.Group();
  leftSpool.position.set(-0.118, 0.142, -0.058);
  rightSpool.position.set(0.118, 0.142, -0.058);
  parent.add(leftSpool, rightSpool);
  for (const spool of [leftSpool, rightSpool]) {
    addMesh(spool, new THREE.CylinderGeometry(0.029, 0.029, 0.012, 32), m.chrome, [0, -0.002, 0]);
    addMesh(spool, new THREE.CylinderGeometry(0.025, 0.025, 0.011, 32), m.ribbon, [0, 0.001, 0]);
    addMesh(spool, new THREE.CylinderGeometry(0.027, 0.027, 0.0015, 32), m.brass, [0, 0.007, 0]);
    addMesh(spool, new THREE.CylinderGeometry(0.005, 0.005, 0.016, 16), m.chrome, [0, 0.009, 0]);
  }
  addMesh(parent, new THREE.BoxGeometry(0.11, 0.009, 0.0008), m.ribbon, [-0.06, 0.162, -0.086], new THREE.Euler(0.18, 0.48, 0.34));
  addMesh(parent, new THREE.BoxGeometry(0.11, 0.009, 0.0008), m.ribbon, [0.06, 0.162, -0.086], new THREE.Euler(0.18, -0.48, -0.34));

  // Ribbon vibrator just below the printing point.
  const vibrator = new THREE.Group();
  const vibratorBaseY = py - 0.008;
  vibrator.position.set(0, vibratorBaseY, pz + d.platenRadius + 0.0028);
  parent.add(vibrator);
  addMesh(vibrator, new THREE.BoxGeometry(0.036, 0.0085, 0.0007), m.ribbon, [0, 0, 0]);
  addMesh(vibrator, new THREE.BoxGeometry(0.0022, 0.022, 0.0025), m.chrome, [-0.006, -0.004, 0.0005]);
  addMesh(vibrator, new THREE.BoxGeometry(0.0022, 0.022, 0.0025), m.chrome, [0.006, -0.004, 0.0005]);

  return { leftSpool, rightSpool, vibrator, vibratorBaseY };
}
