import { describe, expect, it } from "vitest";
import { CameraRig, type CameraKey } from "../engine/CameraRig";
import { GATSBY_SHOTS } from "./gatsbyShots";

const key = (t: number, y: number): CameraKey => ({ t, pos: [0, y, 0], look: [0, 0, -1], fov: 40 });

function speed(rig: CameraRig, t: number, dt = 1e-3): number {
  const a = rig.sample(t - dt).position.clone();
  const b = rig.sample(t + dt).position;
  return a.distanceTo(b) / (2 * dt);
}

describe("CameraRig", () => {
  const rig = new CameraRig([key(0, 0), key(1, 1), key(2, 3), key(4, 3.5)]);

  it("passes exactly through every key", () => {
    expect(rig.sample(1).position.y).toBeCloseTo(1, 9);
    expect(rig.sample(2).position.y).toBeCloseTo(3, 9);
  });

  it("clamps outside the shot list", () => {
    expect(rig.sample(-5).position.y).toBeCloseTo(0, 9);
    expect(rig.sample(99).position.y).toBeCloseTo(3.5, 9);
  });

  it("never overshoots between keys (monotone)", () => {
    let prev = -Infinity;
    for (let t = 0; t <= 4; t += 0.01) {
      const y = rig.sample(t).position.y;
      expect(y).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(y).toBeLessThanOrEqual(3.5 + 1e-9);
      prev = y;
    }
  });

  it("is velocity-continuous through a key (does not stop and restart)", () => {
    expect(Math.abs(speed(rig, 1 + 1e-2) - speed(rig, 1 - 1e-2))).toBeLessThan(0.05);
    expect(speed(rig, 1)).toBeGreaterThan(0.5);
  });

  it("starts and ends at rest", () => {
    expect(speed(rig, 2e-3)).toBeLessThan(0.05);
    expect(speed(rig, 4 - 2e-3)).toBeLessThan(0.05);
  });

  it("rejects fewer than two keys and unordered keys", () => {
    expect(() => new CameraRig([key(0, 0)])).toThrow(/at least two/);
    expect(() => new CameraRig([key(0, 0), key(0, 1)])).toThrow(/strictly increasing/);
  });
});

describe("GATSBY_SHOTS", () => {
  const rig = new CameraRig(GATSBY_SHOTS);

  it("runs for the whole 34 s timeline", () => {
    expect(GATSBY_SHOTS[0].t).toBe(0);
    expect(GATSBY_SHOTS[GATSBY_SHOTS.length - 1].t).toBe(34);
  });

  it("holds the exact paper close-up for the first 2.5 s (under 2.5 cm of travel)", () => {
    const a = rig.sample(0).position.clone();
    const b = rig.sample(2.5).position;
    expect(a.distanceTo(b)).toBeLessThan(0.025);
  });

  it("brings the keyboard into frame by 7.5 s: camera has pulled back from the platen", () => {
    expect(rig.sample(7.5).position.z).toBeGreaterThan(rig.sample(2.5).position.z + 0.15);
    expect(rig.sample(7.5).position.y).toBeGreaterThan(rig.sample(2.5).position.y);
  });

  it("only ever rises after the pull-out, never dips", () => {
    let prev = rig.sample(7.5).position.y;
    for (let t = 7.5; t <= 23.4; t += 0.1) {
      const y = rig.sample(t).position.y;
      expect(y).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = y;
    }
  });

  it("never moves faster than 1.2 m/s", () => {
    for (let t = 0.1; t <= 33.9; t += 0.25) expect(speed(rig, t)).toBeLessThan(1.2);
  });

  it("climbs no faster than 0.25 altitude doublings per second once the desk has gone", () => {
    for (let t = 14.5; t < 23; t += 0.5) {
      const y0 = rig.sample(t).position.y;
      const y1 = rig.sample(t + 0.5).position.y;
      expect(Math.log2(y1 / y0) / 0.5).toBeLessThan(0.25);
    }
  });
});
