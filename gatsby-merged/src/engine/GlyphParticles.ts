import * as THREE from "three";
import { PALETTE } from "./world";
import { GlyphAtlas } from "./GlyphAtlas";
import type { ParticleBuffers } from "../layout/Mapping";
import fragmentShader from "./shaders/glyph.frag.glsl?raw";
import vertexShader from "./shaders/glyph.vert.glsl?raw";

/**
 * GlyphParticles
 * --------------
 * A single instanced draw call rendering every typewritten character in the
 * scene – resting on the paper, in flight, and settled in the quote.
 */
export interface GlyphUniformState {
  time: number;
  carriageX: number;
  focusDist: number;
  focusRange: number;
  deskFade: number;
  dissolve: number;
  fogDensity: number;
  fogColor: THREE.Color;
  opacity: number;
  /** Position of the camera the sea is drifting relative to. */
  seaRefPos: THREE.Vector3;
  /** Time at which the sea has formed. */
  seaOrigin: number;
  /** 1 = full brightness; dips while the quote forms. */
  seaDim: number;
}

export class GlyphParticles {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly geometry: THREE.InstancedBufferGeometry;
  /** Debug visualiser: straight lines from each quote glyph's paper origin to its slot. */
  readonly links: THREE.LineSegments;

  constructor(buffers: ParticleBuffers, atlas: GlyphAtlas) {
    const base = new THREE.PlaneGeometry(1, 1, 1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute("position", base.getAttribute("position"));
    geo.setAttribute("uv", base.getAttribute("uv"));
    geo.instanceCount = buffers.count;

    const inst = (arr: Float32Array, size: number) => new THREE.InstancedBufferAttribute(arr, size);
    geo.setAttribute("aOrigin", inst(buffers.origin, 3));
    geo.setAttribute("aOriginQuat", inst(buffers.originQuat, 4));
    geo.setAttribute("aTarget", inst(buffers.target, 3));
    geo.setAttribute("aTargetQuat", inst(buffers.targetQuat, 4));
    geo.setAttribute("aGlyph", inst(buffers.glyph, 2));
    geo.setAttribute("aTiming", inst(buffers.timing, 4));
    geo.setAttribute("aSeed", inst(buffers.seed, 4));
    geo.setAttribute("aScale", inst(buffers.scale, 2));
    geo.setAttribute("aCarriage", inst(buffers.carriage, 1));
    // Particles roam the whole world – never let Three cull the draw call.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.geometry = geo;

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uAtlas: { value: atlas.texture },
        uCellSize: { value: atlas.cellSize },
        uTime: { value: 0 },
        uRefPos: { value: new THREE.Vector3() },
        uSeaOrigin: { value: 0 },
        uSeaDim: { value: 1 },
        uCarriageX: { value: 0 },
        uFocusDist: { value: 0.3 },
        uFocusRange: { value: 0.2 },
        uDeskFade: { value: 1 },
        uDissolve: { value: 0 },
        uFogDensity: { value: 0 },
        uFogColor: { value: new THREE.Color(PALETTE.deskFog) },
        uOpacity: { value: 1 },
        uInk: { value: new THREE.Color(PALETTE.ink) },
        uCream: { value: new THREE.Color(PALETTE.cream) },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;

    const linkGeo = new THREE.BufferGeometry();
    linkGeo.setAttribute("position", new THREE.BufferAttribute(buffers.memberLinks, 3));
    this.links = new THREE.LineSegments(
      linkGeo,
      new THREE.LineBasicMaterial({ color: PALETTE.gold, transparent: true, opacity: 0.35, depthWrite: false, fog: false }),
    );
    this.links.frustumCulled = false;
    this.links.visible = false;
    this.links.renderOrder = 21;
  }

  update(s: GlyphUniformState) {
    const u = this.material.uniforms;
    u.uTime.value = s.time;
    (u.uRefPos.value as THREE.Vector3).copy(s.seaRefPos);
    u.uSeaOrigin.value = s.seaOrigin;
    u.uSeaDim.value = s.seaDim;
    u.uCarriageX.value = s.carriageX;
    u.uFocusDist.value = s.focusDist;
    u.uFocusRange.value = s.focusRange;
    u.uDeskFade.value = s.deskFade;
    u.uDissolve.value = s.dissolve;
    u.uFogDensity.value = s.fogDensity;
    (u.uFogColor.value as THREE.Color).copy(s.fogColor);
    u.uOpacity.value = s.opacity;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.links.geometry.dispose();
    (this.links.material as THREE.Material).dispose();
  }
}
