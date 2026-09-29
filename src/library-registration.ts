import library from "../public/models/library/library.json";
import type { Point } from "./world-geometry";

// The same transform places Blender visuals, collision hulls and map framing.
export function libraryWorldPoint(p: number[]): Point {
  const c = Math.cos(library.yaw),
    s = Math.sin(library.yaw);
  return [
    library.anchor[0] + c * p[0] + s * p[1],
    library.anchor[1] - s * p[0] + c * p[1],
  ];
}

export function registerLibrary(geo: any) {
  const base = geo.height(...library.anchor) + 0.12;
  for (const hull of library.collisionVolumes) {
    geo.buildings.push({
      name: hull.name,
      placeId: "library",
      footprint: hull.footprint.map(libraryWorldPoint),
      height: hull.height + 2,
      fixedBase: base - 2,
      traced: false,
      kind: "library-blender",
    });
  }
  geo.libraryAsset = { base, anchor: library.anchor, yaw: library.yaw };
}
