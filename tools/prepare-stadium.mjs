// Metre-scale, photo-informed stadium registration and terrain-aware planting.
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
    geo = geometry(data, await read("public/campus.json"));
  refine(geo, data, await read("public/refined-plans.json"));
  const anchor = toWorld(data.places.find((p) => p.id === "stadium").point),
    yaw = -1.1,
    c = Math.cos(yaw),
    s = Math.sin(yaw),
    base = geo.height(...anchor) + 0.12;
  const world = ([x, z]) => [
    anchor[0] + c * x + s * z,
    anchor[1] - s * x + c * z,
  ];
  const local = ([x, z]) => [
    c * (x - anchor[0]) - s * (z - anchor[1]),
    s * (x - anchor[0]) + c * (z - anchor[1]),
  ];
  const ground = (p) => geo.height(...world(p)) - base;
  const others = geo.buildings.filter((b) => b.placeId !== "stadium");
  const edge = (p, fp) =>
    Math.min(
      ...fp.map((a, i) => distance(p, closest(p, a, fp[(i + 1) % fp.length]))),
    );
  const safe = (p, pad = 0) => {
    const q = world(p);
    return (
      inside(q, geo.land) &&
      geo.clearRoad(q, pad + 0.7) &&
      others.every(
        (b) => !inside(q, b.footprint) && edge(q, b.footprint) > pad + 0.7,
      )
    );
  };
  const halfStraight = 42.2,
    innerRadius = 36.5,
    laneWidth = 1.22,
    lanes = 8,
    standRadius = 49;
  const capsule = (r, n = 96) =>
    Array.from({ length: n }, (_, i) => {
      const t = (i / n) * Math.PI * 2;
      return [
        (Math.cos(t) >= 0 ? halfStraight : -halfStraight) + r * Math.cos(t),
        r * Math.sin(t),
      ];
    });
  const capsuleDistance = (p) =>
    Math.hypot(Math.max(0, Math.abs(p[0]) - halfStraight), p[1]);
  // The sea-facing long edge stays open; library lies beyond local +X.
  const fieldHeight =
    Math.max(...capsule(47).map(ground), ground([0, 0])) + 0.055;
  const land = {
    beds: [],
    plants: [],
    shrubs: [],
    paths: [],
    aprons: [{ outer: capsule(76) }],
    lights: [],
  };
  const campusPaths = geo.walkways
    .flatMap((p) =>
      p.points.slice(1).map((b, i) => ({ a: p.points[i], b, width: p.width })),
    )
    .concat(
      geo.spawns.map((p) => ({
        a: p.point,
        b: geo.nearestRoad(p.point).point,
        width: 3,
      })),
    );
  const clear = (p, pad) =>
    safe(p, pad) &&
    capsuleDistance(p) > 79 + pad &&
    Math.hypot(
      Math.max(0, Math.abs(p[0] + 112) - 5.5),
      Math.max(0, Math.abs(p[1]) - 40),
    ) >
      pad + 1 &&
    geo.spawns.every((v) => distance(world(p), v.point) > 4 + pad) &&
    campusPaths.every(
      (r) =>
        distance(world(p), closest(world(p), r.a, r.b)) >
        r.width / 2 + pad + 0.6,
    );
  // Long narrow planting islands; tree crowns and lawns are checked against circulation.
  for (let i = 0; i < 72; i++) {
    const t = (i / 72) * Math.PI * 2,
      r = 87 + (i % 3) * 4,
      p = [
        (Math.cos(t) >= 0 ? halfStraight : -halfStraight) + r * Math.cos(t),
        r * Math.sin(t),
      ];
    const palm = p[1] > 20,
      radius = palm ? 2.8 : 3.6;
    if (
      !clear(p, radius + 1) ||
      land.plants.some((v) => distance(v.point, p) < 9)
    )
      continue;
    const tangent = [-Math.sin(t), Math.cos(t)],
      normal = [Math.cos(t), Math.sin(t)];
    const fp = Array.from({ length: 32 }, (_, j) => {
      const a = (j / 32) * Math.PI * 2;
      return p.map(
        (v, k) =>
          v + tangent[k] * 4.3 * Math.cos(a) + normal[k] * 3.8 * Math.sin(a),
      );
    });
    if (!fp.every((q) => clear(q, 0.3))) continue;
    const name = `stadium planted island ${land.beds.length}`;
    land.beds.push({
      name,
      footprint: fp,
      heights: fp.map((q) => ground(q) + 0.065),
    });
    land.plants.push({
      id: `stadium-tree-${land.plants.length}`,
      bed: name,
      point: p,
      y: ground(p),
      height: palm ? 8.2 + (i % 4) * 0.7 : 7.4 + (i % 4) * 0.55,
      crownRadius: radius,
      type: palm ? "palm-single" : "layered-broadleaf",
    });
    for (let j = 0; j < 12; j++) {
      const a = (j / 12) * Math.PI * 2,
        q = p.map(
          (v, k) =>
            v + tangent[k] * 3.25 * Math.cos(a) + normal[k] * 2.7 * Math.sin(a),
        );
      land.shrubs.push({ point: q, y: ground(q) + 0.38, radius: 0.6 });
    }
  }
  // Ground buffer at 20 m grid intersections matches the rendered campus terrain exactly.
  const position = [],
    index = [];
  const gridCentre = world([0, 0]).map((v) => Math.floor((v + 1900) / 20));
  for (let j = -12; j <= 12; j++)
    for (let i = -12; i <= 12; i++) {
      const q = [
          -1900 + (gridCentre[0] + i) * 20,
          -1900 + (gridCentre[1] + j) * 20,
        ],
        p = local(q);
      position.push(p[0], geo.height(...q) - base, p[1]);
    }
  for (let j = 0; j < 24; j++)
    for (let i = 0; i < 24; i++) {
      const a = j * 25 + i,
        b = a + 1,
        d = a + 25,
        e = d + 1;
      index.push(a, d, b, b, d, e);
    }
  land.terrain = { position, index };
  // Perimeter pavement strips follow ground; seating deck at r=71.5 joins smoothly.
  const inner = capsule(71.5, 192),
    outer = capsule(76, 192);
  land.aprons[0] = {
    inner,
    outer,
    innerHeights: inner.map((p) => Math.max(fieldHeight, ground(p) + 0.15)),
    outerHeights: outer.map((p) => ground(p) + 0.155),
  };
  // Clip each annular paving panel against the actual world-grid triangles.
  // Long straight edges must never bridge the campus terrain as one planar quad.
  const cross = (a, b, p) =>
    (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const clip = (subject, tri) => {
    let ps = subject;
    for (let k = 0; k < 3 && ps.length; k++) {
      const a = tri[k],
        b = tri[(k + 1) % 3],
        out = [];
      for (let j = 0; j < ps.length; j++) {
        const p = ps[j],
          q = ps[(j + 1) % ps.length],
          dp = cross(a, b, p),
          dq = cross(a, b, q);
        if (dp >= -1e-8) out.push(p);
        if (dp >= 0 !== dq >= 0) {
          const t = dp / (dp - dq);
          out.push(p.map((v, n) => v + (q[n] - v) * t));
        }
      }
      ps = out;
    }
    return ps.filter((p, i) => distance(p, ps[(i + 1) % ps.length]) > 1e-7);
  };
  for (let i = 0; i < inner.length; i++) {
    const j = (i + 1) % inner.length,
      poly = [inner[i], inner[j], outer[j], outer[i]].map(world);
    const xmin = Math.floor(Math.min(...poly.map((p) => p[0])) / 20) * 20,
      xmax = Math.max(...poly.map((p) => p[0]));
    const zmin = Math.floor(Math.min(...poly.map((p) => p[1])) / 20) * 20,
      zmax = Math.max(...poly.map((p) => p[1]));
    for (let x = xmin; x <= xmax; x += 20)
      for (let z = zmin; z <= zmax; z += 20) {
        for (const tri of [
          [
            [x, z],
            [x + 20, z],
            [x, z + 20],
          ],
          [
            [x + 20, z],
            [x + 20, z + 20],
            [x, z + 20],
          ],
        ]) {
          const q = clip(poly, tri);
          if (q.length < 3) continue;
          const area =
            Math.abs(
              q.reduce(
                (sum, p, k) =>
                  sum +
                  p[0] * q[(k + 1) % q.length][1] -
                  p[1] * q[(k + 1) % q.length][0],
                0,
              ),
            ) / 2;
          if (area < 1e-6) continue;
          land.paths.push({
            footprint: q.map(local),
            heights: q.map((p) => geo.height(...p) - base + 0.1),
            tone: 0,
          });
        }
      }
  }
  const roadSamples = capsule(72).filter((p) => !safe(p, 0.1));
  const d = {
    asset: "stadium",
    name: "滨海体育场",
    anchor,
    base,
    yaw,
    halfStraight,
    innerRadius,
    laneWidth,
    lanes,
    standRadius,
    fieldHeight,
    lowerRows: 12,
    upperRows: 14,
    rowDepth: 0.78,
    rowRise: 0.38,
    concourseWidth: 2.4,
    sources: [
      {
        url: "https://www.720yun.com/vr/5dejtgefzu6",
        scene: "27335713 滨海体育场",
        checked: "2026-09-29",
        type: "built panorama",
      },
      {
        url: "https://github.com/taoyu051818-sys/lian-campus-explorer/blob/391ecb7b46a877b283999a93aa0abfbb5cc20d3a/public/overall/data.json",
        type: "existing campus schematic registration",
      },
    ],
    evidence: {
      observed: [
        "朝海一侧开敞的三面看台",
        "蓝白双层座席、白色径向台阶和贯通出入口",
        "端部中央凹入平台、折线高架观景构架",
        "高杆灯、滨海围栏、棕榈与道路侧阔叶树",
      ],
      estimated: [
        "跑道按400 m级模板近似，非实测尺寸",
        "看台排数、层高、平台和折线构架高度、构件及座椅数量",
        "沿用校园轴向与锚点，未取得共同测绘坐标",
        "植物品种、数量和位置；为道路净空调整种植",
      ],
      notReconstructed: [
        "封闭用房室内",
        "地下结构",
        "高架观景平台完整内部交通",
      ],
    },
    views: {
      overall: { position: [170, 150, 195], target: [-5, 4, 0], fov: 43 },
      front: { position: [15, 23, 46], target: [-96, 9, 0], fov: 54 },
      stairs: { position: [5, 9, -31], target: [0, 6, -60], fov: 49 },
      rear: { position: [-183, 42, 80], target: [-93, 10, 0], fov: 49 },
      landscape: { position: [117, 51, 151], target: [38, 3, 60], fov: 49 },
    },
    review: {
      eyebrow: "滨海共享带 · 实景参考",
      heading: "蓝白看台与朝海开口",
      description:
        "双层座席围合蓝色跑道，白色折线观景平台高起；棕榈和阔叶树沿外围步道布置。",
      evidenceText:
        "依据 720 建成全景逐项细化，未取得本体育场实建测绘图。体量、构件尺寸、排数、植物布置及校园配准仍含估算。",
      groundColor: "#87936c",
      exposure: 0.78,
      environmentIntensity: 0.55,
      groundHeight: fieldHeight - 0.12,
    },
    landscape: land,
    registrationAudit: {
      roadConflictSamples: roadSamples,
      plantCount: land.plants.length,
    },
  };
  await fs.mkdir("authoring/stadium", { recursive: true });
  await fs.writeFile(
    "authoring/stadium/design.json",
    JSON.stringify(d, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      anchor,
      base,
      fieldHeight,
      trees: land.plants.length,
      shrubs: land.shrubs.length,
      roadConflictSamples: roadSamples.length,
    }),
  );
} finally {
  await server.close();
}
