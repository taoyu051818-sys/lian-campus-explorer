import {
  toWorld,
  distance,
  closest,
  inside,
  type Point,
} from "./world-geometry";
import { teachingPlan as plan } from "./teaching-plan-data";

// Plan-scale digitization, translated onto the schematic atlas (not geodetic registration).
export function addTeachingExterior(geo: any) {
  geo.buildings = geo.buildings.filter((b: any) => b.placeId !== "teaching");
  const anchor = toWorld(plan.registration.anchorAtlas as Point);
  const point = (p: number[]): Point => [
    anchor[0] +
      (p[0] - 420) * plan.metresPerPixel +
      plan.registration.translation[0],
    anchor[1] -
      (p[1] - 1050) * plan.metresPerPixel +
      plan.registration.translation[1],
  ];
  const center = point([420, 1050]);
  const ring = (radius: number, angle: number): Point => [
    center[0] + Math.sin(angle) * radius,
    center[1] + Math.cos(angle) * radius + Math.sign(Math.cos(angle)) * 46,
  ];
  const footprint = Array.from({ length: 128 }, (_, i) =>
    ring(46, (i / 128) * Math.PI * 2),
  );
  geo.grounds.push({
    placeId: "teaching",
    name: "A-79批前方案400米跑道",
    footprint,
    center,
    axis: [0, 1],
    radius: 46,
    straightHalfLength: 46,
  });
  const podium = plan.podium.map(point);
  const buildingBase = Math.min(...podium.map((p) => geo.height(...p))) - 0.15;
  const add = (
    name: string,
    fp: Point[],
    height: number,
    floors: number,
    kind: string,
    fixedBase: number,
  ) => {
    const b = {
      name,
      placeId: "teaching",
      footprint: fp,
      height,
      floors,
      kind,
      traced: true,
      fixedBase,
    };
    geo.buildings.push(b);
    return b;
  };
  add(
    "A-75连体教学楼 · 三层基座与弧形裙楼",
    podium,
    14.7,
    3,
    "teaching-podium",
    buildingBase,
  );
  for (const w of plan.wings)
    add(
      "A-75 " + w.name,
      w.footprint.map(point),
      (w.floors - 3) * 4.9,
      w.floors - 3,
      "teaching-wing",
      buildingBase + 14.7,
    );
  add(
    "A-75独立低层公共空间",
    plan.hall.map(point),
    5.8,
    1,
    "teaching-hall",
    buildingBase,
  );
  const standBase = 20.05;
  for (const [i, start] of [0.14, Math.PI + 0.14].entries()) {
    const end = start + Math.PI - 0.28;
    const fp = [
      ...Array.from({ length: 49 }, (_, k) =>
        ring(67, start + ((end - start) * k) / 48),
      ),
      ...Array.from({ length: 49 }, (_, k) =>
        ring(51, end - ((end - start) * k) / 48),
      ),
    ];
    const b = add(
      `A-79${i === 0 ? "东" : "西"}侧看台`,
      fp,
      3.4,
      1,
      "teaching-stand",
      standBase,
    );
    Object.assign(b, { stadiumCenter: center, arcStart: start, arcEnd: end });
  }
  // The bridge is an elevated collision surface. Its supporting piers avoid the roadway.
  const bridge = plan.bridge.map(point);
  const deckBase = Math.max(
    buildingBase + 14.7,
    ...bridge.map((p) => geo.height(...p) + 7),
  );
  const halfWidth = 3.2;
  const edges = bridge.map((p, i) => {
    const a = bridge[Math.max(0, i - 1)],
      c = bridge[Math.min(bridge.length - 1, i + 1)];
    const len = distance(a, c);
    return [
      -((c[1] - a[1]) / len) * halfWidth,
      ((c[0] - a[0]) / len) * halfWidth,
    ] as Point;
  });
  for (let i = 1; i < bridge.length; i++) {
    const a = bridge[i - 1],
      c = bridge[i],
      u = edges[i - 1],
      v = edges[i];
    add(
      `A-75/A-79跨路连廊 ${i}`,
      [
        [a[0] + u[0], a[1] + u[1]],
        [c[0] + v[0], c[1] + v[1]],
        [c[0] - v[0], c[1] - v[1]],
        [a[0] - u[0], a[1] - u[1]],
      ],
      0.65,
      1,
      "teaching-bridge",
      deckBase,
    );
  }
  geo.teachingBridge = { points: bridge, deckBase };
  bridge.slice(1, -1).forEach((p, i) => {
    const fp: Point[] = [
      [p[0] - 0.7, p[1] - 1.4],
      [p[0] + 0.7, p[1] - 1.4],
      [p[0] + 0.7, p[1] + 1.4],
      [p[0] - 0.7, p[1] + 1.4],
    ];
    if (
      !fp.every(
        (q) =>
          geo.clearRoad(q, 2) &&
          !geo.buildings.some(
            (b: any) => b.kind !== "teaching-bridge" && inside(q, b.footprint),
          ),
      )
    )
      return;
    const floor = Math.min(...fp.map((q) => geo.height(...q))) - 0.15;
    add(
      `跨路连廊桥墩 ${i + 1}`,
      fp,
      deckBase - floor,
      1,
      "teaching-pier",
      floor,
    );
  });
  // Ground routes reference the garden arrangement; exact paving is game adaptation.
  const paths: number[][][] = [
    [
      [691, 751],
      [711, 774],
      [756, 805],
      [825, 831],
      [898, 849],
      [974, 865],
      [1007, 851],
      [1031, 826],
    ],
    [
      [825, 831],
      [842, 803],
      [854, 763],
      [854, 718],
      [845, 698],
      [817, 691],
    ],
    [
      [898, 849],
      [934, 810],
      [962, 778],
      [982, 746],
    ],
    [
      [711, 774],
      [718, 748],
    ],
    [
      [420, 827],
      [420, 850],
      [420, 875],
    ],
    [
      [420, 1277],
      [420, 1250],
      [420, 1225],
    ],
  ];
  paths.forEach((p, i) =>
    geo.walkways.push({
      placeId: "teaching",
      name: `教学服务中心地面步道 ${i + 1}`,
      width: 2.8,
      points: p.map(point),
    }),
  );
  const groundEntries = [
    point([691, 751]),
    point([420, 827]),
    point([420, 1277]),
  ];
  for (const [i, entry] of groundEntries.entries()) {
    // Choose a road projection whose connector has no ground-level obstruction.
    const candidates = geo.segments
      .map((s: any) => closest(entry, s.a, s.b))
      .sort((a: Point, b: Point) => distance(a, entry) - distance(b, entry));
    const target = candidates.find((r: Point) =>
      Array.from(
        { length: 51 },
        (_, k): Point => [
          entry[0] + ((r[0] - entry[0]) * k) / 50,
          entry[1] + ((r[1] - entry[1]) * k) / 50,
        ],
      ).every(
        (p) =>
          inside(p, geo.land) &&
          !geo.buildings.some(
            (b: any) =>
              b.kind !== "teaching-bridge" &&
              (b.fixedBase === undefined ||
                b.fixedBase < geo.height(...p) + 2) &&
              inside(p, b.footprint),
          ),
      ),
    );
    if (target)
      geo.walkways.push({
        placeId: "teaching",
        name: `教学服务中心道路入口 ${i + 1}`,
        width: 2.8,
        points: [entry, target],
      });
  }
}
