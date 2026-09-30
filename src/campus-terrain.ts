import dorm56Grading from "../authoring/dorm56/terrain-grading.json";
import dorm52Grading from "../authoring/dorm52/terrain-grading.json";
import config from "../public/terrain/landform.json";
import library from "../public/models/library/library.json";
import stadium from "../public/models/stadium/stadium.json";
import sports from "../public/models/sports/sports.json";
import activity from "../public/models/activity/activity.json";
import hall from "../public/models/hall/hall.json";
import uestc from "../public/models/uestc/uestc.json";
import bupt from "../public/models/bupt/bupt.json";
import incubator from "../public/models/incubator/incubator.json";
import canteen from "../public/models/canteen/canteen.json";

type Point = [number, number];
type Region = {
  id: string;
  footprint: Point[];
  bounds: number[];
  level?: number;
};
const mapPoint = (p: number[]): Point => [
  ((p[0] - 359) * 1000) / 190,
  ((870 - p[1]) * 1000) / 190,
];
const smooth = (v: number) => {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
};
function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1),
    ),
  );
  return { d: Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz), t };
}
function signedDistance(p: Point, polygon: Point[]) {
  let within = false,
    edge = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      within = !within;
    edge = Math.min(edge, segmentDistance(p, a, b).d);
  }
  return within ? -edge : edge;
}
function convexHull(points: Point[]) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (a: Point, b: Point, c: Point) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const half = (list: Point[]) => {
    const out: Point[] = [];
    for (const v of list) {
      while (out.length > 1 && cross(out.at(-2)!, out.at(-1)!, v) <= 0)
        out.pop();
      out.push(v);
    }
    return out.slice(0, -1);
  };
  return [...half(p), ...half(p.reverse())];
}
function region(id: string, points: Point[], level?: number): Region {
  const footprint = convexHull(points);
  return {
    id,
    footprint,
    level,
    bounds: [
      Math.min(...points.map((p) => p[0])),
      Math.max(...points.map((p) => p[0])),
      Math.min(...points.map((p) => p[1])),
      Math.max(...points.map((p) => p[1])),
    ],
  };
}
function influence(p: Point, area: Region, inner: number, feather: number) {
  const b = area.bounds,
    extent = inner + feather;
  if (
    p[0] < b[0] - extent ||
    p[0] > b[1] + extent ||
    p[1] < b[2] - extent ||
    p[1] > b[3] + extent
  )
    return 0;
  return 1 - smooth((signedDistance(p, area.footprint) - inner) / feather);
}

// Baked local landscape vertices must retain their terrain triangles. Protect the
// actual architecture + planting envelope, not the large review-only ground mesh.
export const authoredTerrainRegions = [
  library,
  stadium,
  sports,
  activity,
  hall,
  uestc,
  bupt,
  incubator,
  canteen,
].map((asset: any) => {
  const points: Point[] = [];
  const collect = (value: any) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (["terrain", "position", "index", "placement"].includes(key)) continue;
      if (
        ["footprint", "outer", "inner", "points"].includes(key) &&
        Array.isArray(child)
      ) {
        for (const p of child)
          if (Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))
            points.push(p as Point);
      } else if (
        ["point", "center"].includes(key) &&
        Array.isArray(child) &&
        child.length === 2
      )
        points.push(child as Point);
      else collect(child);
    }
  };
  collect(asset.collisionVolumes);
  collect(asset.landscape);
  const c = Math.cos(asset.yaw),
    s = Math.sin(asset.yaw);
  return region(
    asset.asset,
    points.map(([x, z]) => [
      asset.anchor[0] + c * x + s * z,
      asset.anchor[1] - s * x + c * z,
    ]),
  );
});

