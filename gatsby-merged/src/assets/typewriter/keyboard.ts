import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { GlyphAtlas } from "../../engine/GlyphAtlas";
import { addMesh } from "./body";
import type { TypewriterDims } from "./dims";
import type { ResolvedLayout } from "./layout";
import type { TypewriterMaterials } from "./materials";
import type { KeyPress } from "./TypewriterDriver";

const legendVert = /* glsl */ `
  attribute vec3 aPos;
  attribute vec2 aGlyph;
  attribute float aDip;
  uniform float uSize;
  uniform vec2 uCellSize;
  varying vec2 vUv;
  void main() {
    vUv = aGlyph + uv * uCellSize;
    // Quad lies flat on the key top (XZ plane); +Y of the quad maps to -Z world.
    vec3 p = aPos + vec3(position.x * uSize, -aDip, -position.y * uSize);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const legendFrag = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float a = texture2D(uAtlas, vUv).a;
    if (a < 0.02) discard;
    gl_FragColor = vec4(vec3(0.94, 0.89, 0.78), a * uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _q = new THREE.Quaternion();
const _axisX = new THREE.Vector3(1, 0, 0);

/**
 * Glass-and-chrome keys. Each key's cap, chrome ring, stem and legend travel
 * together when pressed, and tilt a few degrees forward at the bottom of the
 * stroke so the motion reads from a distance.
 */
export class Keyboard {
  readonly legendMaterial: THREE.ShaderMaterial;
  private readonly caps: THREE.InstancedMesh;
  private readonly rings: THREE.InstancedMesh;
  private readonly stems: THREE.InstancedMesh;
  private readonly dips: THREE.InstancedBufferAttribute;
  private readonly basePos: THREE.Vector3[] = [];
  private readonly stemBase: { y: number; h: number }[] = [];
  private readonly spaceBar: THREE.Mesh;
  private readonly shiftKey: THREE.Mesh;
  private readonly spaceY: number;
  private readonly shiftY: number;
  private readonly active = new Set<number>();
  private readonly tilt: number;
  private readonly depth: number;
  private readonly m = new THREE.Matrix4();

  constructor(parent: THREE.Object3D, layout: ResolvedLayout, legends: GlyphAtlas, d: TypewriterDims, mats: TypewriterMaterials) {
    const count = layout.keys.length;
    const k = d.keys;
    this.depth = k.pressDepth;
    this.tilt = THREE.MathUtils.degToRad(k.tiltDeg);

    const capGeo = new THREE.CylinderGeometry(0.0085, 0.0082, 0.004, 24);
    const ringGeo = new THREE.TorusGeometry(0.0085, 0.0011, 8, 32);
    ringGeo.rotateX(Math.PI / 2);
    const stemGeo = new THREE.CylinderGeometry(0.0017, 0.0017, 1, 8);
    this.caps = new THREE.InstancedMesh(capGeo, mats.keyGlass, count);
    this.rings = new THREE.InstancedMesh(ringGeo, mats.chrome, count);
    this.stems = new THREE.InstancedMesh(stemGeo, mats.chrome, count);
    for (const mesh of [this.caps, this.rings, this.stems]) mesh.frustumCulled = false;
    this.caps.castShadow = true;

    const legendPos: number[] = [];
    const legendGlyph: number[] = [];
    const rowCounts = new Map<number, number>();
    layout.keys.forEach((_, i) => rowCounts.set(layout.rowOfKey[i], (rowCounts.get(layout.rowOfKey[i]) ?? 0) + 1));
    const seenInRow = new Map<number, number>();

    layout.keys.forEach((key, i) => {
      const row = layout.rowOfKey[i];
      const inRow = seenInRow.get(row) ?? 0;
      seenInRow.set(row, inRow + 1);
      const n = rowCounts.get(row) ?? 1;
      const x = -((n - 1) * k.pitch) / 2 + (k.rowShift[row] ?? 0) + inRow * k.pitch;
      const y = k.rowY[row] ?? k.rowY[k.rowY.length - 1];
      const z = k.rowZ[row] ?? k.rowZ[k.rowZ.length - 1];
      this.basePos.push(new THREE.Vector3(x, y, z));
      const stemH = y - k.stemBottom;
      this.stemBase.push({ y: k.stemBottom + stemH / 2, h: stemH });
      legendPos.push(x, y + 0.0025, z);
      legendGlyph.push(...legends.cellOf(key.lower.toUpperCase()));
    });
    this.dips = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    this.dips.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < count; i++) this.setKey(i, 0);
    parent.add(this.caps, this.rings, this.stems);

    // Legends: one instanced quad per key sampling the serif atlas, dipping with its key.
    const plane = new THREE.PlaneGeometry(1, 1);
    const lg = new THREE.InstancedBufferGeometry();
    lg.index = plane.index;
    lg.setAttribute("position", plane.getAttribute("position"));
    lg.setAttribute("uv", plane.getAttribute("uv"));
    lg.setAttribute("aPos", new THREE.InstancedBufferAttribute(new Float32Array(legendPos), 3));
    lg.setAttribute("aGlyph", new THREE.InstancedBufferAttribute(new Float32Array(legendGlyph), 2));
    lg.setAttribute("aDip", this.dips);
    lg.instanceCount = count;
    this.legendMaterial = new THREE.ShaderMaterial({
      vertexShader: legendVert,
      fragmentShader: legendFrag,
      uniforms: { uAtlas: { value: legends.texture }, uCellSize: { value: legends.cellSize }, uSize: { value: 0.0138 }, uOpacity: { value: 1 } },
      transparent: true,
      depthWrite: false,
    });
    const legendMesh = new THREE.Mesh(lg, this.legendMaterial);
    legendMesh.frustumCulled = false;
    legendMesh.renderOrder = 5;
    parent.add(legendMesh);

    // Space bar and shift key.
    this.spaceY = d.spaceBar.y;
    this.spaceBar = addMesh(parent, new RoundedBoxGeometry(d.spaceBar.width, 0.006, 0.016, 2, 0.0025), mats.keyGlass, [0, d.spaceBar.y, d.spaceBar.z]);
    this.shiftY = k.rowY[0] - 0.003;
    this.shiftKey = addMesh(parent, new RoundedBoxGeometry(0.034, 0.006, 0.014, 2, 0.0025), mats.keyGlass, [-0.126, this.shiftY, k.rowZ[0] + 0.004]);
  }

  private setKey(i: number, amount: number) {
    const base = this.basePos[i];
    const dip = amount * this.depth;
    _q.setFromAxisAngle(_axisX, amount * this.tilt);
    this.m.compose(_p.set(base.x, base.y - dip, base.z), _q, _s);
    this.caps.setMatrixAt(i, this.m);
    this.m.compose(_p.set(base.x, base.y + 0.002 - dip, base.z), _q, _s);
    this.rings.setMatrixAt(i, this.m);
    const st = this.stemBase[i];
    this.m.compose(_p.set(base.x, st.y - dip, base.z), _q.identity(), _s.set(1, st.h, 1));
    this.stems.setMatrixAt(i, this.m);
    _s.set(1, 1, 1);
    this.dips.setX(i, dip);
  }

  /** Press the listed keys; every other key returns to rest. */
  apply(presses: readonly KeyPress[], shift: number) {
    const now = new Map<number, number>();
    let space = 0;
    for (const p of presses) {
      if (p.keyIndex === -1) space = Math.max(space, p.amount);
      else if (p.keyIndex >= 0 && p.keyIndex < this.basePos.length) now.set(p.keyIndex, Math.max(now.get(p.keyIndex) ?? 0, p.amount));
    }
    for (const [i, amount] of now) this.setKey(i, amount);
    for (const i of this.active) if (!now.has(i)) this.setKey(i, 0);
    const changed = now.size > 0 || this.active.size > 0;
    this.active.clear();
    for (const i of now.keys()) this.active.add(i);
    if (changed) {
      this.caps.instanceMatrix.needsUpdate = true;
      this.rings.instanceMatrix.needsUpdate = true;
      this.stems.instanceMatrix.needsUpdate = true;
      this.dips.needsUpdate = true;
    }
    this.spaceBar.position.y = this.spaceY - space * this.depth * 0.8;
    this.shiftKey.position.y = this.shiftY - shift * this.depth;
  }
}
