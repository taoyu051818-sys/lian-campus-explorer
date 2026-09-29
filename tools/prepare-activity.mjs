// Register the as-built bent plan and fit photo-informed planting to campus terrain.
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
    plans = await read("public/refined-plans.json"),
    campus = await read("public/campus.json");
  const reference = await read("authoring/activity/digitization.json"),
    geo = geometry(data, campus),
    registrations = refine(geo, data, plans);
  const origin = toWorld(data.places.find((p) => p.id === "activity").point),
    registration = registrations.find((r) => r.id === "activity");
  const legacyAnchor = origin.map((v, i) => v + registration.translation[i]);
  let anchor = [...legacyAnchor],
    base = geo.height(...anchor) + 0.12;
  const world = (p) => [p[0] + anchor[0], p[1] + anchor[1]];
  // Local depth points south, so the as-built geometry has the same handedness as photographs.
  // The legacy atlas anchor remains schematic; this is not unified survey registration.
  const pixel = (p) =>
    reference.existingOrigin.map(
      (o, i) =>
        (i === 1 ? -1 : 1) *
        (p[0] * reference.pixelToEastingNorthing[0][i] +
          p[1] * reference.pixelToEastingNorthing[1][i] +
          reference.pixelToEastingNorthing[2][i] -
          o),
    );
  const [A, B, C, D, E] = reference.centerlinePixels.map(pixel),
    centerline = [];
  function line(a, b, n) {
    for (let i = 0; i < n; i++)
      centerline.push(a.map((v, k) => v + ((b[k] - v) * i) / n));
  }
  line(A, B, 16);
  for (let i = 0; i < 24; i++) {
    const t = i / 24;
    centerline.push(
      B.map((v, k) => (1 - t) ** 2 * v + 2 * t * (1 - t) * C[k] + t * t * D[k]),
    );
  }
  line(D, E, 16);
  centerline.push(E);
  const stations = centerline.map((point, i) => {
    const a = centerline[Math.max(0, i - 1)],
      b = centerline[Math.min(centerline.length - 1, i + 1)],
      length = distance(a, b);
    return {
      point,
      right: [-(b[1] - a[1]) / length, (b[0] - a[0]) / length],
      s: 0,
    };
  });
  for (let i = 1; i < stations.length; i++)
    stations[i].s =
      stations[i - 1].s + distance(stations[i - 1].point, stations[i].point);
  const length = stations.at(-1).s,
    half = reference.halfWidth;
  function at(s, t) {
    let i = stations.findIndex((p) => p.s >= s);
    i = Math.max(1, i < 0 ? stations.length - 1 : i);
    const a = stations[i - 1],
      b = stations[i],
      f = (s - a.s) / (b.s - a.s);
    return a.point.map(
      (v, k) =>
        v +
        (b.point[k] - v) * f +
        t * (a.right[k] + (b.right[k] - a.right[k]) * f),
    );
  }
  const footprint = [
    ...stations.map((p) => p.point.map((v, k) => v + p.right[k] * half)),
    ...stations
      .toReversed()
      .map((p) => p.point.map((v, k) => v - p.right[k] * half)),
  ];
  const spatialSamples = footprint.flatMap((a, i) => {
    const b = footprint[(i + 1) % footprint.length],
      n = Math.ceil(distance(a, b));
    return Array.from({ length: n }, (_, j) =>
      a.map((v, k) => v + ((b[k] - v) * j) / n),
    );
  });
  const min = [0, 1].map((k) => Math.min(...footprint.map((p) => p[k]))),
    max = [0, 1].map((k) => Math.max(...footprint.map((p) => p[k])));
  for (let x = min[0]; x <= max[0]; x += 2)
    for (let z = min[1]; z <= max[1]; z += 2)
      if (inside([x, z], footprint)) spatialSamples.push([x, z]);
  // Preserve the corrected shape; translate the site to clear schematic roads instead of shrinking it.
  const neighbors = geo.buildings
    .filter((b) => b.placeId !== "activity")
    .map((b) => b.footprint);
  const offsets = [];
  for (let x = -35; x <= 35; x += 2.5)
    for (let z = -35; z <= 35; z += 2.5) offsets.push([x, z]);
  offsets.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  const offset = offsets.find((o) =>
    spatialSamples.every((p) => {
      const q = p.map((v, k) => v + legacyAnchor[k] + o[k]);
      return geo.clearRoad(q, 2.7) && neighbors.every((fp) => !inside(q, fp));
    }),
  );
  if (!offset) throw new Error("No clear activity center registration found");
  anchor = legacyAnchor.map((v, k) => v + offset[k]);
  base = geo.height(...anchor) + 0.12;
  const buildingBase =
    Math.min(...footprint.map((p) => geo.height(...world(p)))) - 0.06 - base;
  const other = geo.buildings
      .filter((b) => b.placeId !== "activity")
      .map((b) => b.footprint),
    hulls = [...other, footprint.map(world)];
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
  function clear(p, pad = 0) {
    const q = world(p);
    return (
      inside(q, geo.land) &&
      geo.clearRoad(q, 2 + pad) &&
      geo.spawns.every((s) => distance(q, s.point) > 4 + pad) &&
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
  const beds = [];
  // Courtyard circle from survey, plus elongated lawns along the two wings.
  const circle = (c, rx, rz, n = 48) =>
    Array.from({ length: n }, (_, i) => [
      c[0] + rx * Math.cos((i * Math.PI * 2) / n),
      c[1] + rz * Math.sin((i * Math.PI * 2) / n),
    ]);
  const candidates = [
    { name: "courtyard lawn", fp: circle(pixel([547, 404]), 6.3, 6.1) },
  ];
  for (const [name, start, end, side] of [
    ["south inner lawn", 4, 25, 1],
    ["east inner lawn", 50, length - 4, 1],
    ["west roadside lawn", 5, 25, -1],
    ["north roadside lawn", 49, length - 5, -1],
  ]) {
    for (const width of [5.0, 3.2, 1.8]) {
      const fp = [];
      for (let i = 0; i <= 20; i++)
        fp.push(
          at(
            start + ((end - start) * i) / 20,
            side * (half + 7 + Math.sin((i * Math.PI) / 20) * width),
          ),
        );
      for (let i = 20; i >= 0; i--)
        fp.push(at(start + ((end - start) * i) / 20, side * (half + 4.8)));
      if (fp.every((p) => clear(p, 0.2))) {
        candidates.push({ name, fp });
        break;
      }
    }
  }
  for (const { name, fp } of candidates)
    if (fp.every((p) => clear(p, 0.2)))
      beds.push({
        name,
        footprint: fp,
        heights: fp.map((p) => geo.height(...world(p)) - base + 0.05),
      });
  const plants = [];
  for (const bed of beds) {
    const min = [0, 1].map((k) => Math.min(...bed.footprint.map((p) => p[k]))),
      max = [0, 1].map((k) => Math.max(...bed.footprint.map((p) => p[k])));
    const options =
      bed.name === "courtyard lawn"
        ? [pixel([547, 404])]
        : Array.from({ length: 13 }, (_, i) => [
            min[0] + ((max[0] - min[0]) * (i + 0.5)) / 13,
            min[1] + ((max[1] - min[1]) * (i + 0.5)) / 13,
          ]);
    for (const p of options) {
      const radius = bed.name === "courtyard lawn" ? 2.8 : 2.4;
      if (
        !inside(p, bed.footprint) ||
        !clear(p, radius) ||
        plants.some((t) => distance(t.point, p) < 6)
      )
        continue;
      plants.push({
        id: "activity-tree-" + plants.length,
        bed: bed.name,
        point: p,
        y: geo.height(...world(p)) - base,
        height: 7.1 + (plants.length % 3) * 0.65,
        crownRadius: radius,
        type:
          bed.name === "courtyard lawn" ? "palm-cluster" : "layered-broadleaf",
      });
    }
  }
  const shrubs = [];
  for (const bed of beds) {
    const fp = bed.footprint,
      center = fp.reduce(
        (a, p) => a.map((v, k) => v + p[k] / fp.length),
        [0, 0],
      );
    for (let i = 0; i < fp.length; i += 3) {
      const p = fp[i].map((v, k) => v * 0.82 + center[k] * 0.18);
      if (plants.some((t) => distance(t.point, p) < 1.6)) continue;
      shrubs.push({
        point: p,
        y: geo.height(...world(p)) - base + 0.3,
        radius: 0.65 + (i % 4) * 0.12,
        bed: bed.name,
      });
    }
  }
  const aprons = [];
  const outer = [
    ...stations.map((p) =>
      p.point.map((v, k) => v + p.right[k] * (half + 2.2)),
    ),
    ...stations
      .toReversed()
      .map((p) => p.point.map((v, k) => v - p.right[k] * (half + 2.2))),
  ];
  aprons.push({
    inner: footprint,
    outer,
    innerHeights: footprint.map((p) => geo.height(...world(p)) - base + 0.075),
    outerHeights: outer.map((p) => geo.height(...world(p)) - base + 0.075),
  });
  const pathPolygons = [];
  for (const bed of beds.filter((b) => b.name === "courtyard lawn")) {
    const c = pixel([547, 404]),
      outer = circle(c, 8.1, 7.9),
      inner = bed.footprint;
    for (let i = 0; i < inner.length; i++) {
      const j = (i + 1) % inner.length,
        fp = [inner[i], inner[j], outer[j], outer[i]];
      pathPolygons.push({
        footprint: fp,
        heights: fp.map((p) => geo.height(...world(p)) - base + 0.07),
      });
    }
  }
  const throughS = (stations[16].s + stations[40].s) / 2;
  const throughRoute = [-half - 3, -6, 0, 6, half + 3].map((t) => {
    const p = at(throughS, t);
    return [p[0], p[1], geo.height(...world(p)) - base];
  });
  const design = {
    schema: 1,
    asset: "activity",
    name: "大学生活动中心",
    anchor,
    base,
    yaw: 0,
    siteOffset: offset,
    localAxes:
      "X east / depth south / elevation up; atlas registration remains schematic",
    buildingBase,
    stations,
    length,
    halfWidth: half,
    footprint,
    height: 21.8,
    floors: reference.floorHeights,
    throughRoute,
    landscape: {
      beds,
      plants,
      shrubs,
      aprons,
      paths: pathPolygons,
      placement:
        "Survey courtyard and photo-informed lawn/hedge structure; individual trees, species and coordinates estimated and clearance-tested.",
    },
    sources: [
      {
        url: reference.source,
        images: reference.evidenceImages,
        role: "As-built ground, upper and roof plans plus photographs dated 2025-01-07",
      },
    ],
    evidence: {
      confirmed: [
        "Four above-ground storeys, 21.8 m survey height",
        "Rounded bent wings with ground-level open link and colonnades",
        "Alternating recessed galleries, continuous white bands, blue glazing with pale elongated geometric panels",
        "Solid upper end wall with square opening and exterior return stairs",
        "Roof service rooms, courtyard circular planting and perimeter broadleaf trees / palms",
      ],
      estimated: [
        "Hand-traced centreline and envelope width; 1.2 m red-line control residual is not survey accuracy",
        "Storey levels, balcony setbacks, column grid, glazing and pattern modules",
        "Stair width / treads, roof equipment and unpublished elevations",
        "Individual plant species, count, positions and schematic campus terrain registration",
      ],
    },
    review: {
      eyebrow: "STUDENT ACTIVITY CENTER",
      heading: "弯折楼翼、架空层与庭院",
      description:
        "沿连续弧面展开的四层楼翼，保留首层通廊、交错外廊、端部开洞与室外楼梯。周边草坪、乔木和灌木按实建图与照片参考布置。",
    },
    views: {
      overall: { position: [75, 65, 86], target: [0, 9, 3], fov: 42 },
      front: { position: [54, 20, 64], target: [-1, 11, 4], fov: 43 },
      arcade: { position: [33, 4.4, 22], target: [-5, 3, -1], fov: 62 },
      facade: { position: [31, 17, 36], target: [-2, 13, 5], fov: 50 },
      roof: { position: [15, 115, 38], target: [0, 4, 3], fov: 44 },
      landscape: { position: [67, 14, 48], target: [1, 7, 6], fov: 46 },
    },
  };
  await fs.writeFile(
    "authoring/activity/design.json",
    JSON.stringify(design, null, 2) + "\n",
  );
  console.log({
    anchor,
    base,
    buildingBase,
    length,
    beds: beds.map((b) => b.name),
    trees: plants.length,
    shrubs: shrubs.length,
    throughRoute,
  });
} finally {
  await server.close();
}
