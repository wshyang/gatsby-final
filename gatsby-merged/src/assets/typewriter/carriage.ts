import * as THREE from "three";
import { addBox, addMesh, rotZ90 } from "./body";
import type { TypewriterDims } from "./dims";
import type { TypewriterMaterials } from "./materials";

/**
 * Sliding carriage: platen, end caps and knobs, bed, paper bail, paper table
 * and return lever. Everything lives in the returned group; slide it along x to advance.
 */
export function buildCarriage(d: TypewriterDims, m: TypewriterMaterials): THREE.Group {
  const group = new THREE.Group();
  const [px, py, pz] = d.platenCenter;
  const R = d.platenRadius;

  // The rubber sits a paper-thickness inside the sheet's wrap radius.
  const pr = R - 0.0006;
  addMesh(group, new THREE.CylinderGeometry(pr, pr, 0.34, 64), m.rubber, [px, py, pz], rotZ90());
  for (const sx of [-1, 1]) {
    addMesh(group, new THREE.CylinderGeometry(0.0175, 0.0175, 0.005, 32), m.chrome, [sx * 0.173, py, pz], rotZ90());
    addMesh(group, new THREE.CylinderGeometry(0.004, 0.004, 0.036, 16), m.chrome, [sx * 0.188, py, pz], rotZ90());
    addMesh(group, new THREE.CylinderGeometry(0.0165, 0.0165, 0.018, 32), m.enamel, [sx * 0.204, py, pz], rotZ90());
  }

  // Bed and graduated margin scale under the platen (behind the bars' swing path, see dims.carriageBed).
  addBox(group, d.carriageBed, m.enamel, 0.005);
  addMesh(group, new THREE.BoxGeometry(0.31, 0.004, 0.002), m.chrome, [0, py - 0.016, pz - 0.012]);

  // Paper bail rod with rubber pinch rollers resting on the sheet.
  const bailA = THREE.MathUtils.degToRad(40);
  const bail: [number, number, number] = [0, py + Math.sin(bailA) * (R + 0.0024), pz + Math.cos(bailA) * (R + 0.0024)];
  addMesh(group, new THREE.CylinderGeometry(0.0015, 0.0015, 0.31, 12), m.chrome, bail, rotZ90());
  for (const sx of [-1, 1]) addMesh(group, new THREE.CylinderGeometry(0.0042, 0.0042, 0.014, 16), m.rubber, [sx * 0.072, bail[1], bail[2]], rotZ90());

  // Slanted paper table behind the sheet.
  addMesh(group, new THREE.BoxGeometry(0.31, 0.076, 0.002), m.enamel, [0, py + 0.046, pz - 0.032], new THREE.Euler(THREE.MathUtils.degToRad(20), 0, 0));
  addMesh(group, new THREE.BoxGeometry(0.31, 0.003, 0.003), m.chrome, [0, py + 0.082, pz - 0.045]);

  // Carriage-return lever.
  addMesh(group, new THREE.CylinderGeometry(0.0026, 0.0026, 0.08, 12), m.chrome, [-0.2, py + 0.012, pz + 0.022], new THREE.Euler(0.2, 0, THREE.MathUtils.degToRad(68)));
  addMesh(group, new THREE.SphereGeometry(0.0055, 14, 10), m.chrome, [-0.236, py + 0.026, pz + 0.03]);

  return group;
}
