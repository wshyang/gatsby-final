import * as THREE from "three";
import type { PageSpec } from "../../content/types";
import { TYPE, WORLD } from "../../engine/world";
import { makePaperTexture } from "../../engine/textures";

/**
 * PaperSurface
 * ------------
 * A physical sheet of paper in the scene. It is the *only* place glyph
 * particles are allowed to originate from.
 *
 * `poseAt(u, v)` maps a paper coordinate (u across the page, v down the
 * page, both 0‥1) to a world-space pose:
 *   - position   : point on the paper
 *   - quaternion : frame whose +X is the reading direction, +Y points up
 *                  the page (towards earlier lines) and +Z is the paper normal
 *
 * The same function is used to generate the visible paper mesh, so a glyph
 * at (u, v) is guaranteed to sit exactly on the rendered surface.
 */
export interface SurfacePose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

export abstract class PaperSurface {
  readonly id: number;
  readonly width = TYPE.pageWidth;
  readonly height = TYPE.pageHeight;
  /** True when the surface rides on the typewriter carriage (moves while typing). */
  readonly onCarriage: boolean = false;
  abstract readonly mesh: THREE.Mesh;

  constructor(id: number) {
    this.id = id;
  }

  /** Pose in world space for paper coordinate (u, v). */
  abstract poseAt(u: number, v: number, out?: SurfacePose): SurfacePose;
}

const _m = new THREE.Matrix4();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();

function poseFromBasis(out: SurfacePose, p: THREE.Vector3, x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3) {
  out.position.copy(p);
  _m.makeBasis(x, y, z);
  out.quaternion.setFromRotationMatrix(_m);
  return out;
}

