// Prepare site registration and planting positions using the same terrain/roads as the game.
import fs from "node:fs/promises";
import { createServer } from "vite";
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const { geometry, toWorld, inside, closest, distance } =
    await server.ssrLoadModule("/src/world-geometry.ts");
  const { refine } = await server.ssrLoadModule("/src/refinement.ts");
  const read = async (p) => JSON.parse(await fs.readFile(p, "utf8"));
  const data = await read("public/overall/data.json"),
    campus = await read("public/campus.json"),
    plans = await read("public/refined-plans.json");
  const geo = geometry(data, campus),
    registrations = refine(geo, data, plans);
  const registration = registrations.find((r) => r.id === "sports"),
    origin = toWorld(data.places.find((p) => p.id === "sports").point);
  const anchor = origin.map((x, i) => x + registration.translation[i]),
    base = geo.height(...anchor) + 0.12;
  const angle = (-34 * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle);
  const world = (p) => [p[0] + anchor[0], p[1] + anchor[1]];
  const local = (center, u, v) => [
    center[0] + u * c - v * s,
    center[1] + u * s + v * c,
  ];
  const rounded = (center, w, d, r) => {
    const points = [];
    for (const [x, z, start] of [
      [w / 2 - r, d / 2 - r, 0],
      [-w / 2 + r, d / 2 - r, 90],
      [-w / 2 + r, -d / 2 + r, 180],
      [w / 2 - r, -d / 2 + r, 270],
    ])
      for (let i = 0; i < 9; i++) {
        const a = ((start + (i * 90) / 8) * Math.PI) / 180;
        points.push(local(center, x + r * Math.cos(a), z + r * Math.sin(a)));
      }
    return points;
  };
  const blocks = [
    {
      id: "pool",
      name: "游泳馆",
      center: [-42, 82],
      width: 85.31,
      depth: 96.78,
      radius: 13,
      height: 23.9,
    },
    {
      id: "gym",
      name: "体育馆",
      center: [34, -38],
      width: 79,
      depth: 121.4,
      radius: 8,
      height: 29.9,
    },
    {
      id: "annex",
      name: "附馆",
      center: local([34, -38], 6, -80),
      width: 58,
      depth: 23,
      radius: 6,
      height: 17.4,
    },
  ];
  for (const b of blocks) {
    b.angle = -34;
    b.footprint = rounded(b.center, b.width, b.depth, b.radius);
    b.base =
      Math.min(...b.footprint.map((p) => geo.height(...world(p)))) -
      0.15 -
      base;
  }
  const hulls = [
    ...geo.buildings
      .filter((b) => b.placeId !== "sports")
      .map((b) => b.footprint),
    ...blocks.map((b) => b.footprint.map(world)),
  ];
  const paths = [
    ...geo.walkways
      .filter((w) => w.placeId !== "sports")
      .map((w) => ({ points: w.points, width: w.width })),
    ...geo.spawns.map((sp) => ({
      points: [sp.point, geo.nearestRoad(sp.point).point],
      width: 6,
    })),
  ].flatMap((path) =>
    path.points
      .slice(1)
      .map((b, i) => ({ a: path.points[i], b, width: path.width })),
  );
  function safe(p, padding = 0) {
    const q = world(p);
    if (
      !inside(q, geo.land) ||
      !geo.clearRoad(q, 4 + padding) ||
      geo.height(...q) < 5
    )
      return false;
    if (geo.spawns.some((sp) => distance(q, sp.point) < 6 + padding))
      return false;
    if (
      paths.some(
        (p) => distance(q, closest(q, p.a, p.b)) < p.width / 2 + padding + 1,
      )
    )
      return false;
    if (
      hulls.some(
        (fp) =>
          inside(q, fp) ||
          fp.some(
            (a, i) =>
              distance(q, closest(q, a, fp[(i + 1) % fp.length])) < 2 + padding,
          ),
      )
    )
      return false;
    return true;
  }
  const plants = [],
    beds = [];
  for (const b of blocks.filter((b) => b.id !== "annex")) {
    for (let side = 0; side < 4; side++)
      for (let along = -0.35; along <= 0.36; along += 0.23) {
        const horizontal = side % 2 === 0,
          sign = side < 2 ? 1 : -1;
        for (const offset of [13, 24]) {
          const p = local(
            b.center,
            horizontal ? along * b.width : sign * (b.width / 2 + offset),
            horizontal ? sign * (b.depth / 2 + offset) : along * b.depth,
          );
          if (!safe(p, 3.3) || plants.some((t) => distance(t.point, p) < 10))
            continue;
          const n = plants.length;
          plants.push({
            id: "sports-tree-" + n,
            building: b.id,
            type: n % 3 === 0 ? "broadleaf" : "palm",
            point: p,
            y: geo.height(...world(p)) - base,
            height: 6.2 + ((n * 1.618) % 2.4),
            crownRadius: 3.3,
          });
        }
      }
  }
  for (const t of plants) {
    const fp = Array.from({ length: 24 }, (_, i) => {
      const a = (i * Math.PI) / 12;
      return [t.point[0] + 5.2 * Math.cos(a), t.point[1] + 3.8 * Math.sin(a)];
    });
    if (fp.every((p) => safe(p, 0.6)))
      beds.push({
        center: t.point,
        footprint: fp,
        heights: fp.map((p) => geo.height(...world(p)) - base + 0.04),
        y: t.y + 0.04,
        building: t.building,
      });
  }
  const aprons = [];
  for (const b of blocks) {
    const inner = rounded(
        b.center,
        b.width + 0.7,
        b.depth + 0.7,
        b.radius + 0.35,
      ),
      outer = rounded(b.center, b.width + 6, b.depth + 6, b.radius + 3);
    aprons.push({
      building: b.id,
      inner,
      outer,
      innerHeights: inner.map((p) => geo.height(...world(p)) - base + 0.09),
      outerHeights: outer.map((p) => geo.height(...world(p)) - base + 0.09),
    });
  }
  const pool = blocks[0],
    line = [
      [-46, -56],
      [-30, -58],
      [-8, -59],
      [15, -57],
      [36, -55],
      [47, -52],
    ].map(([u, v]) => local(pool.center, u, v));
  const pathsColored = [];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1],
      b = line[i],
      len = distance(a, b),
      dx = (b[0] - a[0]) / len,
      dz = (b[1] - a[1]) / len;
    const ring = [
      [a[0] - dz, a[1] + dx],
      [a[0] + dz, a[1] - dx],
      [b[0] + dz, b[1] - dx],
      [b[0] - dz, b[1] + dx],
    ];
    if (ring.every((p) => safe(p, 0.3)))
      pathsColored.push({
        footprint: ring,
        heights: ring.map((p) => geo.height(...world(p)) - base + 0.105),
      });
  }
  const d = {
    schema: 1,
    asset: "sports",
    name: "综合体育中心",
    anchor,
    base,
    yaw: 0,
    blocks,
    landscape: {
      plants,
      beds,
      aprons,
      paths: pathsColored,
      placement:
        "Photo-informed perimeter tree and lawn layout, fitted to existing schematic terrain and checked against roads, buildings, paths and spawns. Individual planting coordinates and species are estimates.",
    },
    sources: [
      {
        url: plans.sports.source,
        pages: [1, 2, 15],
        role: "Built position plans, dimensions, facade and landscape photographs",
      },
    ],
    evidence: {
      confirmed: [
        "pool 85.31 x 96.78 m, 23.9 m high",
        "gym 79.00 x 121.40 m, 29.9 m high; annex 17.4 m high",
        "pool perforated white facade with a broad central curved metal wrap",
        "gym outer geometric screen, recessed roof volume and curved entry stairs",
        "annex has a fenced green rooftop court",
        "lawns, palms and canopy trees at building margins",
      ],
      estimated: [
        "relative placement and campus registration",
        "facade hole sizes and pattern modules",
        "annex footprint, staircase details and rooftop court markings",
        "unphotographed facades, entrances, planting count and positions",
      ],
    },
    views: {
      overall: { position: [-170, 145, -200], target: [-8, 12, 15], fov: 43 },
      pool: { position: [-180, 65, 15], target: [-42, 13, 82], fov: 48 },
      gym: { position: [-103, 80, -175], target: [34, 13, -38], fov: 48 },
      landscape: { position: [-175, 32, -145], target: [-15, 7, 5], fov: 50 },
      roof: { position: [-15, 285, -60], target: [-10, 0, 5], fov: 52 },
    },
  };
  await fs.writeFile(
    "authoring/sports/design.json",
    JSON.stringify(d, null, 2) + "\n",
  );
  console.log({ anchor, base, trees: plants.length, beds: beds.length });
} finally {
  await server.close();
}