export function createCampusTerrain(
  legacyHeight: (x: number, z: number) => number,
  roads: { points: Point[]; width: number }[],
) {
  const coastline = config.coast.map(mapPoint),
    lake = config.lake.outline.map(mapPoint);
  const peaks = [...config.peaks, ...config.ridges].map((p) => ({
    ...p,
    point: mapPoint(p.map),
  }));
  const protectedRegions = authoredTerrainRegions.slice();
  const pads: Region[] = [];
  let revision = 0;
  const cache = new Map<string, number>();
  const segments = roads.flatMap((r) =>
    r.points.slice(1).map((b, i) => ({ a: r.points[i], b, width: r.width })),
  );
  function naturalHeight(x: number, z: number) {
    const p: Point = [x, z],
      inland = -signedDistance(p, coastline);
    // A broad tidal shelf replaces the former 60m drop directly beside buildings.
    if (inland < 0) return -0.8 - Math.min(16, -inland * 0.025);
    const lowland = 12 + Math.min(17, inland * 0.018);
    let mountain = lowland;
    for (const peak of peaks) {
      const dx = x - peak.point[0],
        dz = z - peak.point[1],
        c = Math.cos(peak.angle),
        s = Math.sin(peak.angle);
      const u = (dx * c + dz * s) / peak.radii[0],
        v = (-dx * s + dz * c) / peak.radii[1];
      const r2 = u * u + v * v,
        envelope = Math.max(0, 1 - r2) ** 2;
      const ravine =
        1 -
        0.075 * Math.sin(dx / 83 + Math.sin(dz / 177)) ** 2 * smooth(r2 * 5);
      mountain = Math.max(
        mountain,
        lowland + (peak.height - lowland) * envelope * ravine,
      );
    }
    let h = -0.8 + (mountain + 0.8) * smooth(inland / 185);
    const lakeDistance = signedDistance(p, lake);
    if (lakeDistance < 95) {
      const basin =
        config.lake.bedLevel +
        (config.lake.waterLevel - config.lake.bedLevel) *
          smooth((lakeDistance + 35) / 35);
      h = basin + (h - basin) * smooth(Math.max(0, lakeDistance) / 95);
    }
    return h;
  }
  function rawHeight(x: number, z: number) {
    const key = `${revision}:${x}:${z}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const p: Point = [x, z];
    let h = naturalHeight(x, z);
    // Roads use a continuous legacy grade, with cut/fill slopes outside shoulders.
    // Preserve intersections exactly; all adjacent segments share their knot height.
    let sum = 0,
      weight = 0,
      strongest = 0;
    for (const seg of segments) {
      const { d, t } = segmentDistance(p, seg.a, seg.b),
        w = 1 - smooth((d - seg.width / 2 - 12) / 70);
      if (w <= 0) continue;
      const level =
        legacyHeight(...seg.a) * (1 - t) + legacyHeight(...seg.b) * t;
      const k = w ** 8;
      sum += level * k;
      weight += k;
      strongest = Math.max(strongest, w);
    }
    if (weight) h = h * (1 - strongest) + (sum / weight) * strongest;
    for (const pad of pads) {
      const w = influence(p, pad, 25, 65);
      if (w) h = h * (1 - w) + pad.level! * w;
    }
    // Union the constraints so overlap/order cannot move either authored model.
    let protection = 0,
      coreProtection = 0;
    for (const area of protectedRegions) {
      protection = Math.max(protection, influence(p, area, 32, 85));
      coreProtection = Math.max(coreProtection, influence(p, area, 29, 3));
    }
    const legacy = legacyHeight(x, z);
    // The old polygon omitted the tidal shelf. Never preserve its artificial
    // offshore -4m value inside the newly recovered coastal lowland.
    protection = Math.max(
      coreProtection,
      protection * smooth((legacy + 0.8) / 4),
    );
    if (protection) h = h * (1 - protection) + legacy * protection;
    cache.set(key, h);
    return h;
  }
  function protect(id: string, points: Point[]) {
    protectedRegions.push(region(id, points));
    revision++;
    cache.clear();
  }
  function addBuildingPads(
    buildings: any[],
    sampleHeight: (x: number, z: number) => number,
    grounds: { placeId: string; footprint: Point[] }[] = [],
  ) {
    const adjusted: any[] = [];
    const groups = new Map<string, any[]>();
    for (const b of buildings) {
      if (
        [dorm52Grading.asset, dorm56Grading.asset].includes(b.placeId) ||
        ["library-blender", "authored-blender"].includes(b.kind)
      )
        continue;
      const list = groups.get(b.placeId) || [];
      list.push(b);
      groups.set(b.placeId, list);
    }
    for (const [id, list] of groups) {
      const points: Point[] = list.flatMap((b) => b.footprint);
      // Raised decks/teaching bridges already have explicit relative elevations.
      if (list.some((b) => Number.isFinite(b.fixedBase))) continue;
      const level = Math.min(...points.map((p) => legacyHeight(...p)));
      for (const b of list) {
        pads.push(region(id, b.footprint, level));
        b.fixedBase = level - 0.15 + (b.baseOffset || 0);
        adjusted.push(b);
      }
    }
    // Keep the previously established platform independent of model/LOD replacement.
    for (const grading of [dorm52Grading, dorm56Grading])
      for (const footprint of grading.footprints)
        pads.push(region(grading.asset, footprint as Point[], grading.level));
    for (const ground of grounds)
      pads.push(region(ground.placeId + "-field", ground.footprint, 20.2));
    revision++;
    cache.clear();
    // Where a pad meets a protected existing site, lift the foundation instead of
    // deforming that site's baked paths. A visible plinth fills the exposed side.
    for (const b of adjusted) {
      const samples: Point[] = b.footprint.flatMap((p: Point, i: number) => {
        const q = b.footprint[(i + 1) % b.footprint.length],
          n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 5));
        return Array.from(
          { length: n },
          (_, k) =>
            [
              p[0] + ((q[0] - p[0]) * k) / n,
              p[1] + ((q[1] - p[1]) * k) / n,
            ] as Point,
        );
      });
      const levels = samples.map((p) => sampleHeight(...p));
      b.fixedBase = Math.max(b.fixedBase, Math.max(...levels) - 0.15);
      b.foundationBottom = Math.min(...levels) - 0.4;
    }
  }
  return {
    rawHeight,
    naturalHeight,
    addBuildingPads,
    protect,
    pads,
    protectedRegions,
    config,
  };
}
