import {
  Mesh,
  VertexData,
  StandardMaterial,
  Color3,
  RawTexture,
  Texture,
  Scene,
} from "@babylonjs/core";
import {
  inside,
  closest,
  distance,
  toWorld,
  type Point,
} from "./world-geometry";
import type { AtlasData } from "./atlas";
export type PlantBed = {
  center: Point;
  length: number;
  width: number;
  angle: number;
  height: number;
  seed: number;
  type: "hedge" | "island";
};
const noise = (n: number) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};
export function bedPoint(b: PlantBed, u: number, v: number): Point {
  const taper = Math.sqrt(Math.max(0, 1 - Math.abs(u) ** 6));
  const wobble =
    1 + 0.12 * Math.sin(u * 8 + b.seed) + 0.055 * Math.cos(u * 19 + b.seed);
  const x = (u * b.length) / 2,
    z = ((v * b.width) / 2) * taper * wobble;
  return [
    b.center[0] + x * Math.cos(b.angle) - z * Math.sin(b.angle),
    b.center[1] + x * Math.sin(b.angle) + z * Math.cos(b.angle),
  ];
}
export function landscapeLayout(geo: any, data: AtlasData, campus: any) {
  const bounds: {
    fp: Point[];
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  }[] = geo.buildings.map((b: any) => ({
    fp: b.footprint as Point[],
    minX: Math.min(...b.footprint.map((p: Point) => p[0])),
    maxX: Math.max(...b.footprint.map((p: Point) => p[0])),
    minZ: Math.min(...b.footprint.map((p: Point) => p[1])),
    maxZ: Math.max(...b.footprint.map((p: Point) => p[1])),
  }));
  const access = (campus.roads as Point[][]).map((path) =>
    path.map((p) => geo.local(p) as Point),
  );
  for (const ground of [
    ...(geo.grounds || []),
    ...(geo.transportSites || []),
    ...(geo.exteriorAccessAreas || []),
  ])
    bounds.push({
      fp: ground.footprint,
      minX: Math.min(...ground.footprint.map((p: Point) => p[0])),
      maxX: Math.max(...ground.footprint.map((p: Point) => p[0])),
      minZ: Math.min(...ground.footprint.map((p: Point) => p[1])),
      maxZ: Math.max(...ground.footprint.map((p: Point) => p[1])),
    });
  for (const path of geo.walkways || []) access.push(path.points);
  const localEntrance = access[0][0];
  access.push([localEntrance, geo.nearestRoad(localEntrance).point]);
  for (const site of [...(geo.transportSites || []), ...(geo.forecourts || [])])
    access.push([site.entry, site.road]);
  const paths = access.flatMap((path) =>
    path.slice(1).map((b, i) => ({ a: path[i], b })),
  );
  const entries = data.places.map((p) => ({
    a: toWorld(p.point),
    b: geo.spawns.find((s: any) => s.id === p.id).point as Point,
  }));
  const field = toWorld(data.places.find((p) => p.id === "stadium")!.point);
  function safe(p: Point, padding = 0.5) {
    if (
      geo.height(...p) < 5 ||
      !inside(p, geo.land) ||
      !geo.clearRoad(p, 4 + padding)
    )
      return false;
    if (distance(p, field) < 108 + padding) return false;
    if (geo.spawns.some((s: any) => distance(p, s.point) < 5 + padding))
      return false;
    if (paths.some((s) => distance(p, closest(p, s.a, s.b)) < 4 + padding))
      return false;
    // Keep a legible approach from the road to each destination, even where entrances are not surveyed.
    if (entries.some((s) => distance(p, closest(p, s.a, s.b)) < 6 + padding))
      return false;
    for (const b of bounds) {
      const margin = 5 + padding;
      if (
        p[0] < b.minX - margin ||
        p[0] > b.maxX + margin ||
        p[1] < b.minZ - margin ||
        p[1] > b.maxZ + margin
      )
        continue;
      if (
        inside(p, b.fp) ||
        b.fp.some(
          (a, i) =>
            distance(p, closest(p, a, b.fp[(i + 1) % b.fp.length])) < margin,
        )
      )
        return false;
    }
    return true;
  }
  const beds: PlantBed[] = [];
  function add(b: PlantBed) {
    // Verify the whole bed, including its overhanging foliage, rather than just its centre.
    for (let i = 0; i <= 10; i++)
      for (const v of [-1, 0, 1])
        if (!safe(bedPoint(b, i / 5 - 1, v), 0.55)) return;
    beds.push(b);
  }
  let seed = 1;
  for (const r of geo.roads)
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1],
        b = r.points[i],
        len = distance(a, b),
        angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
      for (const side of [-1, 1])
        for (let d = 21; d < len - 20; d += 31) {
          const n = seed++,
            offset = r.width / 2 + 7.5;
          add({
            center: [
              a[0] + Math.cos(angle) * d - Math.sin(angle) * offset * side,
              a[1] + Math.sin(angle) * d + Math.cos(angle) * offset * side,
            ],
            length: 18 + noise(n) * 7,
            width: 2.2 + noise(n + 4) * 0.7,
            angle,
            height: 0.55 + noise(n + 6) * 0.32,
            seed: n,
            type: "hedge",
          });
        }
    }
  // Small irregular islands leave most open ground as lawn. No guessed tree species or planting inventory.
  for (const place of data.places) {
    if (!place.polygon || ["village", "stadium"].includes(place.id)) continue;
    const poly = place.polygon.map(toWorld),
      xs = poly.map((p) => p[0]),
      zs = poly.map((p) => p[1]);
    for (let x = Math.min(...xs) + 9; x < Math.max(...xs); x += 22)
      for (let z = Math.min(...zs) + 9; z < Math.max(...zs); z += 23) {
        const n = seed++;
        if (noise(n) > 0.58) continue;
        const center: Point = [
          x + (noise(n + 1) - 0.5) * 11,
          z + (noise(n + 2) - 0.5) * 11,
        ];
        if (!inside(center, poly)) continue;
        const b: PlantBed = {
          center,
          length: 8 + noise(n + 3) * 10,
          width: 3.5 + noise(n + 4) * 5,
          angle: noise(n + 5) * Math.PI,
          height: 0.38 + noise(n + 6) * 0.55,
          seed: n,
          type: "island",
        };
        if ([-1, 1].some((u) => !inside(bedPoint(b, u, 0), poly))) continue;
        if (
          beds.some(
            (q) => distance(q.center, center) < (q.width + b.width) / 2 + 5,
          )
        )
          continue;
        add(b);
      }
  }
  // Smaller shrub islands fit residential courts while leaving the shared paths open.
  for (const placeId of ["community", "dorm56", "dorm52"]) {
    const community = data.places.find((p) => p.id === placeId);
    if (community?.polygon) {
      const poly = community.polygon.map(toWorld);
      for (
        let x = Math.min(...poly.map((p) => p[0])) + 10;
        x < Math.max(...poly.map((p) => p[0]));
        x += 13
      )
        for (
          let z = Math.min(...poly.map((p) => p[1])) + 10;
          z < Math.max(...poly.map((p) => p[1]));
          z += 14
        ) {
          const n = 100000 + Math.round(x * 13 + z * 17);
          if (noise(n) > 0.64) continue;
          const center: Point = [x + noise(n + 2) * 3, z + noise(n + 3) * 3];
          if (
            !inside(center, poly) ||
            beds.some((b) => distance(center, b.center) < b.width / 2 + 5)
          )
            continue;
          const bed: PlantBed = {
            center,
            length: 4 + noise(n + 4) * 3,
            width: 1.8 + noise(n + 5) * 1.2,
            angle: noise(n + 6) * Math.PI,
            height: 0.35 + noise(n + 7) * 0.32,
            seed: n,
            type: "island",
          };
          if ([-1, 1].every((u) => inside(bedPoint(bed, u, 0), poly))) add(bed);
        }
    }
  }
  // Low planting inside the four photo-reference courts; keep the entry axis open.
  for (const path of geo.walkways.filter(
    (p: any) => p.placeId === "dorm52" && p.name.startsWith("候选合院"),
  )) {
    const a = path.points[0],
      c = path.points[path.points.length - 1];
    const len = distance(a, c),
      dx = (c[0] - a[0]) / len,
      dz = (c[1] - a[1]) / len;
    for (const side of [-1, 1])
      add({
        center: [c[0] - dz * side * 8, c[1] + dx * side * 8],
        length: 5,
        width: 2.4,
        angle: Math.atan2(dz, dx),
        height: 0.52,
        seed: 190000 + seed++,
        type: "island",
      });
  }
  for (const path of geo.walkways.filter(
    (p: any) =>
      p.placeId === "canteen" && p.name === "食堂照片参考入口道路步道",
  )) {
    const a = path.points[0],
      c = path.points[1];
    const len = distance(a, c),
      dx = (c[0] - a[0]) / len,
      dz = (c[1] - a[1]) / len;
    for (const side of [-1, 1])
      add({
        center: [c[0] - dz * side * 6, c[1] + dx * side * 6],
        length: 4.6,
        width: 2.2,
        angle: Math.atan2(dz, dx),
        height: 0.48,
        seed: 200000 + seed++,
        type: "island",
      });
  }
  // Low shrub islands follow the new teaching garden paths, with the normal clearance filter.
  for (const path of geo.walkways.filter(
    (p: any) =>
      (p.placeId === "teaching" && p.name.startsWith("教学服务中心地面步道")) ||
      ["services", "industry"].includes(p.placeId),
  )) {
    for (let i = 1; i < path.points.length; i++) {
      const a = path.points[i - 1],
        b = path.points[i],
        length = distance(a, b);
      if (length < 5) continue;
      const dx = (b[0] - a[0]) / length,
        dz = (b[1] - a[1]) / length;
      for (const side of [-1, 1])
        add({
          center: [
            (a[0] + b[0]) / 2 - dz * side * 5,
            (a[1] + b[1]) / 2 + dx * side * 5,
          ],
          length: Math.min(8, length * 0.55),
          width: 2.6,
          angle: Math.atan2(dz, dx),
          height: 0.52,
          seed: 210000 + seed++,
          type: "island",
        });
    }
  }
  // Low planting groups in the photographed living-area courts, leaving the shared approach clear.
  for (const path of geo.walkways.filter(
    (p: any) => p.placeId === "dorm52" && p.name.startsWith("候选合院"),
  )) {
    const a = path.points[0],
      c = path.points[path.points.length - 1],
      len = distance(a, c),
      ux = (c[0] - a[0]) / len,
      uz = (c[1] - a[1]) / len;
    for (const along of [-1, 1])
      for (const side of [-1, 1])
        add({
          center: [
            c[0] + ux * along * 9 - uz * side * 11,
            c[1] + uz * along * 9 + ux * side * 11,
          ],
          length: 4.2,
          width: 2.2,
          angle: Math.atan2(uz, ux),
          height: 0.44,
          seed: 220000 + seed++,
          type: "island",
        });
  }
  // Photo-inspired open green belt between the coastal and teaching axes; location is approximate.
  const belt = [
    [465, 760],
    [482, 748],
    [522, 793],
    [518, 825],
    [492, 848],
    [473, 833],
  ].map((p) => toWorld(p as Point));
  for (
    let x = Math.min(...belt.map((p) => p[0]));
    x < Math.max(...belt.map((p) => p[0]));
    x += 24
  )
    for (
      let z = Math.min(...belt.map((p) => p[1]));
      z < Math.max(...belt.map((p) => p[1]));
      z += 27
    ) {
      const n = seed++,
        center: Point = [x, z];
      if (
        !inside(center, belt) ||
        noise(n) > 0.5 ||
        beds.some((b) => distance(b.center, center) < 18)
      )
        continue;
      add({
        center,
        length: 13 + noise(n + 1) * 10,
        width: 5 + noise(n + 2) * 3,
        angle: 0.8 + noise(n + 3) * 0.5,
        height: 0.4 + noise(n + 4) * 0.5,
        seed: n,
        type: "island",
      });
    }
  return { beds, safe };
}
export function createTurfTexture(scene: Scene) {
  const size = 128,
    pixels = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const n = noise(x + y * size);
      const light = 0.93 + n * 0.14;
      const i = (y * size + x) * 3;
      pixels[i] = 210 * light;
      pixels[i + 1] = 220 * light;
      pixels[i + 2] = 190 * light;
    }
  const t = RawTexture.CreateRGBTexture(
    pixels,
    size,
    size,
    scene,
    true,
    false,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  t.name = "subtle procedural grass grain";
  t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE;
  return t;
}
export function createLandscape(
  scene: Scene,
  geo: any,
  data: AtlasData,
  campus: any,
) {
  const { beds } = landscapeLayout(geo, data, campus);
  type Batch = { p: number[]; i: number[]; c: number[] };
  const bodies = new Map<string, Batch>(),
    leaves = new Map<string, Batch>();
  const get = (map: Map<string, Batch>, b: PlantBed) => {
    const key =
      Math.floor(b.center[0] / 160) + ":" + Math.floor(b.center[1] / 160);
    if (!map.has(key)) map.set(key, { p: [], i: [], c: [] });
    return map.get(key)!;
  };
  let leafCount = 0,
    maxHeight = 0;
  const palette = [
    [0.23, 0.37, 0.12],
    [0.31, 0.43, 0.14],
    [0.39, 0.49, 0.19],
    [0.28, 0.4, 0.19],
  ];
  function top(b: PlantBed, u: number, v: number) {
    const end = Math.min(1, (1 - Math.abs(u)) * 8),
      side = Math.sqrt(Math.max(0, 1 - v * v));
    return (
      0.05 +
      b.height *
        end *
        side *
        (0.88 +
          0.13 * Math.sin(u * 17 + b.seed) +
          0.07 * Math.cos(v * 11 + b.seed))
    );
  }
  for (const b of beds) {
    const batch = get(bodies, b),
      start = batch.p.length / 3,
      nx = Math.ceil(b.length / 1.7),
      nz = 6,
      color = palette[b.seed % palette.length];
    for (let i = 0; i <= nx; i++)
      for (let j = 0; j <= nz; j++) {
        const u = (i / nx) * 2 - 1,
          v = (j / nz) * 2 - 1,
          p = bedPoint(b, u, v),
          h = top(b, u, v);
        maxHeight = Math.max(maxHeight, h);
        batch.p.push(p[0], geo.height(...p) + h, p[1]);
        const mottling = 0.83 + noise(b.seed + i * 31 + j) * 0.28;
        batch.c.push(
          color[0] * mottling,
          color[1] * mottling,
          color[2] * mottling,
          1,
        );
      }
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const a = start + i * (nz + 1) + j,
          c = a + nz + 1;
        batch.i.push(a, c, a + 1, a + 1, c, c + 1);
      }
    const leafBatch = get(leaves, b),
      count = Math.min(65, Math.ceil(b.length * b.width * 0.65));
    for (let k = 0; k < count; k++) {
      const u = (noise(b.seed * 79 + k * 7) - 0.5) * 1.8,
        v = (noise(b.seed * 47 + k * 13) - 0.5) * 1.7,
        p = bedPoint(b, u, v),
        y = geo.height(...p) + top(b, u, v) + 0.035;
      const angle = noise(k + b.seed) * Math.PI * 2,
        dx = Math.cos(angle),
        dz = Math.sin(angle),
        size = 0.11 + noise(k * 5 + b.seed) * 0.13;
      const index = leafBatch.p.length / 3;
      // Two creased leaves form a small sprig, not a billboard tree crown.
      for (const [x, z, h] of [
        [-size, 0, 0],
        [0, -size * 0.44, 0.025],
        [size, 0, 0.07],
        [0, size * 0.44, 0.025],
        [0, 0, 0.1],
      ])
        leafBatch.p.push(p[0] + dx * x - dz * z, y + h, p[1] + dz * x + dx * z);
      leafBatch.i.push(
        index,
        index + 1,
        index + 4,
        index + 1,
        index + 2,
        index + 4,
        index + 2,
        index + 3,
        index + 4,
        index + 3,
        index,
        index + 4,
      );
      for (let j = 0; j < 5; j++) {
        const tint = 1.05 + noise(k + j + b.seed) * 0.23;
        leafBatch.c.push(color[0] * tint, color[1] * tint, color[2] * tint, 1);
      }
      leafCount++;
    }
  }
  const material = new StandardMaterial("low mixed shrub foliage", scene);
  material.diffuseColor = Color3.White();
  material.specularColor.set(0.02, 0.025, 0.01);
  material.backFaceCulling = false;
  function build(map: Map<string, Batch>, name: string, lod: number) {
    for (const [key, b] of map) {
      const mesh = new Mesh(name + " " + key, scene),
        vd = new VertexData(),
        normals: number[] = [];
      VertexData.ComputeNormals(b.p, b.i, normals);
      vd.positions = b.p;
      vd.indices = b.i;
      vd.normals = normals;
      vd.colors = b.c;
      vd.applyToMesh(mesh);
      mesh.material = material;
      mesh.isPickable = false;
      mesh.addLODLevel(lod, null);
      mesh.freezeWorldMatrix();
    }
  }
  build(bodies, "low shrub bed", 2200);
  build(leaves, "shrub leaf detail", 240);
  return {
    beds,
    stats: {
      treeCount: 0,
      hedgeBeds: beds.filter((b) => b.type === "hedge").length,
      shrubIslands: beds.filter((b) => b.type === "island").length,
      leafSprigs: leafCount,
      maximumShrubHeight: Math.round((maxHeight + 0.14) * 100) / 100,
      bodyTiles: bodies.size,
      leafTiles: leaves.size,
    },
  };
}
