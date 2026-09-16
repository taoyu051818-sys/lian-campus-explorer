import { addTeachingAccess } from "./teaching-access";
import { addServicesIndustryExterior } from "./services-industry-exterior";
import {
  type Point,
  type Building,
  toWorld,
  distance,
  closest,
} from "./world-geometry";
import type { AtlasData } from "./atlas";
import { addTeachingExterior } from "./teaching-exterior";
export type RefinedBuilding = Building & {
  kind?: string;
  floors?: number;
  baseOffset?: number;
  fixedBase?: number;
};
export const partialDetailStatus: Record<string, string> = {
  dorm52: "生活二区实景立面 · 六层宿舍／三层外廊 · A52待核",
  canteen: "现8号／原一号 · 航拍屋顶与入口外景",
};
export const detailStatus: Record<string, string> = {
  teaching: "规划参考外景 · 教学楼、体育场与可步行连廊",
  services: "规划总图与效果图 · 弧形合院、展馆与室外通道",
  industry: "规划总图与效果图 · 半环楼与开放庭院",
  community: "A-06范围图 · 住宅外观与场内步道",
  dorm56: "面积/道路对应推断 · 退台外观与院落步道",
  police: "实建图参考 · 蓝白楼翼与开放庭院",
  fire: "实建图参考 · 消防站与训练塔",
  hospital: "A-22界址核对 · 效果图参考外形",
  hub30: "效果图参考 · 折板站房与停车棚",
  hub87: "效果图参考 · 椭圆站房与巴士棚",
  youth: "规划图公寓群 · 本项目范围",
  school: "变更后总平面 · 校舍与运动场",
  law: "两期规划图 · 六栋楼与开放庭院",
  energy: "改造后效果图 · 2号楼尺寸估算",
  dorm62: "规划图四五区 · 分翼宿舍与食堂",
  workshop: "规划图五层工坊 · 三角中庭",
  geology: "规划图教学实践中心 · 弧形庭院",
  incubator: "实建图外轮廓 · 照片参考表皮",
  minzu: "效果图参考合院 · 尺寸估算",
  blcu: "效果图参考楼翼 · 尺寸估算",
  uestc: "核实图轮廓 · 立面细化",
  bupt: "核实图合院 · 照片参考立面",
  cuc: "规划图轮廓 · 简化立面",
  library: "全景参考外形 · 尺寸估算",
  sports: "实建图尺寸 · 双馆与表皮细化",
  activity: "实建图轮廓 · 四层弯折主楼",
  hall: "实建图轮廓 · 椭圆主厅",
  dorm3: "变更总平面 · 九座宿舍主体",
  stadium: "全景参考跑道与看台 · 尺寸估算",
};
export function roundedTriangle(
  cx: number,
  cz: number,
  r: number,
  angle = 0,
): Point[] {
  let p: Point[] = Array.from({ length: 3 }, (_, i) => [
    cx + r * Math.cos(angle + (i * Math.PI * 2) / 3),
    cz + r * Math.sin(angle + (i * Math.PI * 2) / 3),
  ]);
  for (let j = 0; j < 3; j++) {
    const q: Point[] = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i],
        b = p[(i + 1) % p.length];
      q.push(
        [a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25],
        [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75],
      );
    }
    p = q;
  }
  return p;
}
export function refine(geo: any, data: AtlasData, plans: any) {
  const registrations: any[] = [];
  for (const id of Object.keys(plans)) {
    const origin = toWorld(data.places.find((p) => p.id === id)!.point),
      entry = plans[id];
    const samples = [
      ...entry.blocks,
      ...(entry.grounds || []),
      ...(entry.transport ? [entry.transport] : []),
    ].flatMap((b: any) =>
      b.footprint.flatMap((p: Point, i: number) => {
        const q = b.footprint[(i + 1) % b.footprint.length];
        return Array.from(
          { length: 6 },
          (_, k) =>
            [
              p[0] + ((q[0] - p[0]) * k) / 6,
              p[1] + ((q[1] - p[1]) * k) / 6,
            ] as Point,
        );
      }),
    );
    let best: Point = [0, 0],
      bestScore = -Infinity;
    // Translation only: do not shrink surveyed building dimensions to fit a schematic parcel.
    const candidates: Point[] = [];
    for (let dx = -75; dx <= 75; dx += 5)
      for (let dz = -75; dz <= 75; dz += 5) candidates.push([dx, dz]);
    candidates.sort(
      (a, b) =>
        Math.hypot(...a) - Math.hypot(...b) || a[0] - b[0] || a[1] - b[1],
    );
    for (const [dx, dz] of candidates) {
      const displacement = Math.hypot(dx, dz);
      if (500 - displacement <= bestScore) continue;
      let clearance = Infinity;
      for (const p of samples) {
        const q: Point = [origin[0] + p[0] + dx, origin[1] + p[1] + dz];
        for (const s of geo.segments)
          clearance = Math.min(
            clearance,
            distance(q, closest(q, s.a, s.b)) - s.width / 2,
          );
        // Clearance only decreases as more samples are visited.
        if (Math.min(clearance, 5) * 100 - displacement <= bestScore) break;
      }
      const score = Math.min(clearance, 5) * 100 - displacement;
      if (score > bestScore) {
        bestScore = score;
        best = [dx, dz];
      }
    }
    geo.buildings = geo.buildings.filter((b: Building) => b.placeId !== id);
    for (const b of entry.blocks)
      geo.buildings.push({
        name: b.name,
        placeId: id,
        footprint: b.footprint.map((p: Point) => [
          origin[0] + p[0] + best[0],
          origin[1] + p[1] + best[1],
        ]),
        height: b.height,
        floors: b.floors,
        traced: entry.traced ?? id === "bupt",
        kind: b.kind || id,
        baseOffset: b.baseOffset || 0,
      });
    for (const path of entry.walkways || []) {
      geo.walkways.push({
        ...path,
        placeId: id,
        points: path.points.map((p: Point) => [
          origin[0] + p[0] + best[0],
          origin[1] + p[1] + best[1],
        ]),
      });
    }
    for (const ground of entry.grounds || []) {
      const transform = (p: Point): Point => [
        origin[0] + p[0] + best[0],
        origin[1] + p[1] + best[1],
      ];
      const d = distance(ground.axis, ground.center);
      geo.grounds.push({
        ...ground,
        placeId: id,
        footprint: ground.footprint.map(transform),
        center: transform(ground.center),
        axis: [
          (ground.axis[0] - ground.center[0]) / d,
          (ground.axis[1] - ground.center[1]) / d,
        ],
      });
    }
    if (entry.forecourt) {
      const transform = (p: Point): Point => [
        origin[0] + p[0] + best[0],
        origin[1] + p[1] + best[1],
      ];
      const entryPoint = transform(entry.forecourt.entry);
      geo.forecourts.push({
        placeId: id,
        footprint: entry.forecourt.footprint.map(transform),
        entry: entryPoint,
        road: geo.nearestRoad(entryPoint).point,
      });
    }
    if (entry.transport) {
      const transform = (p: Point): Point => [
        origin[0] + p[0] + best[0],
        origin[1] + p[1] + best[1],
      ];
      const site = entry.transport;
      const point = transform(site.entry);
      geo.transportSites.push({
        ...site,
        placeId: id,
        center: transform([0, 0]),
        footprint: site.footprint.map(transform),
        entry: point,
        road: geo.nearestRoad(point).point,
      });
    }
    registrations.push({
      id,
      translation: best,
      scale: 1,
      source: entry.source,
      method: entry.method,
    });
  }
  geo.buildings = geo.buildings.filter(
    (b: Building) => !["library", "stadium"].includes(b.placeId),
  );
  const c = toWorld(data.places.find((p) => p.id === "library")!.point);
  for (const [name, x, z, r, h, f] of [
    ["知识灯塔", -14, 24, 36, 83.6, 19],
    ["南侧花瓣裙楼", -9, -28, 46, 17.6, 4],
    ["东侧花瓣裙楼", 33, 3, 43, 17.6, 4],
  ] as [string, number, number, number, number, number][]) {
    geo.buildings.push({
      name,
      placeId: "library",
      footprint: roundedTriangle(c[0] + x, c[1] + z, r, 0.3),
      height: h,
      floors: f,
      traced: false,
      kind: "library",
    });
  }
  for (const b of geo.buildings as RefinedBuilding[])
    if (b.placeId === "uestc") {
      b.kind = "uestc";
      b.floors = Math.round(b.height / 3.9);
    }
  addTeachingExterior(geo);
  addServicesIndustryExterior(geo, data);
  addTeachingAccess(geo);
  return registrations;
}
