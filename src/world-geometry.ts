import type { AtlasData } from "./atlas";
export type Point = [number, number];
export const SCALE = 1000 / 190;
export const toWorld = (p: Point): Point => [
  (p[0] - 359) * SCALE,
  (870 - p[1]) * SCALE,
];
export const toMap = (p: Point): Point => [
  p[0] / SCALE + 359,
  870 - p[1] / SCALE,
];
export function inside(p: Point, poly: Point[]) {
  let yes = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      yes = !yes;
  }
  return yes;
}
export function closest(p: Point, a: Point, b: Point): Point {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    t = Math.max(
      0,
      Math.min(
        1,
        ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1),
      ),
    );
  return [a[0] + dx * t, a[1] + dz * t];
}
export const distance = (a: Point, b: Point) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);
export type Building = {
  name: string;
  placeId: string;
  footprint: Point[];
  height: number;
  traced: boolean;
};
export function geometry(data: AtlasData, campus: any) {
  const land = data.land.map(toWorld);
  const roads = data.roads.map((r) => ({
    ...r,
    points: r.points.map(toWorld),
    width:
      r.kind === "对外道路"
        ? 28
        : r.kind === "主路"
          ? 22
          : r.kind === "次路"
            ? 18
            : 14,
  }));
  const segments = roads.flatMap((r) =>
    r.points.slice(1).map((b, i) => ({ a: r.points[i], b, width: r.width })),
  );
  const nearestRoad = (p: Point) =>
    segments
      .map((s) => ({ point: closest(p, s.a, s.b), ...s }))
      .sort((a, b) => distance(p, a.point) - distance(p, b.point))[0];
  const clearRoad = (p: Point, margin = 3) =>
    segments.every(
      (s) => distance(p, closest(p, s.a, s.b)) > s.width / 2 + margin,
    );
  const buildings: Building[] = [];
  // Existing digitized coordinates retain their metre scale and north orientation.
  const centre: Point = campus.boundary.reduce(
    (s: Point, p: Point) => [
      s[0] + p[0] / campus.boundary.length,
      s[1] + p[1] / campus.boundary.length,
    ],
    [0, 0],
  );
  const local = (p: Point): Point => [p[0] - centre[0], p[1] - centre[1]];
  for (const b of campus.blocks)
    buildings.push({
      name: b.name,
      placeId: "uestc",
      footprint: b.footprint.map(local),
      height: b.height,
      traced: true,
    });
  for (const place of data.places.filter((p) => p.id !== "uestc")) {
    const c = toWorld(place.point),
      poly =
        place.polygon?.map(toWorld) ??
        ([
          [c[0] - 22, c[1] - 22],
          [c[0] + 22, c[1] - 22],
          [c[0] + 22, c[1] + 22],
          [c[0] - 22, c[1] + 22],
        ] as Point[]);
    const angle = Math.atan2(poly[1][1] - poly[0][1], poly[1][0] - poly[0][0]);
    const dorm = place.id.startsWith("dorm") || place.id === "community";
    const max =
      place.id === "village"
        ? 26
        : dorm
          ? 12
          : place.category === "学校"
            ? 7
            : place.id === "energy"
              ? 4
              : 3;
    const w =
        place.id === "services"
          ? 12
          : dorm
            ? 35
            : place.category === "体育"
              ? 48
              : 30,
      d =
        place.id === "services"
          ? 8
          : dorm
            ? 13
            : place.category === "体育"
              ? 24
              : 18;
    const candidates: Point[] = [];
    for (
      let x = Math.min(...poly.map((p) => p[0])) + 8;
      x < Math.max(...poly.map((p) => p[0]));
      x += 12
    )
      for (
        let z = Math.min(...poly.map((p) => p[1])) + 8;
        z < Math.max(...poly.map((p) => p[1]));
        z += 12
      )
        candidates.push([x, z]);
    candidates.sort((a, b) => distance(a, c) - distance(b, c));
    const accepted: { point: Point; radius: number }[] = [];
    for (const p of candidates) {
      if (accepted.length >= max) break;
      const fp: Point[] = [
        [-w / 2, -d / 2],
        [w / 2, -d / 2],
        [w / 2, d / 2],
        [-w / 2, d / 2],
      ].map(([x, z]) => [
        p[0] + x * Math.cos(angle) - z * Math.sin(angle),
        p[1] + x * Math.sin(angle) + z * Math.cos(angle),
      ]);
      const samples = fp.flatMap((a, i) => [
        a,
        [
          (a[0] + fp[(i + 1) % 4][0]) / 2,
          (a[1] + fp[(i + 1) % 4][1]) / 2,
        ] as Point,
      ]);
      const radius = Math.hypot(w, d) / 2;
      if (
        !samples.every((v) => inside(v, poly) && clearRoad(v, 5)) ||
        !clearRoad(p, 5) ||
        accepted.some((a) => distance(a.point, p) < a.radius + radius + 8)
      )
        continue;
      // Neighbouring parcel sketches can overlap; avoid stacking their buildings.
      if (
        buildings.some(
          (b) =>
            fp.some((v) => inside(v, b.footprint)) ||
            b.footprint.some((v) => inside(v, fp)),
        )
      )
        continue;
      accepted.push({ point: p, radius });
      buildings.push({
        name: `${place.name} · 示意体量 ${accepted.length}`,
        placeId: place.id,
        footprint: fp,
        height:
          place.category === "体育"
            ? 13
            : dorm
              ? 24
              : place.id === "library"
                ? 28
                : place.id === "village"
                  ? 9
                  : 18,
        traced: false,
      });
    }
  }
  const stadiumCentre = toWorld(
    data.places.find((p) => p.id === "stadium")!.point,
  );
  const forecourts: any[] = [];
  const transportSites: any[] = [];
  const grounds: {
    placeId: string;
    name: string;
    footprint: Point[];
    center: Point;
    axis: Point;
    radius: number;
    straightHalfLength: number;
  }[] = [];
  // A continuous synthetic landform. No survey elevation is implied.
  function rawHeight(x: number, z: number) {
    const p: Point = [x, z];
    if (!inside(p, land)) return -4;
    let edge = Infinity;
    for (let i = 0; i < land.length; i++)
      edge = Math.min(
        edge,
        distance(p, closest(p, land[i], land[(i + 1) % land.length])),
      );
    const t = Math.min(1, edge / 60),
      s = t * t * (3 - 2 * t);
    let base =
      14 +
      0.003 * Math.max(0, x) +
      1.2 * Math.sin(x / 300) * Math.cos(z / 420) +
      85 * Math.exp(-((x - 2000) ** 2 / 1500000 + (z + 1400) ** 2 / 200000));
    const sx = x - stadiumCentre[0],
      sz = z - stadiumCentre[1];
    const along = sx * Math.cos(1.1) + sz * Math.sin(1.1);
    const across = -sx * Math.sin(1.1) + sz * Math.cos(1.1);
    const fieldDistance = Math.hypot(Math.max(0, Math.abs(along) - 42), across);
    const tField = Math.max(0, Math.min(1, (fieldDistance - 75) / 40));
    const blend = tField * tField * (3 - 2 * tField);
    base = 15.35 * (1 - blend) + base * blend;
    for (const ground of grounds) {
      const dx = x - ground.center[0],
        dz = z - ground.center[1];
      const along = dx * ground.axis[0] + dz * ground.axis[1];
      const across = -dx * ground.axis[1] + dz * ground.axis[0];
      const d = Math.hypot(
        Math.max(0, Math.abs(along) - ground.straightHalfLength),
        across,
      );
      const t = Math.max(0, Math.min(1, (d - ground.radius - 22) / 30));
      const blend = t * t * (3 - 2 * t);
      base = 20.2 * (1 - blend) + base * blend;
    }
    return -4 + (base + 4) * s;
  }
  // Sample the exact same triangles as the rendered 20m ground grid.
  function height(x: number, z: number) {
    const x0 = Math.floor(x / 20) * 20,
      z0 = Math.floor(z / 20) * 20,
      u = (x - x0) / 20,
      v = (z - z0) / 20,
      a = rawHeight(x0, z0),
      b = rawHeight(x0 + 20, z0),
      c = rawHeight(x0, z0 + 20),
      d = rawHeight(x0 + 20, z0 + 20);
    return u + v <= 1
      ? a + (b - a) * u + (c - a) * v
      : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }
  const spawns = data.places.map((p) => {
    const c = toWorld(p.point),
      r = nearestRoad(c);
    return { id: p.id, point: r.point };
  });
  return {
    grounds,
    transportSites,
    forecourts,
    walkways: [] as {
      placeId: string;
      name: string;
      width: number;
      points: Point[];
    }[],
    land,
    roads,
    segments,
    buildings,
    spawns,
    nearestRoad,
    clearRoad,
    height,
    rawHeight,
    local,
  };
}
