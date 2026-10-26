import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { barDirection, barMatrix, barTip, buildBarRig, restPadPoint } from "./barRig";
import { DEFAULT_DIMS, solidBoxes, type Box } from "./dims";

const [px, py, pz] = DEFAULT_DIMS.platenCenter;
const printingPoint = new THREE.Vector3(px, py, pz + DEFAULT_DIMS.platenRadius);
const rig = buildBarRig(printingPoint, { count: 40, ...DEFAULT_DIMS.bars });

function insideBox(p: THREE.Vector3, b: Box, margin = 0): boolean {
  return (
    Math.abs(p.x - b.c[0]) < b.s[0] / 2 - margin &&
    Math.abs(p.y - b.c[1]) < b.s[1] / 2 - margin &&
    Math.abs(p.z - b.c[2]) < b.s[2] / 2 - margin
  );
}

describe("barRig", () => {
  it("lands every hammer tip exactly on the printing point at full strike", () => {
    for (let i = 0; i < rig.count; i++) {
      expect(barTip(rig, i, 1).distanceTo(printingPoint)).toBeLessThan(1e-9);
    }
  });

  it("keeps the arm length constant throughout the swing", () => {
    for (let i = 0; i < rig.count; i++) {
      for (const s of [0, 0.25, 0.5, 0.75, 1]) {
        expect(barTip(rig, i, s).distanceTo(rig.pivots[i])).toBeCloseTo(rig.length, 9);
      }
    }
  });

  it("builds an orthonormal frame at every pose (no degenerate matrices)", () => {
    const m = new THREE.Matrix4();
    for (let i = 0; i < rig.count; i++) {
      for (const s of [0, 0.3, 1]) {
        barMatrix(rig, i, s, m);
        expect(m.elements.every(Number.isFinite)).toBe(true);
        expect(Math.abs(m.determinant() - 1)).toBeLessThan(1e-9);
      }
    }
  });

  it("never passes any point of any arm through a solid part, at any point of the swing", () => {
    const boxes = solidBoxes(DEFAULT_DIMS);
    const p = new THREE.Vector3();
    const offenders: string[] = [];
    for (let i = 0; i < rig.count; i++) {
      for (let s = 0; s <= 1.0001; s += 0.05) {
        const dir = barDirection(rig, i, s);
        // Sample along the arm, skipping the very pivot end which is mounted on the segment.
        for (let t = 0.1; t <= 1.0001; t += 0.1) {
          p.copy(rig.pivots[i]).addScaledVector(dir, t * rig.length);
          boxes.forEach((b, bi) => {
            if (insideBox(p, b)) offenders.push(`bar ${i} strike ${s.toFixed(2)} t ${t.toFixed(1)} in box ${bi}`);
          });
        }
      }
    }
    expect(offenders.slice(0, 5)).toEqual([]);
  });

  it("rests every arm clear of the others (no two arms closer than their thickness)", () => {
    const min = 0.0014;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (let i = 0; i < rig.count - 1; i++) {
      barTip(rig, i, 0, a);
      barTip(rig, i + 1, 0, b);
      expect(a.distanceTo(b)).toBeGreaterThan(min);
    }
  });

  it("rests the arms lying forward of the printing line, not standing in front of the typed text", () => {
    for (let i = 0; i < rig.count; i++) {
      expect(barTip(rig, i, 0).y).toBeLessThan(printingPoint.y);
    }
  });

  it("puts the rest pad point on the resting arm", () => {
    const pad = restPadPoint(rig, 3);
    expect(pad.distanceTo(rig.pivots[3])).toBeCloseTo(rig.length * 0.82, 9);
  });
});
