import * as THREE from "three";
import { CITY_GROUND, RIVER_W, riverX } from "./cityLayout";

/** Suspension bridge across the river: stone towers, deck, catenary cables, suspenders. */
export function buildBridge(z0: number, stone: THREE.Material, scale = 1): THREE.Group {
  const G = CITY_GROUND;
  const group = new THREE.Group();
  const rx = riverX(z0);
  const half = RIVER_W / 2 + 110;
  const towerH = 95 * scale;
  const deckY = G + 40 * scale;

  // towers (two legs + cap) at ~1/4 and 3/4 of the span
  for (const s of [-0.55, 0.55]) {
    const tx = rx + s * RIVER_W * 0.5;
    for (const lz of [-9, 9]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(9, towerH, 7), stone);
      leg.position.set(tx, G + towerH / 2, z0 + lz);
      group.add(leg);
    }
    const cap = new THREE.Mesh(new THREE.BoxGeometry(11, 12, 28), stone);
    cap.position.set(tx, G + towerH - 6, z0);
    group.add(cap);
    const mid = new THREE.Mesh(new THREE.BoxGeometry(10, 8, 26), stone);
    mid.position.set(tx, deckY + 26, z0);
    group.add(mid);
  }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 3, 22), stone);
  deck.position.set(rx, deckY, z0);
  group.add(deck);

  // cables + suspenders
  const pts: number[] = [];
  const t1 = rx - 0.55 * RIVER_W * 0.5;
  const t2 = rx + 0.55 * RIVER_W * 0.5;
  const top = G + towerH - 4;
  const cable = (x: number): number => {
    if (x < t1) return THREE.MathUtils.lerp(deckY, top, (x - (rx - half)) / (t1 - (rx - half)));
    if (x > t2) return THREE.MathUtils.lerp(top, deckY, (x - t2) / (rx + half - t2));
    const u = (x - t1) / (t2 - t1);
    return top - (top - deckY - 4) * 4 * u * (1 - u);
  };
  for (const lz of [-10, 10]) {
    for (let x = rx - half; x < rx + half; x += 6) {
      pts.push(x, cable(x), z0 + lz, x + 6, cable(x + 6), z0 + lz);
      pts.push(x, cable(x), z0 + lz, x, deckY, z0 + lz);
    }
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x3d4448, transparent: true, opacity: 0.55, fog: false })));
  return group;
}
