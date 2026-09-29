// Survey envelope in metres; local depth is towards the rectangular rear block.
import fs from "node:fs/promises";
import { createServer } from "vite";
const read = async (p) => JSON.parse(await fs.readFile(p, "utf8"));
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const { geometry, toWorld, inside, closest, distance } =
    await server.ssrLoadModule("/src/world-geometry.ts");
  const { refine } = await server.ssrLoadModule("/src/refinement.ts");
  const data = await read("public/overall/data.json"),
    plans = await read("public/refined-plans.json");
  const ref = await read("authoring/hall/digitization.json");
  const geo = geometry(data, await read("public/campus.json")),
    registrations = refine(geo, data, plans);
  const origin = toWorld(data.places.find((p) => p.id === "hall").point),
    registration = registrations.find((r) => r.id === "hall");
  const legacy = origin.map((v, k) => v + registration.translation[k]);
  const yaw = ref.localYaw,
    c = Math.cos(yaw),
    s = Math.sin(yaw);
  const rotate = (p) => [c * p[0] + s * p[1], -s * p[0] + c * p[1]];
  let anchor = [...legacy];
  const world = (p) => rotate(p).map((v, k) => v + anchor[k]);
  // Round only the curved front control points; retain straight rear edges.
  const controls = ref.podiumOutline;
  const footprint = [];
  for (let i = 0; i < controls.length; i++) {
    const a = controls[(i + controls.length - 1) % controls.length],
      b = controls[i],
      d = controls[(i + 1) % controls.length],
      e = controls[(i + 2) % controls.length];
    const curve = i < 6 || i >= 9;
    for (let j = 0; j < (curve ? 8 : 1); j++) {
      const t = j / 8;
      footprint.push(
        curve
          ? b.map(
              (v, k) =>
                0.5 *
                (2 * v +
                  (-a[k] + d[k]) * t +
                  (2 * a[k] - 5 * v + 4 * d[k] - e[k]) * t * t +
                  (-a[k] + 3 * v - 3 * d[k] + e[k]) * t * t * t),
            )
          : [...b],
      );
    }
  }
  const neighbors = geo.buildings
    .filter((b) => b.placeId !== "hall")
    .map((b) => b.footprint);
  const samples = footprint.flatMap((a, i) => {
    const b = footprint[(i + 1) % footprint.length],
      n = Math.ceil(distance(a, b));
    return Array.from({ length: n }, (_, j) =>
      a.map((v, k) => v + ((b[k] - v) * j) / n),
    );
  });
  for (let x = -32; x < 33; x += 2)
    for (let z = -34; z < 34; z += 2)
      if (inside([x, z], footprint)) samples.push([x, z]);
  const offsets = [];
  for (let x = -40; x <= 40; x += 2.5)
    for (let z = -40; z <= 40; z += 2.5) offsets.push([x, z]);
  offsets.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  const offset = offsets.find((o) =>
    samples.every((p) => {
      const q = rotate(p).map((v, k) => v + legacy[k] + o[k]);
      return geo.clearRoad(q, 2.8) && neighbors.every((fp) => !inside(q, fp));
    }),
  );
  if (!offset) throw new Error("No clear hall registration");
  anchor = legacy.map((v, k) => v + offset[k]);
  const base = geo.height(...anchor) + 0.12;
  const ground = (p) => geo.height(...world(p)) - base;
  const buildingBase = Math.min(...footprint.map(ground)) - 0.06;
  const routes = geo.walkways
    .flatMap((p) =>
      p.points.slice(1).map((b, i) => ({ a: p.points[i], b, width: p.width })),
    )
    .concat(
      geo.spawns.map((sp) => ({
        a: sp.point,
        b: geo.nearestRoad(sp.point).point,
        width: 3,
      })),
    );
  const hulls = [...neighbors, footprint.map(world)];
  function clear(p, pad = 0) {
    const q = world(p);
    return (
      inside(q, geo.land) &&
      geo.clearRoad(q, 2 + pad) &&
      geo.spawns.every((sp) => distance(q, sp.point) > 4 + pad) &&
      routes.every(
        (r) => distance(q, closest(q, r.a, r.b)) > r.width / 2 + 1 + pad,
      ) &&
      hulls.every(
        (fp) =>
          !inside(q, fp) &&
          fp.every(
            (a, i) =>
              distance(q, closest(q, a, fp[(i + 1) % fp.length])) > 1.3 + pad,
          ),
      )
    );
  }
  const circle = (p, rx, rz, n = 32) =>
    Array.from({ length: n }, (_, i) => [
      p[0] + rx * Math.cos((i * Math.PI * 2) / n),
      p[1] + rz * Math.sin((i * Math.PI * 2) / n),
    ]);
  const beds = [],
    plants = [],
    shrubs = [];
  const candidates = [
    [-36, -22],
    [-31, -33],
    [-22, -43],
    [-8, -46],
    [8, -47],
    [25, -40],
    [35, -28],
    [38, -12],
    [39, 8],
    [39, 26],
    [-37, 14],
    [-38, -3],
    [-17, 41],
    [0, 43],
    [19, 43],
  ];
  for (const p of candidates) {
    const radius = 2.7;
    if (!clear(p, radius + 0.5)) continue;
    const fp = circle(p, 3.7, 3.5);
    if (!fp.every((q) => clear(q, 0.15))) continue;
    const bed = {
      name: `hall lawn ${beds.length}`,
      footprint: fp,
      heights: fp.map((q) => ground(q) + 0.045),
    };
    beds.push(bed);
    plants.push({
      id: `hall-tree-${plants.length}`,
      bed: bed.name,
      point: p,
      y: ground(p),
      height: 7.3 + (plants.length % 3) * 0.45,
      crownRadius: radius,
      type: p[1] < -20 ? "palm-single" : "layered-broadleaf",
    });
    for (let j = 0; j < 16; j++) {
      const a = (j * Math.PI) / 8,
        q = [p[0] + 2.75 * Math.cos(a), p[1] + 2.6 * Math.sin(a)];
      shrubs.push({
        bed: bed.name,
        point: q,
        y: ground(q) + 0.28,
        radius: 0.56,
      });
    }
  }
  // Join nearby planting into generous lawns rather than identical isolated tree pits.
  function hull(points) {
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
    return [...half(ps), ...half(ps.toReversed())];
  }
  const merged = [];
  for (const group of [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [9, 14, 13, 12],
    [10, 11],
  ]) {
    const members = group.map((i) => beds[i]).filter(Boolean);
    if (!members.length) continue;
    const fp = hull(members.flatMap((b) => b.footprint)),
      samples = [...fp];
    for (
      let x = Math.min(...fp.map((p) => p[0]));
      x < Math.max(...fp.map((p) => p[0]));
      x += 1.5
    )
      for (
        let z = Math.min(...fp.map((p) => p[1]));
        z < Math.max(...fp.map((p) => p[1]));
        z += 1.5
      )
        if (inside([x, z], fp)) samples.push([x, z]);
    if (samples.every((p) => clear(p, 0.2))) {
      const name = `hall connected lawn ${merged.length}`;
      for (const tree of plants)
        if (members.some((b) => b.name === tree.bed)) tree.bed = name;
      merged.push({
        name,
        footprint: fp,
        heights: fp.map((p) => ground(p) + 0.045),
      });
    } else merged.push(...members);
  }
  beds.splice(0, beds.length, ...merged);
  shrubs.length = 0;
  for (const bed of beds) {
    const fp = bed.footprint,
      center = fp.reduce(
        (sum, p) => sum.map((v, k) => v + p[k] / fp.length),
        [0, 0],
      );
    for (let i = 0; i < fp.length; i++) {
      const a = fp[i],
        b = fp[(i + 1) % fp.length],
        n = Math.max(1, Math.ceil(distance(a, b) / 1.2));
      for (let j = 0; j < n; j++) {
        const q = a.map(
          (v, k) => (v + ((b[k] - v) * j) / n) * 0.95 + center[k] * 0.05,
        );
        if (
          shrubs.some((s) => distance(s.point, q) < 0.9) ||
          plants.some((t) => distance(t.point, q) < 1.2)
        )
          continue;
        shrubs.push({
          bed: bed.name,
          point: q,
          y: ground(q) + 0.25,
          radius: 0.57,
        });
      }
    }
  }
  const paths = [],
    aprons = [];
  // Paving is fitted cell by cell so the fan does not paint over roads or other buildings.
  const safePaving = (p) => {
    const q = world(p);
    return (
      inside(q, geo.land) &&
      geo.clearRoad(q, 0.4) &&
      neighbors.every((fp) => !inside(q, fp)) &&
      !beds.some((b) => inside(p, b.footprint))
    );
  };
  const fan = (a, r) => [Math.cos(a) * r * 0.88, Math.sin(a) * r - 1];
  for (let ring = 0; ring < 4; ring++)
    for (let i = 0; i < 42; i++) {
      const a = Math.PI + (i * Math.PI) / 42,
        b = Math.PI + ((i + 1) * Math.PI) / 42,
        r = 31 + ring * 3.4;
      const fp = [fan(a, r), fan(b, r), fan(b, r + 3.4), fan(a, r + 3.4)];
      if (fp.every(safePaving))
        paths.push({
          footprint: fp,
          heights: fp.map((p) => ground(p) + 0.065),
          tone: ring % 2,
        });
    }
  // Narrow ground apron around all edges, including the side stair approaches.
  const outer = footprint.map((p) => {
    const r = Math.hypot(...p);
    return p.map((v) => (v * (r + 2)) / r);
  });
  aprons.push({
    inner: footprint,
    outer,
    innerHeights: footprint.map((p) => ground(p) + 0.07),
    outerHeights: outer.map((p) => ground(p) + 0.07),
  });
  const lights = [
    [-12, -37],
    [0, -37],
    [12, -37],
    [-26, -28],
    [25, -28],
  ]
    .filter((p) => safePaving(p))
    .map((p, i) => ({ point: p, y: ground(p), height: 3.0 + (i % 3) * 0.65 }));
  const design = {
    schema: 1,
    asset: "hall",
    name: "会堂",
    anchor,
    base,
    yaw,
    siteOffset: offset,
    localAxes:
      "X along rear facade / depth towards rear; rotated to east/south at campus anchor",
    buildingBase,
    height: 19.7,
    podiumHeight: 5.2,
    rearHeight: 10.4,
    footprint,
    hallOutline: ref.hallOutline,
    stairGround: [
      [-25.4, 9],
      [26, 9],
    ].map(ground),
    landscape: {
      beds,
      plants,
      shrubs,
      aprons,
      paths,
      lights,
      placement:
        "Photo-informed palms, staked broadleaf trees and hedges; exact counts/species/positions estimated; paving fan informed by design rendering",
    },
    sources: [
      {
        url: ref.source,
        images: ref.evidenceImages,
        role: "As-built site and floor plans, one built photograph, and separately identified design rendering",
      },
    ],
    evidence: {
      confirmed: [
        "19.70 m height on as-built survey",
        "Oval main hall with curved front podium and rectangular rear support wing",
        "Pale stone joints, recessed tall glazing, stepped window heads and deep portal in built photo",
        "Podium railing, palms, staked young trees and slim black light poles",
      ],
      estimated: [
        "Hand-traced outlines; 0.343 m control residual is not survey accuracy",
        "Podium/rear heights, window grid, portal dimensions, roof details and stairs",
        "Unobserved elevations and fan paving (design intent reference)",
        "Tree species/count/positions and schematic campus registration",
      ],
    },
    review: {
      eyebrow: "CAMPUS AUDITORIUM",
      heading: "椭圆会堂、深窗洞与石材平台",
      description:
        "浅米色石材分缝、阶梯状窗头与内凹入口，结合两侧楼梯、屋顶廊架和周边棕榈、乔木及低矮绿篱。",
    },
    views: {
      overall: { position: [82, 64, -105], target: [0, 7, 0], fov: 43 },
      front: { position: [18, 16, -88], target: [0, 10, -5], fov: 46 },
      entrance: { position: [-9, 10, -48], target: [0, 11, -26], fov: 58 },
      stairs: { position: [53, 13, 8], target: [25, 4, 18], fov: 52 },
      roof: { position: [20, 105, 25], target: [0, 5, 0], fov: 45 },
      landscape: { position: [-60, 12, -61], target: [-7, 8, -15], fov: 48 },
    },
  };
  await fs.writeFile(
    "authoring/hall/design.json",
    JSON.stringify(design, null, 2) + "\n",
  );
  console.log({
    anchor,
    offset,
    base,
    buildingBase,
    beds: beds.length,
    trees: plants.length,
    shrubs: shrubs.length,
    paving: paths.length,
  });
} finally {
  await server.close();
}
