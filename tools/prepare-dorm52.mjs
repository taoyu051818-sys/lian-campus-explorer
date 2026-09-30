// A photo-informed site model; plan dimensions and A52 correspondence remain estimates.
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
  const { drapePolygon } = await server.ssrLoadModule("/src/terrain-drape.ts");
  const data = await read("public/overall/data.json"),
    plans = await read("public/refined-plans.json");
  const geo = geometry(data, await read("public/campus.json"));
  refine(geo, data, plans);
  await fs.mkdir("authoring/dorm52", { recursive: true });
  let grading;
  try {
    grading = await read("authoring/dorm52/terrain-grading.json");
  } catch {
    const old = geo.buildings.filter((b) => b.placeId === "dorm52");
    const anchor = old[0].footprint[0].map(
      (v, k) => v - plans.dorm52.blocks[0].footprint[0][k],
    );
    const level = Math.min(
      ...old.flatMap((b) => b.footprint.map((p) => geo.legacyHeight(...p))),
    );
    grading = {
      asset: "dorm52",
      anchor,
      level,
      footprints: old.map((b) => b.footprint),
      note: "Preserve the v0.39 candidate platform while replacing its procedural volumes. These are game-world grading constraints, not measured elevations or parcel boundaries.",
    };
    await fs.writeFile(
      "authoring/dorm52/terrain-grading.json",
      JSON.stringify(grading, null, 2) + "\n",
    );
  }
  const anchor = grading.anchor,
    yaw = (-32 * Math.PI) / 180,
    c = Math.cos(yaw),
    s = Math.sin(yaw);
  const world = ([x, z]) => [
    anchor[0] + c * x + s * z,
    anchor[1] - s * x + c * z,
  ];
  const local = ([x, z]) => [
    c * (x - anchor[0]) - s * (z - anchor[1]),
    s * (x - anchor[0]) + c * (z - anchor[1]),
  ];
  const base = grading.level + 0.12,
    ground = (p) => geo.height(...world(p)) - base;
  const rect = (x, z, w, d) => [
    [x - w / 2, z - d / 2],
    [x + w / 2, z - d / 2],
    [x + w / 2, z + d / 2],
    [x - w / 2, z + d / 2],
  ];
  const circle = (x, z, r, n = 32) =>
    Array.from({ length: n }, (_, i) => [
      x + r * Math.cos((i * Math.PI * 2) / n),
      z + r * Math.sin((i * Math.PI * 2) / n),
    ]);
  const courts = [
    [-42, -43],
    [42, -43],
    [-42, 43],
    [42, 43],
  ].map(([x, z], i) => ({
    id: `court-${i + 1}`,
    center: [x, z],
    color: ["cyan", "rose", "lime", "cyan"][i],
  }));
  const wings = [];
  for (const court of courts) {
    const [x, z] = court.center,
      sx = Math.sign(x);
    for (const [j, [u, v, w, d, face]] of [
      [x, z - 25, 58, 10, "north"],
      [x, z + 25, 58, 10, "south"],
      [x + sx * 24, z, 10, 40, sx > 0 ? "east" : "west"],
      [x - sx * 24, z - 12, 10, 16, sx > 0 ? "west" : "east"],
      [x - sx * 24, z + 12, 10, 16, sx > 0 ? "west" : "east"],
    ].entries())
      wings.push({
        id: `${court.id}-wing-${j + 1}`,
        court: court.id,
        center: [u, v],
        width: w,
        depth: d,
        footprint: rect(u, v, w, d),
        outward: face,
        color: court.color,
      });
  }
  const others = geo.buildings
    .filter((b) => b.placeId !== "dorm52")
    .map((b) => b.footprint);
  const safe = (p, r = 0) => {
    const q = world(p);
    return (
      inside(q, geo.land) &&
      geo.clearRoad(q, r + 0.8) &&
      others.every(
        (fp) =>
          !inside(q, fp) &&
          fp.every(
            (a, i) =>
              distance(q, closest(q, a, fp[(i + 1) % fp.length])) > r + 0.7,
          ),
      ) &&
      geo.spawns.every((sp) => distance(q, sp.point) > r + 2)
    );
  };
  const cone = {
    center: [-7.7, 7.7],
    radius: 4.8,
    topCenter: [-6.3, 7.7],
    topRadius: 2.4,
    height: 13.4,
  };
  const open = (p, r) =>
    wings.every(
      (b) =>
        !inside(p, b.footprint) &&
        b.footprint.every(
          (a, i) =>
            distance(p, closest(p, a, b.footprint[(i + 1) % 4])) > r + 0.6,
        ),
    ) &&
    Math.abs(p[0]) > r + 2.4 &&
    Math.abs(p[1]) > r + 2.4 &&
    Math.abs(Math.hypot(...p) - 19.5) > r + 3 &&
    distance(p, cone.center) > cone.radius + r + 0.7;
  const paths = [],
    beds = [],
    plants = [],
    shrubs = [],
    aprons = [];
  // All paving triangles use the final campus terrain triangulation, including inside courts.
  const mesh = (fp, offset) => {
    const m = drapePolygon(fp.map(world), geo.height, offset);
    for (let i = 0; i < m.position.length; i += 3) {
      const p = local([m.position[i], m.position[i + 2]]);
      m.position[i] = p[0];
      m.position[i + 1] -= base;
      m.position[i + 2] = p[1];
    }
    return m;
  };
  const addPath = (name, fp, tone = 0) => {
    if (fp.every((p) => safe(p)))
      paths.push({ name, footprint: fp, tone, ...mesh(fp, 0.065) });
  };
  addPath("central north south promenade", rect(0, 0, 5, 174));
  addPath("central east west promenade", rect(0, 0, 168, 5));
  for (const court of courts) {
    const [x, z] = court.center;
    addPath(court.id + " courtyard paving", rect(x, z, 35, 39));
    addPath(court.id + " entrance passage", rect(x / 2, z, Math.abs(x), 5));
    for (const [dx, dz] of [
      [-9, -10],
      [9, -10],
      [-9, 10],
      [9, 10],
    ]) {
      const p = [x + dx, z + dz],
        r = 3.7;
      if (!safe(p, r) || !open(p, r)) continue;
      const fp = circle(...p, r, 24);
      beds.push({
        name: "planted island " + beds.length,
        footprint: fp,
        heights: fp.map((q) => ground(q) + 0.13),
        ...mesh(fp, 0.13),
      });
      plants.push({
        id: "dorm52-tree-" + plants.length,
        point: p,
        y: ground(p),
        height: 6.9 + (plants.length % 4) * 0.6,
        crownRadius: 3.2,
        type: "layered-broadleaf",
      });
    }
  }
  for (const [x, z] of [
    [-78, -60],
    [-78, -40],
    [-78, -20],
    [-78, 20],
    [-78, 40],
    [-78, 60],
    [78, -60],
    [78, -40],
    [78, -20],
    [78, 20],
    [78, 40],
    [78, 60],
    [-60, -81],
    [-40, -81],
    [-20, -81],
    [20, -81],
    [40, -81],
    [60, -81],
    [-60, 81],
    [-40, 81],
    [-20, 81],
    [20, 81],
    [40, 81],
    [60, 81],
    [-8, -8],
    [8, -8],
    [8, 8],
  ]) {
    const p = [x, z],
      r = 3.25;
    if (!safe(p, r) || !open(p, r)) continue;
    const fp = circle(x, z, r, 24);
    beds.push({
      name: "perimeter planted island " + beds.length,
      footprint: fp,
      heights: fp.map((q) => ground(q) + 0.13),
      ...mesh(fp, 0.13),
    });
    plants.push({
      id: "dorm52-tree-" + plants.length,
      point: p,
      y: ground(p),
      height: 7.6 + (plants.length % 3) * 0.6,
      crownRadius: 2.9,
      type: plants.length % 3 === 0 ? "palm-single" : "layered-broadleaf",
    });
  }
  for (const bed of beds) {
    const center = bed.footprint.reduce(
      (a, p) => a.map((v, k) => v + p[k] / bed.footprint.length),
      [0, 0],
    );
    for (let j = 0; j < 10; j++) {
      const a = (j * Math.PI) / 5,
        p = [center[0] + 2.5 * Math.cos(a), center[1] + 2.5 * Math.sin(a)];
      shrubs.push({ point: p, y: ground(p) + 0.44, radius: 0.53 });
    }
  }
  // Small perimeter aprons are split into independent strips, leaving the main road untouched.
  for (const b of wings)
    for (let i = 0; i < 4; i++) {
      const a = b.footprint[i],
        q = b.footprint[(i + 1) % 4],
        len = distance(a, q),
        n = [(q[1] - a[1]) / len, -(q[0] - a[0]) / len];
      const fp = [
        a,
        q,
        q.map((v, k) => v + n[k] * 1.4),
        a.map((v, k) => v + n[k] * 1.4),
      ];
      addPath(b.id + " apron " + i, fp);
    }
  // Remove coplanar overlap where the two promenades and courtyard aprons meet.
  // Each convex clip emits disjoint outside pieces; only its inside remainder
  // continues to the next edge. This keeps visible paving a single surface.
  const signedArea = (ps) =>
    ps.reduce((v, p, i) => {
      const q = ps[(i + 1) % ps.length];
      return v + p[0] * q[1] - q[0] * p[1];
    }, 0) / 2;
  const positive = (ps) => (signedArea(ps) < 0 ? [...ps].reverse() : ps);
  const cross = (a, b, p) =>
    (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  function clipSide(poly, a, b, sign) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i],
        q = poly[(i + 1) % poly.length],
        d = cross(a, b, p) * sign,
        e = cross(a, b, q) * sign;
      if (d >= -1e-8) out.push(p);
      if (d >= 0 !== e >= 0) {
        const t = d / (d - e);
        out.push(p.map((v, k) => v + (q[k] - v) * t));
      }
    }
    return out;
  }
  const overlap = (a, b) =>
    [0, 1].every(
      (k) =>
        Math.max(...a.map((p) => p[k])) >
          Math.min(...b.map((p) => p[k])) + 1e-7 &&
        Math.max(...b.map((p) => p[k])) >
          Math.min(...a.map((p) => p[k])) + 1e-7,
    );
  function subtract(poly, clip) {
    if (!overlap(poly, clip)) return [poly];
    let inside = poly;
    const outside = [];
    for (let i = 0; i < clip.length && inside.length >= 3; i++) {
      const a = clip[i],
        b = clip[(i + 1) % clip.length],
        p = clipSide(inside, a, b, -1);
      if (p.length >= 3 && Math.abs(signedArea(p)) > 1e-6)
        outside.push(positive(p));
      inside = clipSide(inside, a, b, 1);
    }
    return outside;
  }
  const previous = [];
  for (const path of paths) {
    let pieces = [positive(path.footprint)];
    for (const prior of previous)
      pieces = pieces.flatMap((p) => subtract(p, prior));
    path.position = [];
    path.index = [];
    for (const piece of pieces) {
      const draped = mesh(piece, 0.065),
        start = path.position.length / 3;
      path.position.push(...draped.position);
      path.index.push(...draped.index.map((i) => i + start));
    }
    previous.push(positive(path.footprint));
  }
  const terrain = mesh(rect(0, 0, 500, 500), 0);
  // Three.js is right-handed: its X/Z ground triangles need the opposite winding.
  for (let i = 0; i < terrain.index.length; i += 3)
    [terrain.index[i + 1], terrain.index[i + 2]] = [
      terrain.index[i + 2],
      terrain.index[i + 1],
    ];
  const views = {
    overall: { position: [-158, 148, -220], target: [0, 6, 0], fov: 49 },
    front: { position: [-118, 36, -137], target: [-28, 9, -33], fov: 48 },
    entrance: { position: [0, 6, -91], target: [0, 6, 4], fov: 55 },
    roof: { position: [0, 260, -0.1], target: [0, 0, 0], fov: 49 },
    rear: { position: [140, 68, 185], target: [0, 7, 0], fov: 49 },
    landscape: { position: [-39, 6, -29], target: [-53, 7, -50], fov: 61 },
    shared: { position: [0, 3, -12], target: [-5.5, 6.5, 7.7], fov: 70 },
  };
  const d = {
    schema: 1,
    asset: "dorm52",
    name: "学生生活二区",
    anchor,
    base,
    fixedTerrainBase: base,
    yaw,
    groundFloor: 0.16,
    floorHeight: 3.6,
    floors: 6,
    courts,
    wings,
    shared: { outerRadius: 22, innerRadius: 17, floors: 3, floorHeight: 3.6 },
    cone,
    height: 22.6,
    landscape: {
      beds,
      plants,
      shrubs,
      paths,
      aprons,
      terrain,
      placement:
        "Photo-informed lawns and palms. Species, count and positions estimated; terrain and road clearance are checked.",
    },
    sources: [
      {
        url: "https://www.720yun.com/vr/5dejtgefzu6",
        scenes: [27335352, 27335712],
        role: "Ground entrance and aerial panorama inspected 2026-09-30",
      },
      {
        url: "https://www.study-hn.cn/NewsDetail/e4bc9a4e58b741a9bfb0a0e942ed8f4c/MjAyNC0wNi0xNw==/1?nav=%5B%5D",
        role: "Official six-storey dormitory close photographs cached in public/reference-data/living-two",
      },
      {
        url: "https://www.study-hn.cn/NewsDetail/f6f67cd625de4c89807c2b4b304fd739/MjAyNC0wNi0xNw==/1?nav=%5B%5D",
        role: "Official three-level gallery and tapered glass pavilion photographs",
      },
    ],
    evidence: {
      confirmed: [
        "Four courtyard groups surround a lower shared ring visible in aerial panorama",
        "Six-storey white balcony grids, brown louvers, coloured two-storey frames, brick stair cores",
        "Three gallery levels and an off-centre tapered glass pavilion",
        "Trees, hedges, courtyard paving and perimeter palms",
      ],
      estimated: [
        "Building dimensions, bay counts, exact colours on hidden elevations and 3.6m floor heights",
        "A52 cadastral correspondence and yaw remain candidate registration",
        "Grading preserves v0.39 simulation levels, not measured elevations",
        "Tour text states five dormitory buildings and one canteen; courtyard groups are not interpreted as official building numbers",
        "Separate life-two canteen and unobserved interiors are not reconstructed in this asset",
      ],
    },
    review: {
      eyebrow: "LIAN STUDENT LIVING TWO",
      heading: "六层庭院、共享环廊与玻璃锥体",
      description:
        "按航拍与近景细化白色阳台、彩色框、红砖楼梯墙和三层共享外廊，补齐院落树荫、花池及连续步道。",
      evidenceText:
        "建筑细节参考管理局照片和园区全景；四组庭院是几何分组，不是楼号。具体尺寸、A52对应和场地标高仍含估算。",
      groundHeight: -0.2,
      exposure: 0.8,
      environmentIntensity: 0.65,
      groundColor: "#829174",
    },
    views,
  };
  for (const b of wings)
    if (!b.footprint.every((p) => safe(p)))
      throw Error("Building road/neighbor clash " + b.id);
  await fs.writeFile(
    "authoring/dorm52/design.json",
    JSON.stringify(d, null, 2) + "\n",
  );
  console.log({
    anchor,
    base,
    courts: courts.length,
    wings: wings.length,
    trees: plants.length,
    paths: paths.length,
    groundRange: [
      Math.min(...wings.flatMap((b) => b.footprint.map(ground))),
      Math.max(...wings.flatMap((b) => b.footprint.map(ground))),
    ],
  });
} finally {
  await server.close();
}
