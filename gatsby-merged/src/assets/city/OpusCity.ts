import * as THREE from "three";
import { buildBridge } from "./cityBridge";
import { CITY_GROUND, RIVER_W, layoutBuildings, rng, riverX } from "./cityLayout";
import { buildingMaterial, groundMaterial, paintingMaterial, stoneMaterial, waterMaterial } from "./cityShaders";

/** Cold teal haze of the film (sRGB), converted to linear below. */
const CITY_FOG_SRGB = [0.33, 0.4, 0.43] as const;
const BOAT_COUNT = 6;
const BACKDROP_DISTANCE = 8000;

interface Boat {
  object: THREE.Group;
  z: number;
  off: number;
  speed: number;
}

/**
 * Procedural 1920s Manhattan seen from ~200 m up, in cold teal fog: instanced
 * towers, a river with two suspension bridges and tugs, shared fog, and a matte
 * painting plane locked to the true horizon. Ported unchanged from the opus build.
 */
export class OpusCity {
  readonly scene = new THREE.Scene();
  readonly fog = new THREE.Color(...CITY_FOG_SRGB).convertSRGBToLinear();
  private readonly backdrop: THREE.Mesh;
  private readonly backdropMat: THREE.ShaderMaterial;
  private readonly water: THREE.ShaderMaterial;
  private readonly boats: Boat[] = [];
  private readonly disposables: { dispose(): void }[] = [];
  private readonly euler = new THREE.Euler();

  constructor() {
    this.scene.background = this.fog.clone();
    this.buildGround();
    this.buildBuildings();
    const stone = stoneMaterial(this.fog);
    this.disposables.push(stone);
    this.scene.add(buildBridge(-760, stone));
    this.scene.add(buildBridge(-2350, stone, 0.8));
    this.water = this.buildWater();
    this.buildBoats();
    this.backdropMat = paintingMaterial(this.fog);
    this.backdrop = this.buildBackdrop(this.backdropMat);
  }

  /** Supplies the matte painting; until then the plane stays hidden. */
  setPainting(tex: THREE.Texture): void {
    tex.colorSpace = THREE.SRGBColorSpace;
    this.backdropMat.uniforms.uMap.value = tex;
    this.backdrop.visible = true;
  }

  private buildGround(): void {
    const mat = groundMaterial(this.fog);
    const geo = new THREE.PlaneGeometry(14000, 14000);
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, CITY_GROUND, -3000);
    this.scene.add(ground);
    this.disposables.push(mat, geo);
  }

  private buildBuildings(): void {
    const { boxes, spires } = layoutBuildings();
    const mat = buildingMaterial(this.fog);
    const m = new THREE.Matrix4();

    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geo, mat, boxes.length);
    const tint = new Float32Array(boxes.length);
    boxes.forEach((b, i) => {
      m.makeScale(b.w, b.h, b.d).setPosition(b.x, b.y0, b.z);
      mesh.setMatrixAt(i, m);
      tint[i] = b.tint;
    });
    geo.setAttribute("aTint", new THREE.InstancedBufferAttribute(tint, 1));
    mesh.frustumCulled = false;
    this.scene.add(mesh);

    const cone = new THREE.ConeGeometry(1, 1, 4);
    cone.translate(0, 0.5, 0);
    cone.setAttribute("aTint", new THREE.InstancedBufferAttribute(new Float32Array(spires.length).fill(0.45), 1));
    const sm = new THREE.InstancedMesh(cone, mat, spires.length);
    const scale = new THREE.Vector3();
    spires.forEach((s, i) => {
      m.makeRotationY(Math.PI / 4).scale(scale.set(s.r, s.h, s.r)).setPosition(s.x, s.y, s.z);
      sm.setMatrixAt(i, m);
    });
    sm.frustumCulled = false;
    this.scene.add(sm);
    this.disposables.push(mat, geo, cone, mesh, sm);
  }

  private buildWater(): THREE.ShaderMaterial {
    const mat = waterMaterial(this.fog);
    const shape = new THREE.Shape();
    const z1 = 900;
    const z2 = -6500;
    const hw = RIVER_W / 2 + 120;
    shape.moveTo(riverX(z1) - hw, -z1);
    shape.lineTo(riverX(z1) + hw, -z1);
    shape.lineTo(riverX(z2) + hw, -z2);
    shape.lineTo(riverX(z2) - hw, -z2);
    const geo = new THREE.ShapeGeometry(shape);
    const water = new THREE.Mesh(geo, mat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = CITY_GROUND + 0.5;
    this.scene.add(water);
    this.disposables.push(mat, geo);
    return mat;
  }

  private buildBoats(): void {
    const mat = new THREE.MeshBasicMaterial({ color: 0x1a1d1f });
    const hullGeo = new THREE.BoxGeometry(9, 3, 28);
    const cabGeo = new THREE.BoxGeometry(6, 5, 8);
    const R = rng(77);
    for (let i = 0; i < BOAT_COUNT; i++) {
      const object = new THREE.Group();
      const hull = new THREE.Mesh(hullGeo, mat);
      const cab = new THREE.Mesh(cabGeo, mat);
      cab.position.set(0, 3.5, 3);
      object.add(hull, cab);
      this.scene.add(object);
      this.boats.push({ object, z: -300 - R() * 2200, off: (R() - 0.5) * RIVER_W * 0.6, speed: 2 + R() * 4 });
    }
    this.disposables.push(mat, hullGeo, cabGeo);
  }

  private buildBackdrop(mat: THREE.ShaderMaterial): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(1, 1);
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = -10;
    m.frustumCulled = false;
    m.visible = false;
    this.scene.add(m);
    this.disposables.push(mat, geo);
    return m;
  }

  /** Advances the water/boats and re-pins the matte painting to the city camera. */
  update(t: number, cam: THREE.PerspectiveCamera): void {
    this.water.uniforms.uTime.value = t;
    for (const b of this.boats) {
      const z = b.z - t * b.speed;
      b.object.position.set(riverX(z) + b.off, CITY_GROUND + 1.5, z);
      b.object.rotation.y = Math.atan(0.36);
    }
    // Backdrop: camera-attached plane whose image row 0.55 (the haze line under the
    // skyline) is pinned ~1.5 deg below the true horizon, whatever the camera pitch.
    const D = BACKDROP_DISTANCE;
    const e = this.euler.setFromQuaternion(cam.quaternion, "YXZ");
    const vt = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const H = 2 * D * vt * 1.35;
    const W = Math.max(H * 1.78, 2 * D * vt * cam.aspect * 1.1);
    const horizonY = D * Math.tan(-e.x - THREE.MathUtils.degToRad(1.5));
    this.backdrop.scale.set(W, H, 1);
    this.backdrop.position.set(0, horizonY - (0.55 - 0.5) * H * -1, -D).applyQuaternion(cam.quaternion).add(cam.position);
    this.backdrop.quaternion.copy(cam.quaternion);
  }

  dispose(): void {
    const tex = this.backdropMat.uniforms.uMap.value as THREE.Texture | null;
    tex?.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
