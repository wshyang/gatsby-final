import * as THREE from "three";

/** Position and orientation of a camera at one instant. */
export interface CameraFrame {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

/**
 * CameraRig
 * ---------
 * A keyframe camera. Each key stores the camera position, the point it looks
 * at, the field of view and (optionally) an explicit focus distance for the
 * glyph depth-of-field.
 *
 * Every channel is interpolated with a monotone cubic Hermite spline
 * (Fritsch-Carlson): velocity is continuous through the keys, so the camera
 * never stops and starts at each one, and it never overshoots a key (the keys
 * span millimetres at the platen to tens of metres above the city, where an
 * ordinary Catmull-Rom would swing wide). The camera starts and ends at rest.
 */
export interface CameraKey {
  t: number;
  pos: readonly [number, number, number];
  look: readonly [number, number, number];
  fov: number;
  /** Explicit focus distance (defaults to |look - pos|). */
  focus?: number;
  /** Relative depth-of-field width (fraction of focus distance). */
  dof?: number;
}

export interface CameraSample extends CameraFrame {
  fov: number;
  focusDist: number;
  focusRange: number;
  look: THREE.Vector3;
}

const CHANNELS = 10; // pos(3) look(3) fov focus dof

function channelValues(k: CameraKey): number[] {
  const dx = k.pos[0] - k.look[0];
  const dy = k.pos[1] - k.look[1];
  const dz = k.pos[2] - k.look[2];
  const focus = k.focus ?? Math.hypot(dx, dy, dz);
  return [...k.pos, ...k.look, k.fov, focus, k.dof ?? 0.4];
}

/** Monotone slopes (Fritsch-Carlson, non-uniform) for one channel; zero at both ends. */
function tangents(t: readonly number[], y: readonly number[]): number[] {
  const n = t.length;
  const m = new Array<number>(n).fill(0);
  const d: number[] = [];
  const h: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(t[i + 1] - t[i]);
    d.push((y[i + 1] - y[i]) / h[i]);
  }
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) continue;
    const w1 = 2 * h[i] + h[i - 1];
    const w2 = h[i] + 2 * h[i - 1];
    m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
  }
  return m;
}

export class CameraRig {
  private readonly times: number[];
  private readonly values: number[][]; // [channel][key]
  private readonly slopes: number[][];
  private readonly out = new Array<number>(CHANNELS).fill(0);
  private readonly m = new THREE.Matrix4();

  /** @param keys the shot list; at least two keys, strictly increasing in `t`. */
  constructor(keys: readonly CameraKey[]) {
    if (keys.length < 2) throw new Error("CameraRig needs at least two keys");
    for (let i = 1; i < keys.length; i++) {
      if (!(keys[i].t > keys[i - 1].t)) throw new Error(`CameraRig keys must be strictly increasing in t (key ${i})`);
    }
    this.times = keys.map((k) => k.t);
    const rows = keys.map(channelValues);
    this.values = Array.from({ length: CHANNELS }, (_, c) => rows.map((r) => r[c]));
    this.slopes = this.values.map((y) => tangents(this.times, y));
  }

  /** Sample the rig at time `t` (seconds); clamped to the first and last key. */
  sample(t: number, out: CameraSample = CameraRig.newSample()): CameraSample {
    const times = this.times;
    const tc = THREE.MathUtils.clamp(t, times[0], times[times.length - 1]);
    let i = 0;
    while (i < times.length - 2 && tc >= times[i + 1]) i++;
    const h = times[i + 1] - times[i];
    const s = (tc - times[i]) / h;
    const s2 = s * s;
    const s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1;
    const h10 = s3 - 2 * s2 + s;
    const h01 = -2 * s3 + 3 * s2;
    const h11 = s3 - s2;
    const v = this.out;
    for (let c = 0; c < CHANNELS; c++) {
      const y = this.values[c];
      const m = this.slopes[c];
      v[c] = h00 * y[i] + h10 * h * m[i] + h01 * y[i + 1] + h11 * h * m[i + 1];
    }
    out.position.set(v[0], v[1], v[2]);
    out.look.set(v[3], v[4], v[5]);
    out.fov = v[6];
    out.focusDist = Math.max(0.05, v[7]);
    out.focusRange = out.focusDist * Math.max(0.05, v[8]) + 0.02;
    this.m.lookAt(out.position, out.look, THREE.Object3D.DEFAULT_UP);
    out.quaternion.setFromRotationMatrix(this.m);
    return out;
  }

  /** Position and orientation only, for baking targets in front of the camera. */
  frameAt(t: number, out: CameraFrame): CameraFrame {
    const s = this.sample(t);
    out.position.copy(s.position);
    out.quaternion.copy(s.quaternion);
    return out;
  }

  static newSample(): CameraSample {
    return {
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      look: new THREE.Vector3(),
      fov: 40,
      focusDist: 1,
      focusRange: 0.5,
    };
  }
}
