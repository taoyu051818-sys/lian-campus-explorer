// Preserve the handedness of the north-up as-built plan in a south-depth GLB.
import fs from "node:fs/promises";
import { createServer } from "vite";
const read = async (p) => JSON.parse(await fs.readFile(p, "utf8"));
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const { geometry, inside, closest, distance, toWorld } =
    await server.ssrLoadModule("/src/world-geometry.ts");
  const { refine } = await server.ssrLoadModule("/src/refinement.ts");
  const data = await read("public/overall/data.json"),
    ref = await read("authoring/bupt/digitization.json");
  const geo = geometry(data, await read("public/campus.json"));
  refine(geo, data, await read("public/refined-plans.json"));
  const others = geo.buildings
    .filter((b) => b.placeId !== "bupt")
    .map((b) => b.footprint);
  const footprints = [...ref.blocks, ...ref.terraces, ...ref.connectors].map(
    (b) => b.outline,
  );
  const origin = toWorld(data.places.find((p) => p.id === "bupt").point);
  const samples = footprints.flatMap((fp) =>
    fp.flatMap((a, i) => {
      const b = fp[(i + 1) % fp.length],
        n = Math.ceil(distance(a, b));
      return Array.from({ length: n }, (_, j) =>
        a.map((v, k) => v + ((b[k] - v) * j) / n),
      );
    }),
  );
  const offsets = [];
  for (let x = -90; x <= 90; x += 2.5)
    for (let z = -90; z <= 90; z += 2.5)
      offsets.push([origin[0] + x, origin[1] + z]);
  offsets.sort(
    (a, b) =>
      Math.hypot(a[0] - origin[0], a[1] - origin[1]) -
      Math.hypot(b[0] - origin[0], b[1] - origin[1]),
  );
  const anchor = offsets.find((o) =>
    samples.every((p) => {
      const q = p.map((v, k) => v + o[k]);
      return (
        inside(q, geo.land) &&
        geo.clearRoad(q, 4.5) &&
        others.every((fp) => !inside(q, fp))
      );
    }),
  );
  if (!anchor) throw Error("No clear BUPT registration at metre scale");
  const world = (p) => p.map((v, k) => v + anchor[k]),
    base = geo.height(...anchor) + 0.12,
    ground = (p) => geo.height(...world(p)) - base;
  const buildingBases = {};
  for (const id of ["A", "B"]) {
    const points = [...ref.blocks, ...ref.terraces]
      .filter((b) => b.id[0] === id)
      .flatMap((b) => b.outline);
    buildingBases[id] = Math.max(...points.map(ground)) + 0.07;
  }
  const routes = geo.walkways
    .flatMap((p) =>
      p.points.slice(1).map((b, i) => ({ a: p.points[i], b, width: p.width })),
    )
    .concat(
      geo.spawns.map((s) => ({
        a: s.point,
        b: geo.nearestRoad(s.point).point,
        width: 3,
      })),
    );
  const localRoads = ref.roads.flatMap((ps) =>
    ps.slice(1).map((b, i) => ({ a: ps[i], b })),
  );
  const localLinks = [];
  const safe = (p, pad = 0, plants = false) => {
    const q = world(p);
    return (
      inside(q, geo.land) &&
      geo.clearRoad(q, 1 + pad) &&
      others.every(
        (fp) =>
          !inside(q, fp) &&
          fp.every(
            (a, i) =>
              distance(q, closest(q, a, fp[(i + 1) % fp.length])) > 1 + pad,
          ),
      ) &&
      geo.spawns.every((s) => distance(q, s.point) > 3.5 + pad) &&
      (!plants ||
        routes.every(
          (r) => distance(q, closest(q, r.a, r.b)) > r.width / 2 + 0.7 + pad,
        ))
    );
  };
  const clear = (p, pad = 0) =>
    safe(p, pad, true) &&
    footprints.every(
      (fp) =>
        !inside(p, fp) &&
        fp.every(
          (a, i) =>
            distance(p, closest(p, a, fp[(i + 1) % fp.length])) > 3.2 + pad,
        ),
    ) &&
    localRoads.every((r) => distance(p, closest(p, r.a, r.b)) > 3 + pad) &&
    localLinks.every(
      (r) => distance(p, closest(p, r.a, r.b)) > r.width / 2 + 1 + pad,
    );
  const beds = [],
    plants = [],
    shrubs = [],
    paths = [],
    aprons = [],
    lights = [];
  const circle = (p, r, n = 28) =>
    Array.from({ length: n }, (_, i) => [
      p[0] + r * Math.cos((i * Math.PI * 2) / n),
      p[1] + r * Math.sin((i * Math.PI * 2) / n),
    ]);
  // Sample several nearby positions, keeping crowns and beds clear of real circulation.
  for (const seed of ref.landscapeSeeds) {
    const options = [
      [0, 0],
      [-2, 0],
      [2, 0],
      [0, -2],
      [0, 2],
      [-3, -3],
      [3, 3],
    ];
    const p = options
      .map((o) => seed.map((v, k) => v + o[k]))
      .find(
        (p) => clear(p, 2.4) && plants.every((t) => distance(p, t.point) > 5.5),
      );
    if (!p) continue;
    const fp = circle(p, 2.75);
    if (!fp.every((q) => clear(q, 0.1))) continue;
    const name = `bupt lawn ${beds.length}`;
    beds.push({
      name,
      footprint: fp,
      heights: fp.map((p) => ground(p) + 0.1),
    });
    plants.push({
      id: `bupt-tree-${plants.length}`,
      bed: name,
      point: p,
      y: ground(p),
      height: 6.1 + (plants.length % 4) * 0.55,
      crownRadius: 2.35,
      type: plants.length % 3 === 0 ? "palm-single" : "layered-broadleaf",
    });
    for (let j = 0; j < 12; j++) {
      const a = (j * Math.PI) / 6,
        q = [p[0] + 2.05 * Math.cos(a), p[1] + 2.05 * Math.sin(a)];
      shrubs.push({ bed: name, point: q, y: ground(q) + 0.22, radius: 0.62 });
    }
  }
  // Join nearby tree lawns into irregular continuous planted islands.
  const hull = (points) => {
    const ps = points.toSorted((a, b) => a[0] - b[0] || a[1] - b[1]);
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
    if (!fp.every((p) => clear(p, 0))) return false;
    for (
      let x = Math.min(...fp.map((p) => p[0]));
      x < Math.max(...fp.map((p) => p[0]));
      x += 1
    )
      for (
        let z = Math.min(...fp.map((p) => p[1]));
        z < Math.max(...fp.map((p) => p[1]));
        z += 1
      )
        if (inside([x, z], fp) && !clear([x, z], 0)) return false;
    return true;
  };
  for (const bed of beds) {
    const t = plants.find((t) => t.bed === bed.name);
    for (const r of [3.4, 4.2, 5.2]) {
      const fp = circle(t.point, r);
      if (patchClear(fp)) {
        bed.footprint = fp;
        bed.heights = fp.map((p) => ground(p) + 0.1);
      }
    }
  }
  for (let i = 0; i < beds.length; i++)
    for (let j = i + 1; j < beds.length; j++) {
      const merged = hull([...beds[i].footprint, ...beds[j].footprint]);
      if (patchClear(merged)) {
        const old = beds[j].name;
        for (const t of plants) if (t.bed === old) t.bed = beds[i].name;
        beds[i].footprint = merged;
        beds[i].heights = merged.map((p) => ground(p) + 0.1);
        beds.splice(j--, 1);
      }
    }
  shrubs.length = 0;
  for (const bed of beds)
    for (let i = 0; i < bed.footprint.length; i++) {
      const a = bed.footprint[i],
        b = bed.footprint[(i + 1) % bed.footprint.length],
        n = Math.ceil(distance(a, b) / 1.05);
      for (let j = 0; j < n; j++) {
        const p = a.map((v, k) => v + ((b[k] - v) * j) / n);
        shrubs.push({
          bed: bed.name,
          point: p,
          y: ground(p) + 0.22,
          radius: 0.62,
        });
      }
    }
  function round(poly, cut = 2.2, n = 8) {
    if (cut <= 0) return poly;
    const result = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i],
        a = poly[(i + poly.length - 1) % poly.length],
        b = poly[(i + 1) % poly.length],
        da = distance(p, a),
        db = distance(p, b),
        c = Math.min(cut, da * 0.28, db * 0.28),
        start = p.map((v, k) => v + ((a[k] - v) * c) / da),
        end = p.map((v, k) => v + ((b[k] - v) * c) / db);
      for (let j = 0; j <= n; j++) {
        const t = j / n;
        result.push(
          p.map(
            (v, k) =>
              start[k] * (1 - t) ** 2 + 2 * v * t * (1 - t) + end[k] * t * t,
          ),
        );
      }
    }
    return result;
  }
  const offset = (fp, amount) =>
    fp.map((p, i) => {
      const a = fp[(i + fp.length - 1) % fp.length],
        b = fp[(i + 1) % fp.length];
      let u = [p[0] - a[0], p[1] - a[1]],
        v = [b[0] - p[0], b[1] - p[1]];
      u = u.map((x) => x / Math.hypot(...u));
      v = v.map((x) => x / Math.hypot(...v));
      const n1 = [-u[1], u[0]],
        n2 = [-v[1], v[0]],
        sum = [n1[0] + n2[0], n1[1] + n2[1]],
        n = sum.map((x) => x / Math.hypot(...sum));
      return p.map(
        (x, k) =>
          x + (n[k] * amount) / Math.max(0.5, n[0] * n1[0] + n[1] * n1[1]),
      );
    });
  const addCell = (fp, tone) => {
    if (fp.every((p) => safe(p, 0.05)))
      paths.push({
        footprint: fp,
        heights: fp.map((p) => ground(p) + 0.055),
        tone,
      });
  };
  // Smooth the road bends and form continuous narrow offset pavement rings.
  for (const source of ref.roads) {
    const ps = round(source.slice(0, -1), 5, 10),
      left = offset(ps, 2.2),
      right = offset(ps, -2.2);
    for (let i = 0; i < ps.length; i++) {
      const j = (i + 1) % ps.length;
      addCell([left[i], left[j], right[j], right[i]], 1);
    }
  }
  for (const block of ref.envelopes) {
    const fp = round(block.outline, 0),
      inner = offset(fp, -0.15),
      outer = offset(fp, -4.8);
    aprons.push({
      inner,
      outer,
      innerHeights: inner.map((p) => ground(p) + 0.07),
      outerHeights: outer.map((p) => ground(p) + 0.07),
    });
  }
  const court = ref.courtPaving;
  for (const fp of court) {
    const c = fp.reduce(
      (s, p) => s.map((v, k) => v + p[k] / fp.length),
      [0, 0],
    );
    for (let i = 0; i < fp.length; i++)
      addCell([c, fp[i], fp[(i + 1) % fp.length]], 0);
  }
  for (const t of plants.filter((_, i) => i % 3 === 1)) {
    const p = [t.point[0] + 3, t.point[1]];
    if (safe(p, 0.3)) lights.push({ point: p, y: ground(p), height: 3.3 });
  }
  const d = {
    schema: 1,
    asset: "bupt",
    name: "北京邮电大学",
    anchor,
    base,
    yaw: 0,
    buildingBases,
    storeyHeight: 3.9,
    blocks: ref.blocks,
    connectors: ref.connectors,
    frames: ref.frames,
    terraces: ref.terraces,
    envelopes: ref.envelopes,
    stairs: ref.stairs,
    courtyards: ref.courtyards,
    landscape: {
      beds,
      plants,
      shrubs,
      paths,
      aprons,
      lights,
      placement:
        "Built photographs and panorama informed; tree species/count and exact locations estimated; circulation clearance checked",
    },
    sources: [
      {
        url: ref.source,
        images: ref.evidenceImages,
        role: "2025 as-built drawings and built photographs",
      },
      {
        url: "https://www.720yun.com/vr/5dejtgefzu6",
        scene: 27335716,
        role: "BUPT panorama reviewed via public browser on 2026-09-29",
      },
    ],
    evidence: {
      confirmed: [
        "Two college buildings: college1 five floors; college2 six-floor main wings and four-floor outer strip",
        "Red and charcoal end towers with horizontal white louvers, white rectangular window grids, blue-gray glazing, open connectors and exposed ground columns",
        "College1 recessed court with raised roof gardens; college2 descending planted terraces and stair flights; roof pergolas, palms and young staked trees",
      ],
      estimated: ref.limits.concat([
        "Campus anchor offset " +
          anchor.join(", ") +
          " m; existing schematic road registration, not cadastral coordinates",
      ]),
    },
    review: {
      eyebrow: "BUPT HAINAN CAMPUS",
      heading: "双学院楼、横向遮阳与阶梯花园",
      description:
        "砖红与深灰端楼、白色窗格、架空连廊与屋顶廊架，结合下沉庭院、多级退台花园及周边绿化。",
    },
    views: {
      overall: { position: [-85, 142, -210], target: [0, 7, 3], fov: 48 },
      front: { position: [-145, 72, 173], target: [-5, 12, 0], fov: 49 },
      entrance: { position: [-44, 7, -49], target: [-20, 3, -5], fov: 54 },
      college1: { position: [-15, 66, -108], target: [-29, 9, 8], fov: 47 },
      college2: { position: [-25, 70, 44], target: [38, 10, -7], fov: 48 },
      roof: { position: [0, 260, 1], target: [0, 7, 0], fov: 48 },
      landscape: { position: [-123, 22, 100], target: [-12, 6, 22], fov: 53 },
    },
  };
  d.review.groundHeight =
    Math.min(
      ...beds.flatMap((b) => b.heights),
      ...plants.map((p) => p.y),
      ...paths.flatMap((p) => p.heights),
    ) - 0.12;
  await fs.writeFile(
    "authoring/bupt/design.json",
    JSON.stringify(d, null, 2) + "\n",
  );
  console.log({
    anchor,
    base,
    buildingBases,
    trees: plants.length,
    beds: beds.length,
    paths: paths.length,
  });
} finally {
  await server.close();
}
