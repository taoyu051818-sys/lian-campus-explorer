// Preserve the current graded platform while replacing plan masses with a Blender asset.
import fs from "node:fs/promises";
import { createServer } from "vite";
const read = async (p) => JSON.parse(await fs.readFile(p, "utf8"));
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
try {
  const { geometry, inside, closest, distance } = await server.ssrLoadModule(
    "/src/world-geometry.ts",
  );
  const { refine } = await server.ssrLoadModule("/src/refinement.ts");
  const { drapePolygon } = await server.ssrLoadModule("/src/terrain-drape.ts");
  const data = await read("public/overall/data.json"),
    plans = await read("public/refined-plans.json");
  const geo = geometry(data, await read("public/campus.json"));
  refine(geo, data, plans);
  await fs.mkdir("authoring/dorm56", { recursive: true });
  let grading;
  try {
    grading = await read("authoring/dorm56/terrain-grading.json");
  } catch {
    const old = geo.buildings.filter((b) => b.placeId === "dorm56");
    const anchor = old[0].footprint[0].map(
      (v, k) => v - plans.dorm56.blocks[0].footprint[0][k],
    );
    const level = Math.min(
      ...old.flatMap((b) => b.footprint.map((p) => geo.legacyHeight(...p))),
    );
    grading = {
      asset: "dorm56",
      anchor,
      level,
      footprints: old.map((b) => b.footprint),
      walkways: geo.walkways.filter((p) => p.placeId === "dorm56"),
      note: "Preserves the v0.40 terrain platform, not surveyed elevations. Keep independent of authored collision subdivisions.",
    };
    await fs.writeFile(
      "authoring/dorm56/terrain-grading.json",
      JSON.stringify(grading, null, 2) + "\n",
    );
  }
  const anchor = grading.anchor,
    yaw = -Math.PI / 4,
    c = Math.cos(yaw),
    s = Math.sin(yaw),
    base = grading.level + 0.12;
  const world = ([x, z]) => [
    anchor[0] + c * x + s * z,
    anchor[1] - s * x + c * z,
  ];
  const local = ([x, z]) => [
    c * (x - anchor[0]) - s * (z - anchor[1]),
    s * (x - anchor[0]) + c * (z - anchor[1]),
  ];
  const unrotate = (p) => [c * p[0] - s * p[1], s * p[0] + c * p[1]];
  const scale = plans.dorm56.calibration.metresPerPixel;
  const px = ([x, y]) => [(x - 650) * scale, (555 - y) * scale];
  const rect = (x, z, w, d) => [
    [x - w / 2, z - d / 2],
    [x + w / 2, z - d / 2],
    [x + w / 2, z + d / 2],
    [x - w / 2, z + d / 2],
  ];
  const boxPx = (x1, y1, x2, y2) =>
    rect(
      ((x1 + x2 - 1300) * scale) / 2,
      ((1110 - y1 - y2) * scale) / 2,
      (x2 - x1) * scale,
      (y2 - y1) * scale,
    );
  const blocks = plans.dorm56.blocks.map((b) => ({
    ...b,
    number: Number(b.name.match(/(\d+)号楼/)[1]),
    footprint: b.footprint
      .map(unrotate)
      .map((p) => p.map((v) => Math.round(v * 1e6) / 1e6)),
  }));
  const bridgePixels = [
    [
      [360, 255],
      [462, 255],
    ],
    [
      [594, 255],
      [728, 255],
    ],
    [
      [786, 255],
      [908, 255],
    ],
    [
      [360, 628],
      [500, 628],
    ],
    [
      [552, 628],
      [665, 628],
    ],
    [
      [785, 628],
      [928, 628],
    ],
    [
      [325, 337],
      [325, 428],
    ],
    [
      [755, 337],
      [755, 428],
    ],
    [
      [320, 480],
      [320, 566],
    ],
    [
      [750, 480],
      [750, 565],
    ],
  ];
  const bridges = bridgePixels.map(([a, b], i) => ({
    id: "glass-link-" + (i + 1),
    a: px(a),
    b: px(b),
    width: 3.5,
    base: 7.6,
    roof: 11.0,
  }));
  const ground = (p) => geo.height(...world(p)) - base;
  const others = geo.buildings.filter((b) => b.placeId !== "dorm56");
  const clearance = (p, fp, r) =>
    !inside(p, fp) &&
    fp.every((a, i) => distance(p, closest(p, a, fp[(i + 1) % fp.length])) > r);
  const safe = (p, r = 0) => {
    const q = world(p);
    return (
      inside(q, geo.land) &&
      geo.clearRoad(q, r + 0.6) &&
      others.every((b) => clearance(q, b.footprint, r + 0.6)) &&
      geo.spawns.every((sp) => distance(q, sp.point) > r + 1.5)
    );
  };
  const open = (p, r) =>
    safe(p, r) && blocks.every((b) => clearance(p, b.footprint, r + 1));
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
  const paths = [],
    beds = [],
    plants = [],
    shrubs = [];
  const addPath = (name, fp, tone = 0) => {
    if (fp.every((p) => safe(p)))
      paths.push({ name, footprint: fp, tone, ...mesh(fp, 0.065) });
  };
  // Broad pedestrian spines are visible in the tour. Existing routed paths retain road connections.
  for (const [name, box] of [
    ["east promenade", [817, 151, 859, 743]],
    ["west promenade", [403, 151, 445, 743]],
    ["middle crosswalk", [196, 389, 1070, 412]],
    ["south crosswalk", [203, 742, 1050, 766]],
  ])
    addPath(name, boxPx(...box));
  const walkRoutes = grading.walkways.map((p) => ({
    name: p.name,
    points: p.points.map(local),
  }));
  for (const r of walkRoutes)
    for (let i = 0; i < r.points.length - 1; i++) {
      const a = r.points[i],
        b = r.points[i + 1],
        l = distance(a, b),
        n = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
      addPath(r.name + " " + i, [
        a.map((v, k) => v - n[k] * 1.5),
        b.map((v, k) => v - n[k] * 1.5),
        b.map((v, k) => v + n[k] * 1.5),
        a.map((v, k) => v + n[k] * 1.5),
      ]);
    }
  // Ground undercroft surfaces drape to the same height field; they never float at an arbitrary slab base.
  for (const b of blocks) {
    const xs = b.footprint.map((p) => p[0]),
      zs = b.footprint.map((p) => p[1]);
    addPath(
      b.name + " apron",
      rect(
        (Math.min(...xs) + Math.max(...xs)) / 2,
        (Math.min(...zs) + Math.max(...zs)) / 2,
        Math.max(...xs) - Math.min(...xs) + 2,
        Math.max(...zs) - Math.min(...zs) + 2,
      ),
    );
  }
  const circles = (p, r, n = 16) =>
    Array.from({ length: n }, (_, i) => [
      p[0] + r * Math.cos((i * 2 * Math.PI) / n),
      p[1] + r * Math.sin((i * 2 * Math.PI) / n),
    ]);
  const routeClear = (p, r) =>
    walkRoutes.every((w) =>
      w.points
        .slice(1)
        .every((q, i) => distance(p, closest(p, w.points[i], q)) > r + 2.2),
    );
  const spineClear = (p, r) =>
    paths
      .filter((x) => /promenade|crosswalk/.test(x.name))
      .every((b) => clearance(p, b.footprint, r + 0.5));
  for (let y = 180; y <= 825; y += 49)
    for (let x = 198; x <= 1080; x += 51) {
      const p = px([x, y]),
        r = 2.5;
      if (
        !open(p, r) ||
        !routeClear(p, r) ||
        !spineClear(p, r) ||
        bridges.some((b) => distance(p, closest(p, b.a, b.b)) < r + 2.1)
      )
        continue;
      const fp = circles(p, 2.7);
      if (!fp.every((q) => safe(q))) continue;
      beds.push({
        name: "planted island " + beds.length,
        footprint: fp,
        heights: fp.map((q) => ground(q) + 0.13),
        ...mesh(fp, 0.13),
      });
      plants.push({
        id: "dorm56-tree-" + plants.length,
        point: p,
        y: ground(p),
        height: 6.2 + (plants.length % 5) * 0.45,
        crownRadius: r,
        type: plants.length % 3 === 0 ? "palm-single" : "layered-broadleaf",
      });
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4,
          q = [p[0] + 1.8 * Math.cos(a), p[1] + 1.8 * Math.sin(a)];
        shrubs.push({ point: q, y: ground(q) + 0.36, radius: 0.54 });
      }
    }
  // Avoid coplanar overlaps in paths using sequential convex clipping.
  const area = (ps) =>
    ps.reduce((v, p, i) => {
      const q = ps[(i + 1) % ps.length];
      return v + p[0] * q[1] - q[0] * p[1];
    }, 0) / 2;
  const positive = (ps) => (area(ps) < 0 ? [...ps].reverse() : ps);
  const cross = (a, b, p) =>
    (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const clip = (poly, a, b, sign) => {
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
  };
  const subtract = (poly, cut) => {
    if (
      ![0, 1].every(
        (k) =>
          Math.max(...poly.map((p) => p[k])) >
            Math.min(...cut.map((p) => p[k])) + 1e-7 &&
          Math.max(...cut.map((p) => p[k])) >
            Math.min(...poly.map((p) => p[k])) + 1e-7,
      )
    )
      return [poly];
    let remaining = poly;
    const out = [];
    for (let i = 0; i < cut.length && remaining.length >= 3; i++) {
      const a = cut[i],
        b = cut[(i + 1) % cut.length],
        p = clip(remaining, a, b, -1);
      if (p.length >= 3 && Math.abs(area(p)) > 1e-6) out.push(positive(p));
      remaining = clip(remaining, a, b, 1);
    }
    return out;
  };
  const previous = [];
  for (const p of paths) {
    let pieces = [positive(p.footprint)];
    for (const prior of previous)
      pieces = pieces.flatMap((q) => subtract(q, prior));
    p.position = [];
    p.index = [];
    for (const piece of pieces) {
      const m = mesh(piece, 0.065),
        start = p.position.length / 3;
      p.position.push(...m.position);
      p.index.push(...m.index.map((i) => i + start));
    }
    previous.push(positive(p.footprint));
  }
  // Courtyard lawns fill the unpaved spaces while leaving every routed access strip open.
  const lawnCandidates = [
    boxPx(196, 145, 1085, 744),
    boxPx(425, 790, 600, 864),
  ];
  const exclusions = [...previous, ...beds.map((b) => positive(b.footprint))];
  for (const lawn of lawnCandidates) {
    let pieces = [positive(lawn)];
    for (const cut of exclusions)
      pieces = pieces.flatMap((p) => subtract(p, cut));
    for (const fp of pieces) {
      if (Math.abs(area(fp)) < 1 || !fp.every((p) => safe(p))) continue;
      beds.push({
        name: "courtyard lawn " + beds.length,
        footprint: fp,
        heights: fp.map((p) => ground(p) + 0.13),
        ...mesh(fp, 0.13),
      });
    }
  }
  const terrain = mesh(rect(0, 0, 560, 560), 0);
  for (let i = 0; i < terrain.index.length; i += 3)
    [terrain.index[i + 1], terrain.index[i + 2]] = [
      terrain.index[i + 2],
      terrain.index[i + 1],
    ];
  const d = {
    schema: 1,
    asset: "dorm56",
    name: "学生生活一区",
    anchor,
    base,
    fixedTerrainBase: base,
    yaw,
    blocks,
    bridges,
    groundFloor: 0.12,
    firstFloorHeight: 4.2,
    floorHeight: 3.4,
    height: 39,
    walkRoutes,
    landscape: {
      paths,
      beds,
      plants,
      shrubs,
      aprons: [],
      terrain,
      placement:
        "Photo-informed tree islands and palms, estimated counts and species. Clearance and surface heights checked.",
    },
    sources: [
      {
        url: "https://wap.study-hn.cn/upload/file/2025/08/04/25debde2816b4d37a9c0f72000a7847c.docx",
        role: "Official planning verification: planning roof plan image1, as-built parcel image2, photos of buildings1–11 images13–23; rendered17pages and inspected.",
      },
      {
        url: "https://www.720yun.com/vr/5dejtgefzu6",
        scenes: [27335351, 27335712],
        role: "Student living one ground view and living-area aerial, four directions each, inspected2026-09-30",
      },
    ],
    evidence: {
      confirmed: [
        "Ten stepped dormitory buildings and a three-storey brick service building",
        "White projecting floor bands, recessed grey tile walls and blue window/door bays",
        "Elevated glazed links across landscaped courts and open ground-floor colonnades",
        "Roof terraces, collectors, palms, lawns and planted pedestrian streets",
      ],
      estimated: [
        "Silhouettes and floor steps from planning roof plan; small as-built plan does not resolve every terrace",
        "Metres/pixel from as-built parcel area54477.7m² and planning outline; heights and bay spacing estimated",
        "A56 registration is inferred by parcel area/road context, not surveyed coordinates",
        "Bridge network positions and levels inferred from aerial/ground views; hidden links may differ",
        "Terrain preserves v0.40 simulation platform, not survey elevation; planting positions/species approximate",
        "External reconstruction only; rooms, stairs and lift interiors are not reconstructed",
      ],
    },
    review: {
      eyebrow: "LIAN STUDENT LIVING ONE",
      heading: "退台宿舍、架空连廊与院落绿化",
      description:
        "按官方图纸与实拍细化1—11号楼，保留阶梯轮廓、灰白立面和红砖配套楼，补齐玻璃连廊、屋顶花园与连续步道。",
      evidenceText:
        "轮廓以报建屋顶图为依据，实建照片校核外观；具体层高、连廊位置、A56配准及绿化仍含估算。",
      groundHeight: -0.2,
      exposure: 0.8,
      environmentIntensity: 0.65,
      groundColor: "#829174",
    },
    views: {
      overall: { position: [-205, 175, -220], target: [0, 8, 0], fov: 49 },
      front: { position: [-155, 44, -160], target: [-30, 12, -10], fov: 50 },
      entrance: { position: [-62, 5, -72], target: [-62, 7, 26], fov: 65 },
      roof: { position: [0, 335, -0.1], target: [0, 0, 0], fov: 49 },
      rear: { position: [200, 85, 160], target: [0, 9, 0], fov: 49 },
      landscape: { position: [-62, 4, 12], target: [-65, 8, 62], fov: 64 },
      shared: { position: [53, 3, -42], target: [53, 8, -17], fov: 64 },
    },
  };
  await fs.writeFile(
    "authoring/dorm56/design.json",
    JSON.stringify(d, null, 2) + "\n",
  );
  console.log({
    anchor,
    base,
    blocks: blocks.length,
    bridges: bridges.length,
    trees: plants.length,
    paths: paths.length,
  });
} finally {
  await server.close();
}
