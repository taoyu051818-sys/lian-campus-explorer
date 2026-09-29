import bupt from "../public/models/bupt/bupt.json";
import uestc from "../public/models/uestc/uestc.json";
import sports from "../public/models/sports/sports.json";
import hall from "../public/models/hall/hall.json";
import activity from "../public/models/activity/activity.json";
import type { Point } from "./world-geometry";

// One transform governs model, landscape and colliders; source geometry remains in metres.
export function registerAuthoredSites(geo: any) {
  geo.authoredAssets = [];
  geo.authoredCollisionMeshes = [];
  for (const asset of [sports, activity, hall, uestc, bupt]) {
    const c = Math.cos(asset.yaw),
      s = Math.sin(asset.yaw);
    const point = (p: number[]): Point => [
      asset.anchor[0] + c * p[0] + s * p[1],
      asset.anchor[1] - s * p[0] + c * p[1],
    ];
    const base = geo.height(...asset.anchor) + 0.12;
    geo.buildings = geo.buildings.filter((b: any) => b.placeId !== asset.asset);
    for (const hull of asset.collisionVolumes)
      geo.buildings.push({
        name: hull.name,
        placeId: asset.asset,
        footprint: hull.footprint.map(point),
        height: hull.height,
        fixedBase: base + hull.base,
        kind: "authored-blender",
        traced: false,
      });
    for (const mesh of asset.collisionMeshes) {
      const position = mesh.position.slice();
      for (let i = 0; i < position.length; i += 3) {
        const p = point([position[i], position[i + 2]]);
        position[i] = p[0];
        position[i + 1] += base;
        position[i + 2] = p[1];
      }
      geo.authoredCollisionMeshes.push({
        ...mesh,
        position,
        placeId: asset.asset,
      });
    }
    geo.exteriorAccessAreas ??= [];
    for (const patch of [
      ...asset.landscape.beds,
      ...asset.landscape.aprons.map((a) => ({ footprint: a.outer })),
    ])
      geo.exteriorAccessAreas.push({
        placeId: asset.asset,
        footprint: patch.footprint.map(point),
      });
    geo.authoredAssets.push({
      id: asset.asset,
      name: asset.name,
      anchor: asset.anchor,
      base,
      yaw: asset.yaw,
    });
  }
}
