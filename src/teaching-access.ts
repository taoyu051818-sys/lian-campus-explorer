import {
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Scene,
  VertexData,
} from "@babylonjs/core";
import { distance, closest, inside, type Point } from "./world-geometry";
import { teachingPlan as plan } from "./teaching-plan-data";
export type AccessSlab = {
  name: string;
  footprint: Point[];
  bottom: number;
  top: number;
};
export type AccessRail = { a: Point; b: Point; ya: number; yb: number };
export type AccessStair = {
  id: string;
  anchor: Point;
  ground: number;
  top: number;
  risers: number;
  rise: number;
  run: number;
  foot: Point;
  route: [number, number, number][];
  footprint: Point[];
};
export type TeachingAccess = {
  slabs: AccessSlab[];
  ramps: { a: Point; b: Point; bottom: number; top: number; width: number }[];
  rails: AccessRail[];
  stairs: AccessStair[];
  deckTop: number;
  bridgeRoute: [number, number, number][];
};
// Outdoor playability adaptation: the permit drawing supplies the bridge, not these stair details.
export function addTeachingAccess(geo: any) {
  const bridge = geo.teachingBridge.points as Point[],
    deckTop = geo.teachingBridge.deckBase + 0.65;
  const origin = bridge[0],
    pixelOrigin = plan.bridge[0],
    point = (p: number[]): Point => [
      origin[0] + (p[0] - pixelOrigin[0]) * plan.metresPerPixel,
      origin[1] - (p[1] - pixelOrigin[1]) * plan.metresPerPixel,
    ];
  const ramps: TeachingAccess["ramps"] = [];
  const slabs: AccessSlab[] = [],
    rails: AccessRail[] = [],
    stairs: AccessStair[] = [];
  const slab = (name: string, fp: Point[], bottom: number, top: number) =>
    slabs.push({ name, footprint: fp, bottom, top });
  const rail = (a: Point, b: Point, ya: number, yb = ya) =>
    rails.push({ a, b, ya, yb });
  for (const [id, anchor] of [
    ["A75", point([707, 725])],
    ["A79", bridge[bridge.length - 1]],
  ] as [string, Point][]) {
    const pt = (x: number, v: number): Point => [anchor[0] + x, anchor[1] - v];
    const rect = (x1: number, v1: number, x2: number, v2: number): Point[] => [
      pt(x1, v1),
      pt(x2, v1),
      pt(x2, v2),
      pt(x1, v2),
    ];
    const ground = geo.height(...pt(3.8, 0)) + 0.12,
      total = deckTop - ground,
      risers = Math.ceil(total / 4 / 0.16),
      rise = total / (4 * risers),
      tread = 0.34,
      run = risers * tread,
      start = 2,
      end = start + run;
    const route: [number, number, number][] = [
      [...pt(3.8, -1), ground],
      [...pt(3.8, start), ground],
    ];
    slab(
      id + " ground threshold",
      rect(2.2, -1.6, 5.4, 2),
      ground - 0.4,
      ground,
    );
    for (let f = 0; f < 4; f++) {
      const x = f % 2 === 0 ? 3.8 : 0,
        dir = f % 2 === 0 ? 1 : -1,
        base = ground + (f * total) / 4;
      ramps.push({
        a: pt(x, dir === 1 ? start : end),
        b: pt(x, dir === 1 ? end : start),
        bottom: base,
        top: base + total / 4,
        width: 3,
      });
      for (let k = 0; k < risers; k++) {
        const a = dir === 1 ? start + k * tread : end - (k + 1) * tread,
          b = a + tread,
          top = base + (k + 1) * rise;
        slab(
          `${id} flight ${f + 1} tread ${k + 1}`,
          rect(x - 1.5, a, x + 1.5, b + 0.008),
          Math.min(base - 0.2, top - 0.22),
          top,
        );
        const p = pt(x, dir === 1 ? a + tread * 0.5 : b - tread * 0.5);
        route.push([...p, top]);
      }
      const h = base + total / 4,
        far = dir === 1;
      const v1 = far ? end : 0,
        v2 = far ? end + 2 : start;
      slab(`${id} landing ${f + 1}`, rect(-1.6, v1, 5.4, v2), h - 0.25, h);
      route.push([...pt(x, far ? end + 1 : 1), h]);
      if (f < 3) route.push([...pt(x === 0 ? 3.8 : 0, far ? end + 1 : 1), h]);
      for (const side of [-1, 1])
        rail(
          pt(x + side * 1.53, start),
          pt(x + side * 1.53, end),
          far ? base : h,
          far ? h : base,
        );
      rail(pt(-1.63, far ? end + 2 : 0), pt(5.43, far ? end + 2 : 0), h);
      for (const side of [-1.63, 5.43]) rail(pt(side, v1), pt(side, v2), h);
    }
    // Top landing opens towards the bridge; remove its north-side rail across that opening.
    const topNorth = rails.findIndex(
      (r) =>
        Math.abs(r.ya - deckTop) < 0.001 &&
        distance(r.a, pt(-1.63, 0)) < 0.01 &&
        distance(r.b, pt(5.43, 0)) < 0.01,
    );
    if (topNorth >= 0) rails.splice(topNorth, 1);
    rail(pt(1.7, 0), pt(5.43, 0), deckTop);
    const foot = pt(3.8, -1);
    route.push([...pt(0, 0), deckTop]);
    stairs.push({
      id,
      anchor,
      ground,
      top: deckTop,
      risers: risers * 4,
      rise,
      run,
      foot,
      route,
      footprint: rect(-1.75, -1.75, 5.6, end + 2.2),
    });
  }
  const a75 = stairs[0],
    a79 = stairs[1];
  // The A75 approach remains outside the interiors, above the podium edge.
  const upperRoute: Point[] = [
    bridge[0],
    [a75.anchor[0], a75.anchor[1] + 3],
    a75.anchor,
  ];
  const sides = upperRoute.map((p, i) => {
    const a = upperRoute[Math.max(0, i - 1)],
      b = upperRoute[Math.min(upperRoute.length - 1, i + 1)],
      len = distance(a, b);
    let nx = -(b[1] - a[1]) / len,
      nz = (b[0] - a[0]) / len;
    if (i > 0 && i < upperRoute.length - 1) {
      const prev = upperRoute[i - 1],
        next = upperRoute[i + 1],
        l1 = distance(prev, p),
        l2 = distance(p, next);
      nx = -(p[1] - prev[1]) / l1 - (next[1] - p[1]) / l2;
      nz = (p[0] - prev[0]) / l1 + (next[0] - p[0]) / l2;
      const n = Math.hypot(nx, nz);
      nx /= n;
      nz /= n;
      const cosine =
        nx * (-(next[1] - p[1]) / l2) + nz * ((next[0] - p[0]) / l2);
      return [(nx * 1.5) / cosine, (nz * 1.5) / cosine] as Point;
    }
    return [nx * 1.5, nz * 1.5] as Point;
  });
  for (let i = 1; i < upperRoute.length; i++) {
    const a = upperRoute[i - 1],
      b = upperRoute[i],
      u = sides[i - 1],
      v = sides[i];
    slab(
      "A75 exterior upper approach " + i,
      [
        [a[0] + u[0], a[1] + u[1]],
        [b[0] + v[0], b[1] + v[1]],
        [b[0] - v[0], b[1] - v[1]],
        [a[0] - u[0], a[1] - u[1]],
      ],
      deckTop - 0.25,
      deckTop,
    );
    for (const side of [-1, 1])
      rail(
        [a[0] + u[0] * side, a[1] + u[1] * side],
        [b[0] + v[0] * side, b[1] + v[1] * side],
        deckTop,
      );
  }
  // Continuous physical parapets replace decorative-only bridge rails.
  for (const body of geo.buildings.filter(
    (b: any) => b.kind === "teaching-bridge",
  ))
    for (const [i, j] of [
      [0, 1],
      [2, 3],
    ])
      rail(body.footprint[i], body.footprint[j], deckTop);
  const groundPaths: { name: string; points: Point[] }[] = [
    {
      name: "A75上桥楼梯地面接入",
      points: [
        point([711, 774]),
        point([722, 758]),
        point([722, 738]),
        point([722, 720]),
        a75.foot,
      ],
    },
    {
      name: "A79上桥楼梯地面接入",
      points: [
        a79.foot,
        [a79.foot[0] + 13, a79.foot[1] + 5],
        [a79.foot[0] + 13, a79.foot[1] + 37],
      ],
    },
  ];
  // A79 connects to its nearest clear road; this connector avoids the running track.
  const last = groundPaths[1].points.at(-1)!;
  const candidate = geo.segments
    .map((s: any) => closest(last, s.a, s.b))
    .sort((a: Point, b: Point) => distance(last, a) - distance(last, b))
    .find((q: Point) =>
      Array.from(
        { length: 101 },
        (_, k): Point => [
          last[0] + ((q[0] - last[0]) * k) / 100,
          last[1] + ((q[1] - last[1]) * k) / 100,
        ],
      ).every(
        (p) =>
          inside(p, geo.land) &&
          !geo.buildings.some(
            (b: any) => b.kind !== "teaching-bridge" && inside(p, b.footprint),
          ),
      ),
    );
  if (candidate) groundPaths[1].points.push(candidate);
  for (const p of groundPaths)
    geo.walkways.push({
      placeId: "teaching",
      width: p.name.startsWith("A75") ? 1.8 : 2.8,
      ...p,
    });
  // Arrive at the road end of the new stadium-side approach.
  if (candidate)
    geo.spawns.find((s: any) => s.id === "teaching")!.point = candidate;
  geo.exteriorAccessAreas = stairs.map((s) => ({ footprint: s.footprint }));
  geo.teachingAccess = {
    slabs,
    ramps,
    rails,
    stairs,
    deckTop,
    bridgeRoute: [...upperRoute.slice(1).reverse(), ...bridge].map((p) => [
      ...p,
      deckTop,
    ]),
  } satisfies TeachingAccess;
}
export function createTeachingAccess(
  scene: Scene,
  geo: any,
  volume: (
    name: string,
    fp: Point[],
    h: number,
    base: number,
    mat: StandardMaterial,
  ) => Mesh,
) {
  const access = geo.teachingAccess as TeachingAccess,
    physical: Mesh[] = [],
    visual: Mesh[] = [];
  const material = (name: string, hex: string) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor.set(0.08, 0.08, 0.08);
    return m;
  };
  const concrete = material("outdoor stair pale concrete", "#d7d9d1"),
    edge = material("outdoor stair edge markers", "#879da0");
  const infill = material("exterior glass balustrade", "#92aeb7");
  infill.alpha = 0.48;
  infill.backFaceCulling = false;
  for (const s of access.slabs)
    (s.name.includes(" flight ") ? visual : physical).push(
      volume(s.name, s.footprint, s.top - s.bottom, s.bottom, concrete),
    );
  for (const r of access.rails) {
    const len = distance(r.a, r.b),
      dy = r.yb - r.ya,
      angle = -Math.atan2(r.b[1] - r.a[1], r.b[0] - r.a[0]);
    const wall = MeshBuilder.CreateBox(
      "continuous exterior safety rail",
      { width: Math.hypot(len, dy), height: 1.15, depth: 0.12 },
      scene,
    );
    wall.position.set(
      (r.a[0] + r.b[0]) / 2,
      (r.ya + r.yb) / 2 + 0.575,
      (r.a[1] + r.b[1]) / 2,
    );
    wall.rotation.y = angle;
    wall.rotation.z = Math.atan2(dy, len);
    wall.material = infill;
    physical.push(wall);
  }
  for (const stair of access.stairs) {
    for (const p of stair.route.filter((_, i) => i % 4 === 0)) {
      const marker = MeshBuilder.CreateBox(
        "stair tread contrast",
        { width: 2.7, height: 0.025, depth: 0.045 },
        scene,
      );
      marker.position.set(p[0], p[2] + 0.025, p[1]);
      marker.material = edge;
      visual.push(marker);
    }
  }
  const merged = Mesh.MergeMeshes(
    physical,
    true,
    true,
    undefined,
    false,
    true,
  )!;
  merged.name = "teaching outdoor stairs and bridge safety rails";
  merged.metadata = { placeId: "teaching" };
  if (visual.length) {
    const details = Mesh.MergeMeshes(
      visual,
      true,
      true,
      undefined,
      false,
      true,
    )!;
    details.isPickable = false;
  }
  // Smooth invisible collision wedges follow the visual treads, avoiding capsule snagging.
  const rampMeshes = access.ramps.map((r, i) => {
    const len = distance(r.a, r.b),
      u: Point = [
        ((-(r.b[1] - r.a[1]) / len) * r.width) / 2,
        (((r.b[0] - r.a[0]) / len) * r.width) / 2,
      ],
      a = r.a,
      b = r.b,
      low = r.bottom - 0.3;
    const p = [
      a[0] + u[0],
      r.bottom,
      a[1] + u[1],
      a[0] - u[0],
      r.bottom,
      a[1] - u[1],
      b[0] - u[0],
      r.top,
      b[1] - u[1],
      b[0] + u[0],
      r.top,
      b[1] + u[1],
      a[0] + u[0],
      low,
      a[1] + u[1],
      a[0] - u[0],
      low,
      a[1] - u[1],
      b[0] - u[0],
      low,
      b[1] - u[1],
      b[0] + u[0],
      low,
      b[1] + u[1],
    ];
    const ix = [
        0, 1, 2, 0, 2, 3, 4, 7, 6, 4, 6, 5, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2,
        2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0,
      ],
      vd = new VertexData();
    vd.positions = p;
    vd.indices = ix;
    const m = new Mesh("stair collision slope " + i, scene);
    vd.applyToMesh(m);
    m.visibility = 0;
    m.isPickable = false;
    return m;
  });
  return [merged, ...rampMeshes];
}
