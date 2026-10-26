import * as THREE from "three";
import { makeEnamelRoughness, makeTypewriterDecal } from "../../engine/textures";

export interface TypewriterMaterials {
  enamel: THREE.MeshStandardMaterial;
  matteWell: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  darkSteel: THREE.MeshStandardMaterial;
  keyGlass: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  felt: THREE.MeshStandardMaterial;
  ribbon: THREE.MeshStandardMaterial;
  decal: THREE.MeshStandardMaterial;
}

/** Surface finishes of the machine. Replace any entry to re-skin it. */
export function createTypewriterMaterials(envMap: THREE.Texture | null): TypewriterMaterials {
  const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);
  return {
    enamel: std({ color: 0x0b0b0e, roughness: 0.34, metalness: 0.32, roughnessMap: makeEnamelRoughness(), envMap, envMapIntensity: 1.1 }),
    matteWell: std({ color: 0x070709, roughness: 0.88, metalness: 0.2 }),
    chrome: std({ color: 0xdcdce2, roughness: 0.18, metalness: 0.98, envMap, envMapIntensity: 1.35 }),
    rubber: std({ color: 0x151414, roughness: 0.78, metalness: 0.04 }),
    steel: std({ color: 0x9fa3aa, roughness: 0.3, metalness: 0.94, envMap, envMapIntensity: 1.15 }),
    darkSteel: std({ color: 0x383a42, roughness: 0.45, metalness: 0.88 }),
    keyGlass: std({ color: 0x121317, roughness: 0.14, metalness: 0.15, envMap, envMapIntensity: 1.1 }),
    brass: std({ color: 0xc8a055, roughness: 0.32, metalness: 0.94, envMap, envMapIntensity: 1.1 }),
    felt: std({ color: 0x143322, roughness: 0.95, metalness: 0 }),
    ribbon: std({ color: 0x1f0b0d, roughness: 0.88, metalness: 0.05 }),
    decal: std({ map: makeTypewriterDecal(), transparent: true, roughness: 0.3, metalness: 0.8, depthWrite: false }),
  };
}