export function newPose(): SurfacePose {
  return { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
}

/* ------------------------------------------------------------------ */
/*  Flat page lying on the desk                                        */
/* ------------------------------------------------------------------ */
export class FlatPage extends PaperSurface {
  readonly mesh: THREE.Mesh;
  private readonly matrix = new THREE.Matrix4();

  /**
   * @param position world position of the page centre (y = desk height + tiny offset)
   * @param yaw      rotation about the vertical axis (radians)
   */
  constructor(id: number, position: THREE.Vector3, yaw: number, texture: THREE.Texture) {
    super(id);
    const geo = new THREE.PlaneGeometry(this.width, this.height, 1, 1);
    // Plane is built in XY (normal +Z, top edge +Y). Lay it in XZ with the
    // top edge towards -Z so that v = 0 (top of page) ↔ local z = -H/2.
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.92,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(position);
    this.mesh.rotation.y = yaw;
    this.mesh.receiveShadow = true;
    this.mesh.updateMatrix();
    this.matrix.copy(this.mesh.matrix);
  }

  poseAt(u: number, v: number, out: SurfacePose = newPose()): SurfacePose {
    const local = new THREE.Vector3((u - 0.5) * this.width, 0, (v - 0.5) * this.height);
    const p = local.applyMatrix4(this.matrix);
    // Local glyph frame: X = reading dir, Y = up the page (-Z local), Z = normal (+Y local)
    _x.set(1, 0, 0).transformDirection(this.matrix);
    _y.set(0, 0, -1).transformDirection(this.matrix);
    _z.set(0, 1, 0).transformDirection(this.matrix);
    return poseFromBasis(out, p, _x, _y, _z);
  }
}

/* ------------------------------------------------------------------ */
/*  Sheet wrapped around the typewriter platen                         */
/* ------------------------------------------------------------------ */
/**
 * The paper leaves the platen just above the printing point (θ ≈ 20°) and
 * then stands up, leaning back. Parameterised by arc length `s` measured
 * from the printing line (s > 0 = towards the top of the page).
 */
export class PlatenSheet extends PaperSurface {
  readonly mesh: THREE.Mesh;
  readonly onCarriage = true;
  /** Angle at which the paper peels off the platen. */
  readonly thetaEnd = THREE.MathUtils.degToRad(20);
  readonly radius = WORLD.platenRadius;
  /** s value of the top edge of the page (v = 0). */
  readonly sTop: number;
  /** Typewriter → world transform (static). The carriage X offset is applied at runtime. */
  private readonly base: THREE.Matrix4;

  /**
   * @param typewriterMatrix world matrix of the typewriter root
   * @param linesOnSheet     number of text lines already typed – the last one sits on the printing line
   */
  constructor(id: number, typewriterMatrix: THREE.Matrix4, linesOnSheet: number, texture: THREE.Texture) {
    super(id);
    this.base = typewriterMatrix.clone();
    // The last line's centre must be at s = 0 (printing point).
    this.sTop = TYPE.marginTop + (linesOnSheet - 0.5) * TYPE.lineHeight;

    // Build a grid along the wrapped surface using the very same poseAt().
    // Dense along the page so the wrap around the platen is a smooth arc
    // (coarse chords would let the platen poke through the paper).
    const segU = 2;
    const segV = 220;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const pose = newPose();
    const local = new THREE.Matrix4().copy(this.base).invert();
    for (let j = 0; j <= segV; j++) {
      const v = j / segV;
      for (let i = 0; i <= segU; i++) {
        const u = i / segU;
        this.poseAt(u, v, pose);
        // Store geometry in typewriter-local coordinates; the mesh is parented to the carriage.
        pose.position.applyMatrix4(local);
        positions.push(pose.position.x, pose.position.y, pose.position.z);
        uvs.push(u, 1 - v);
      }
    }
    for (let j = 0; j < segV; j++) {
      for (let i = 0; i < segU; i++) {
        const a = j * (segU + 1) + i;
        const b = a + 1;
        const c = a + segU + 1;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.9,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
  }

  /** Pose in typewriter-local space (before the world transform). */
  private localPose(u: number, v: number, out: SurfacePose) {
    const s = this.sTop - v * this.height;
    const r = this.radius;
    const [cx, cy, cz] = WORLD.platenCenter;
    const x = (u - 0.5) * this.width;
    const arc = r * this.thetaEnd;
    let theta: number;
    let py: number;
    let pz: number;
    if (s <= arc) {
      // On the cylinder (θ = 0 is the front of the platen, growing upwards).
      theta = Math.max(s / r, -1.45);
      py = cy + r * Math.sin(theta);
      pz = cz + r * Math.cos(theta);
    } else {
      // Tangent continuation: flat sheet standing up, leaning back.
      theta = this.thetaEnd;
      const ext = s - arc;
      py = cy + r * Math.sin(theta) + ext * Math.cos(theta);
      pz = cz + r * Math.cos(theta) - ext * Math.sin(theta);
    }
    out.position.set(cx + x, py, pz);
    _x.set(1, 0, 0);
    _y.set(0, Math.cos(theta), -Math.sin(theta)); // up the page
    _z.set(0, Math.sin(theta), Math.cos(theta)); // normal
    return poseFromBasis(out, out.position, _x, _y, _z);
  }

  poseAt(u: number, v: number, out: SurfacePose = newPose()): SurfacePose {
    this.localPose(u, v, out);
    out.position.applyMatrix4(this.base);
    const rot = new THREE.Quaternion().setFromRotationMatrix(this.base);
    out.quaternion.premultiply(rot);
    return out;
  }
}

/* ------------------------------------------------------------------ */
/*  Factory helpers                                                    */
/* ------------------------------------------------------------------ */
export interface PagePose {
  x: number;
  z: number;
  yaw: number;
}

/**
 * Lay out one flat page per spec. Poses missing from a spec come from `anchors`
 * (usually `desk.pageAnchors(n)`), so a different desk moves the pages with it.
 */
export function createFlatPages(startId: number, pages: readonly PageSpec[], anchors: readonly PagePose[]): FlatPage[] {
  return pages.map((spec, i) => {
    const anchor = anchors[i % Math.max(1, anchors.length)] ?? { x: 0, z: 0.2, yaw: 0 };
    const tex = makePaperTexture({ seed: 100 + i * 17, age: spec.age, coffeeRing: spec.coffeeRing, crease: spec.crease });
    // Slight vertical stacking so overlapping pages do not z-fight.
    const pos = new THREE.Vector3(spec.x ?? anchor.x, 0.0006 + i * 0.0005, spec.z ?? anchor.z);
    return new FlatPage(startId + i, pos, spec.yaw ?? anchor.yaw, tex);
  });
}
