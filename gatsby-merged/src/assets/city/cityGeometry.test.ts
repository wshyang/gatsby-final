import { describe, expect, it } from "vitest";
import { CITY_GROUND, RIVER_W, layoutBuildings, riverX } from "./cityLayout";

describe("layoutBuildings", () => {
  const a = layoutBuildings();

  it("is deterministic for the same seed", () => {
    const b = layoutBuildings();
    expect(b.boxes.length).toBe(a.boxes.length);
    expect(b.boxes[100]).toEqual(a.boxes[100]);
    expect(b.spires.length).toBe(a.spires.length);
  });

  it("places a few thousand buildings", () => {
    expect(a.boxes.length).toBeGreaterThan(3000);
    expect(a.spires.length).toBeGreaterThan(0);
  });

  it("keeps ground-level footprints out of the river corridor", () => {
    const ground = a.boxes.filter((b) => b.y0 === CITY_GROUND);
    for (const b of ground) {
      // block centre was tested at the street row; allow the building's own half-width
      const d = Math.abs(b.x - riverX(b.z + 40));
      expect(d + b.w / 2 + 130).toBeGreaterThanOrEqual(RIVER_W / 2);
    }
    const inWater = ground.filter((b) => Math.abs(b.x - riverX(b.z)) < RIVER_W / 2 - 60);
    expect(inWater.length).toBe(0);
  });
});
