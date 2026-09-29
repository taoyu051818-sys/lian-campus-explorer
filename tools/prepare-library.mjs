// Photo-informed landscape in the library's existing local metre frame.
import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import earcut from "earcut";
import { createServer } from "vite";
const read = async (p) => JSON.parse(await fs.readFile(p, "utf8"));
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const { geometry, inside, closest, distance } = await server.ssrLoadModule(
      "/src/world-geometry.ts",
    ),
    { refine } = await server.ssrLoadModule("/src/refinement.ts");
  const data = await read("public/overall/data.json"),
    geo = geometry(data, await read("public/campus.json"));
  refine(geo, data, await read("public/refined-plans.json"));
  const d = await read("authoring/library/design.json"),
    m = await read("public/models/library/library.json");
  const anchor = d.campusAnchor,
    yaw = d.campusYaw,
    c = Math.cos(yaw),
    s = Math.sin(yaw),
    base = geo.height(...anchor) + 0.12;
  const world = ([x, z]) => [
      anchor[0] + c * x + s * z,
      anchor[1] - s * x + c * z,
    ],
    local = ([x, z]) => [
      c * (x - anchor[0]) - s * (z - anchor[1]),
      s * (x - anchor[0]) + c * (z - anchor[1]),
    ],
    ground = (p) => geo.height(...world(p)) - base;
  const hulls = m.collisionVolumes
      .filter((b) => !b.name.startsWith("library landscape"))
      .map((b) => b.footprint),
    others = geo.buildings.filter((b) => b.placeId !== "library");
  const circle = (p, rx, ry = rx, n = 40) =>
    Array.from({ length: n }, (_, i) => [
      p[0] + rx * Math.cos((i * Math.PI * 2) / n),
      p[1] + ry * Math.sin((i * Math.PI * 2) / n),
    ]);
  const edgeDistance = (p, fp) =>
    Math.min(
      ...fp.map((a, i) => distance(p, closest(p, a, fp[(i + 1) % fp.length]))),
    );
  const safe = (p, pad = 0) => {
    const q = world(p);
    return (
      inside(q, geo.land) &&
      geo.clearRoad(q, 0.6 + pad) &&
      others.every(
        (b) =>
          !inside(q, b.footprint) && edgeDistance(q, b.footprint) > pad + 0.5,
      )
    );
  };
  const clearBody = (p, pad = 0) =>
    safe(p, pad) &&
    hulls.every((fp) => !inside(p, fp) && edgeDistance(p, fp) > pad + 0.9);
  const routes = [
    {
      name: "left pond approach",
      points: [
        [8, -127],
        [-18, -125],
        [-19, -109],
        [-15, -88],
        [-4, -76],
        [-5.5, -72],
      ],
    },
    {
      name: "right pond approach",
      points: [
        [8, -127],
        [27, -123],
        [28, -109],
        [24, -89],
        [8, -80],
        [-4, -76],
        [-5.5, -72],
      ],
    },
  ];
  const links = routes.flatMap((r) =>
    r.points.slice(1).map((b, i) => ({ a: r.points[i], b, width: 4 })),
  );
  const campusPaths = geo.walkways
    .flatMap((r) =>
      r.points.slice(1).map((b, i) => ({ a: r.points[i], b, width: r.width })),
    )
    .concat(
      geo.spawns.map((p) => ({
        a: p.point,
        b: geo.nearestRoad(p.point).point,
        width: 3,
      })),
    );
  const pond = {
    center: [5, -105],
    rx: 14,
    ry: 17,
    footprint: circle([5, -105], 14, 17, 80),
  };
  pond.waterHeight = Math.max(...pond.footprint.map(ground)) + 0.055;
  pond.rimHeight = pond.waterHeight + 0.38;
  if (!pond.footprint.every((p) => clearBody(p, 1)))
    throw Error("Pond overlaps road or building");
  const forecourt = [];
  const addCell = (fp, tone) => {
    if (fp.every((p) => safe(p, 0.05) && !hulls.some((h) => inside(p, h))))
      forecourt.push({
        footprint: fp,
        heights: fp.map((p) => ground(p) + 0.065),
        tone,
      });
  };
  // Elliptical circulation ring retains a real central basin instead of covering it.
  const outer = circle(pond.center, 25, 25, 80);
  for (let i = 0; i < 80; i++) {
    const j = (i + 1) % 80;
    addCell(
      [pond.footprint[i], outer[i], outer[j], pond.footprint[j]],
      "stone",
    );
  }
  for (const r of routes)
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1],
        b = r.points[i],
        len = distance(a, b),
        n = [(-(b[1] - a[1]) / len) * 2.4, ((b[0] - a[0]) / len) * 2.4];
      addCell(
        [
          a.map((v, k) => v - n[k]),
          b.map((v, k) => v - n[k]),
          b.map((v, k) => v + n[k]),
          a.map((v, k) => v + n[k]),
        ],
        "stone",
      );
    }
  addCell(
    [
      [5, -130],
      [11, -130],
      [11, -125],
      [5, -125],
    ],
    "stone",
  );
  // Each wing has a continuous curved apron, limited where existing paths and wings meet.
  const apronCells = [];
  for (const h of m.collisionVolumes.filter((b) =>
    /^library (front-left|front-right|right-garden|rear-garden|tower)$/.test(
      b.name,
    ),
  )) {
    const fp = h.footprint;
    let ar = fp.reduce(
      (a, p, i) =>
        a +
        p[0] * fp[(i + 1) % fp.length][1] -
        fp[(i + 1) % fp.length][0] * p[1],
      0,
    );
    const sign = ar > 0 ? 1 : -1;
    const normals = fp.map((p, i) => {
      const a = fp[(i + fp.length - 1) % fp.length],
        b = fp[(i + 1) % fp.length],
        l1 = distance(a, p),
        l2 = distance(p, b),
        n1 = [((p[1] - a[1]) / l1) * sign, (-(p[0] - a[0]) / l1) * sign],
        n2 = [((b[1] - p[1]) / l2) * sign, (-(b[0] - p[0]) / l2) * sign],
        n = [n1[0] + n2[0], n1[1] + n2[1]],
        len = Math.hypot(...n);
      return n.map(
        (v) => v / len / Math.max(0.5, (n[0] * n1[0] + n[1] * n1[1]) / len),
      );
    });
    const offset = (amount) =>
        fp.map((p, i) => p.map((v, k) => v + normals[i][k] * amount)),
      near = offset(0.1),
      far = offset(4.4);
    for (let i = 0; i < fp.length; i++) {
      const j = (i + 1) % fp.length,
        q = [near[i], near[j], far[j], far[i]];
      if (
        q.every(
          (p) =>
            safe(p, 0.05) && !hulls.some((hh) => hh !== fp && inside(p, hh)),
        )
      )
        apronCells.push({
          footprint: q,
          heights: q.map((p) => ground(p) + 0.07),
          tone: "paving",
        });
    }
  }
  const canopy = [];
  for (const line of [
    [
      [37, -82],
      [43, -97],
      [42, -105],
    ],
    [
      [42, -109],
      [37, -122],
      [31, -129],
    ],
  ]) {
    const points = [];
    for (let i = 0; i <= 18; i++) {
      const t = i / 18;
      points.push(
        [0, 1].map(
          (k) =>
            (1 - t) ** 2 * line[0][k] +
            2 * t * (1 - t) * line[1][k] +
            t * t * line[2][k],
        ),
      );
    }
    if (!points.every((p) => clearBody(p, 2))) continue;
    canopy.push({
      points,
      heights: points.map((p) => ground(p)),
      width: 2.8,
      height: 3.1,
    });
  }
  for (const can of canopy)
    for (let i = 1; i < can.points.length; i++) {
      const a = can.points[i - 1],
        b = can.points[i],
        len = distance(a, b),
        n = [(-(b[1] - a[1]) / len) * 1.75, ((b[0] - a[0]) / len) * 1.75];
      addCell(
        [
          a.map((v, k) => v - n[k]),
          b.map((v, k) => v - n[k]),
          b.map((v, k) => v + n[k]),
          a.map((v, k) => v + n[k]),
        ],
        "stone",
      );
    }
  const plantedClear = (p, pad = 0) =>
    clearBody(p, pad + 2) &&
    !inside(p, outer) &&
    edgeDistance(p, outer) > pad + 0.6 &&
    links.every(
      (r) => distance(p, closest(p, r.a, r.b)) > r.width / 2 + pad + 0.5,
    ) &&
    canopy.every((can) =>
      can.points.every((q) => distance(p, q) > pad + 2.2),
    ) &&
    campusPaths.every(
      (r) =>
        distance(world(p), closest(world(p), r.a, r.b)) >
        r.width / 2 + 0.6 + pad,
    ) &&
    geo.spawns.every((q) => distance(world(p), q.point) > 4 + pad);
  const seeds = [];
  // Palm groves on the photo-left lawn, lower trees toward the sea-facing wing.
  for (let x = 62; x <= 86; x += 11)
    for (let z = -112; z <= 40; z += 17)
      seeds.push({ p: [x + (z % 3), z], type: "palm-single" });
  for (let x = -125; x <= -45; x += 16)
    for (let z = -104; z <= 55; z += 21)
      seeds.push({ p: [x, z], type: "layered-broadleaf" });
  for (const p of [
    [42, 53],
    [24, 62],
    [6, 62],
    [-12, 60],
    [40, -87],
    [47, -115],
    [-31, -111],
    [-39, -129],
  ])
    seeds.push({ p, type: "layered-broadleaf" });
  const plants = [];
  for (const seed of seeds) {
    const radius = seed.type === "palm-single" ? 3.1 : 3.3;
    if (
      !plantedClear(seed.p, radius) ||
      plants.some((p) => distance(seed.p, p.point) < 8)
    )
      continue;
    plants.push({
      id: "library landscape tree " + plants.length,
      point: seed.p,
      y: ground(seed.p),
      height:
        seed.type === "palm-single"
          ? 9.5 + (plants.length % 4)
          : 6.7 + (plants.length % 4) * 0.65,
      crownRadius: radius,
      type: seed.type,
    });
  }
  // Merge grass around tree groups; reject any hull that would cover an approach.
  const hull = (ps) => {
    ps = ps.toSorted((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (a, b, c) =>
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const half = (list) => {
      const h = [];
      for (const p of list) {
        while (h.length > 1 && cross(h.at(-2), h.at(-1), p) <= 0) h.pop();
        h.push(p);
      }
      return h.slice(0, -1);
    };
    return half(ps).concat(half([...ps].reverse()));
  };
  const patchClear = (fp) => {
    if (!fp.every((p) => plantedClear(p))) return false;
    for (
      let x = Math.min(...fp.map((p) => p[0]));
      x < Math.max(...fp.map((p) => p[0]));
      x += 2
    )
      for (
        let z = Math.min(...fp.map((p) => p[1]));
        z < Math.max(...fp.map((p) => p[1]));
        z += 2
      )
        if (inside([x, z], fp) && !plantedClear([x, z])) return false;
    return true;
  };
  const beds = plants
    .map((p, i) => ({
      name: "library lawn " + i,
      footprint: circle(p.point, 4.2, 4.7, 24),
    }))
    .filter((b) => patchClear(b.footprint));
  for (let i = 0; i < beds.length; i++)
    for (let j = i + 1; j < beds.length; j++) {
      const merged = hull([...beds[i].footprint, ...beds[j].footprint]);
      if (patchClear(merged)) {
        beds[i].footprint = merged;
        beds.splice(j--, 1);
      }
    }
  const round = (fp) =>
    fp.flatMap((p, i) => {
      const a = fp[(i + fp.length - 1) % fp.length],
        b = fp[(i + 1) % fp.length],
        da = distance(a, p),
        db = distance(p, b),
        cut = Math.min(4.5, da * 0.3, db * 0.3),
        start = p.map((v, k) => v + ((a[k] - v) * cut) / da),
        end = p.map((v, k) => v + ((b[k] - v) * cut) / db);
      return Array.from({ length: 7 }, (_, j) => {
        const t = j / 6;
        return p.map(
          (v, k) =>
            start[k] * (1 - t) ** 2 + 2 * v * t * (1 - t) + end[k] * t * t,
        );
      });
    });
  for (const b of beds) {
    b.footprint = round(b.footprint);
    b.heights = b.footprint.map((p) => ground(p) + 0.095);
  }

  const shrubs = [];
  for (const [i, t] of plants.entries())
    if (i % 3 === 0)
      for (let j = 0; j < 20; j++) {
        const a = j * 2.399,
          r = Math.sqrt(j / 20) * 2.5,
          p = [t.point[0] + Math.cos(a) * r, t.point[1] + Math.sin(a) * r];
        if (plantedClear(p, 0.6))
          shrubs.push({
            point: p,
            y: ground(p) + 0.35,
            radius: 0.6,
            tone: i % 2 ? "burgundy" : "green",
          });
      }
  const paths = [...apronCells, ...forecourt];
  const merged = spawnSync(
    process.env.LIBRARY_PYTHON || "python3",
    ["authoring/library/merge_paving.py"],
    {
      input: JSON.stringify({
        polygons: paths.map((p) => p.footprint),
        pond: pond.footprint,
      }),
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  if (merged.status !== 0)
    throw Error(
      "Install authoring/library/requirements.txt before preparing landscape: " +
        merged.stderr,
    );
  const pavingMesh = { position: [], index: [] };
  for (const patch of JSON.parse(merged.stdout)) {
    const rings = [patch.shell, ...patch.holes],
      vertices = [],
      holes = [];
    for (const [ri, ring] of rings.entries()) {
      if (ri) holes.push(vertices.length / 2);
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i],
          b = ring[(i + 1) % ring.length],
          n = Math.ceil(distance(a, b) / 2);
        for (let j = 0; j < n; j++)
          vertices.push(
            a[0] + ((b[0] - a[0]) * j) / n,
            a[1] + ((b[1] - a[1]) * j) / n,
          );
      }
    }
    const offset = pavingMesh.position.length / 3;
    for (let i = 0; i < vertices.length; i += 2) {
      const p = vertices.slice(i, i + 2);
      pavingMesh.position.push(p[0], ground(p) + 0.07, p[1]);
    }
    for (const index of earcut(vertices, holes, 2))
      pavingMesh.index.push(offset + index);
  }
  const lights = [
    [-18, -83],
    [18, -84],
    [31, -112],
    [-23, -116],
    [54, -76],
    [-61, -85],
  ]
    .filter((p) => clearBody(p, 0.5) && !inside(p, pond.footprint))
    .map((p) => ({ point: p, y: ground(p), height: 3.3 }));
  const pots = [
    [-11, -74],
    [3, -77],
  ].map((p) => ({ point: p, y: ground(p) + 0.05 }));
  const terrain = { position: [], index: [] };
  // Reuse the actual world-grid triangles, rotated into the asset frame.
  // This is exact terrain interpolation, with fewer vertices than resampling.
  const cells = 42;
  const origin = anchor.map((v) => Math.floor(v / 20) * 20 - 420);
  for (let iz = 0; iz <= cells; iz++)
    for (let ix = 0; ix <= cells; ix++) {
      const worldPoint = [origin[0] + ix * 20, origin[1] + iz * 20];
      const p = local(worldPoint);
      terrain.position.push(
        p[0],
        geo.height(...worldPoint) - base - 0.025,
        p[1],
      );
    }
  for (let iz = 0; iz < cells; iz++)
    for (let ix = 0; ix < cells; ix++) {
      const a = iz * (cells + 1) + ix,
        b = a + 1,
        c = a + cells + 1,
        d = c + 1;
      terrain.index.push(a, c, b, b, c, d);
    }
  const dOut = {
    schema: 1,
    terrain,
    pavingMesh,
    anchor,
    yaw,
    base,
    pond,
    canopy,
    plants,
    beds,
    shrubs,
    paths,
    lights,
    pots,
    walkRoutes: routes.map((r) => ({
      ...r,
      points: r.points.map((p) => [...p, ground(p) + 0.065]),
    })),
    groundHeight:
      Math.min(...paths.flatMap((p) => p.heights), ...plants.map((p) => p.y)) -
      0.12,
    source: {
      url: "https://www.720yun.com/vr/5dejtgefzu6",
      scenes: [27335703, 27310152],
      observed:
        "Aerial elliptic basin, curved white paths/canopies, lawn groves, roof beds and dark decks; ground entrance pots and young trees",
      limits: [
        "Ground panorama entrance may face another elevation; entrance pots use approximate placement, not exact shared camera registration",
        "All horizontal dimensions, species, tree counts, pool depth and terrain registration remain estimated",
        "Library massing and four wing roof levels retained from the user frontal photo fit",
      ],
    },
  };
  await fs.writeFile(
    "authoring/library/landscape.json",
    JSON.stringify(dOut, null, 2) + "\n",
  );
  console.log({
    trees: plants.length,
    beds: beds.length,
    shrubs: shrubs.length,
    paths: paths.length,
    canopies: canopy.length,
    ground: dOut.groundHeight,
  });
} finally {
  await server.close();
}
