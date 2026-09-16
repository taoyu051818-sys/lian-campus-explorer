import {
  toWorld,
  toMap,
  inside,
  closest,
  distance,
  type Point,
} from "./world-geometry";
import { servicesIndustryPlan as plan } from "./services-industry-data";

// Both projects use one trace transform so their boundary and courtyard relation stay intact.
export function addServicesIndustryExterior(
  geo: any,
  data: import("./atlas").AtlasData,
) {
  geo.buildings = geo.buildings.filter(
    (b: any) => !["services", "industry"].includes(b.placeId),
  );
  const anchor = toWorld(plan.anchorAtlas as Point);
  const point = (p: number[]): Point => [
    anchor[0] +
      (p[0] - plan.anchorPixel[0]) * plan.metresPerPixel +
      plan.translation[0],
    anchor[1] -
      (p[1] - plan.anchorPixel[1]) * plan.metresPerPixel +
      plan.translation[1],
  ];
  // Correct the two neighbouring schematic placements without duplicating their geometry.
  for (const [id, delta] of [
    ["police", plan.policeTranslation],
    ["hub30", plan.hubTranslation],
  ] as [string, number[]][]) {
    const move = (p: Point): Point => [p[0] + delta[0], p[1] + delta[1]];
    for (const b of geo.buildings.filter((b: any) => b.placeId === id))
      b.footprint = b.footprint.map(move);
    for (const site of geo.transportSites.filter(
      (b: any) => b.placeId === id,
    )) {
      site.footprint = site.footprint.map(move);
      site.center = move(site.center);
      site.entry = move(site.entry);
      site.road = geo.nearestRoad(site.entry).point;
    }
    for (const path of geo.walkways.filter((b: any) => b.placeId === id))
      path.points = path.points.map(move);
    for (const site of geo.forecourts.filter((b: any) => b.placeId === id)) {
      site.footprint = site.footprint.map(move);
      site.entry = move(site.entry);
      site.road = geo.nearestRoad(site.entry).point;
    }
    const spawn = geo.spawns.find((s: any) => s.id === id);
    if (spawn) spawn.point = geo.nearestRoad(move(spawn.point)).point;
  }
  const mainBase =
    Math.min(
      ...plan.blocks
        .filter(
          (b) => b.placeId === "services" && b.kind !== "services-pavilion",
        )
        .flatMap((b) => b.footprint.map((p) => geo.height(...point(p)))),
    ) - 0.15;
  for (const b of plan.blocks) {
    const fp = b.footprint.map(point);
    const base =
      b.placeId === "services" && b.kind !== "services-pavilion"
        ? mainBase
        : Math.min(...fp.map((p) => geo.height(...p))) - 0.15;
    geo.buildings.push({
      ...b,
      footprint: fp,
      fixedBase: base + b.baseOffset,
      traced: true,
    });
  }
  for (const path of plan.walkways)
    geo.walkways.push({ ...path, points: path.points.map(point) });
  // Exterior connections are game paths checked at full walking width against existing bodies.
  for (const [id, pixel] of [
    ["services", [509, 301]],
    ["services", [831, 239]],
    ["industry", [470, 910]],
  ] as [string, number[]][]) {
    const entry = point(pixel);
    const candidates = geo.segments
      .map((s: any) => closest(entry, s.a, s.b))
      .sort((a: Point, b: Point) => distance(a, entry) - distance(b, entry));
    const target = candidates.find((r: Point) => {
      const len = distance(entry, r),
        n = Math.ceil(len / 0.8);
      return Array.from({ length: n + 1 }, (_, k) => k / n).every((t) =>
        [-1.7, 0, 1.7].every((side) => {
          const p: Point = [
            entry[0] + (r[0] - entry[0]) * t - ((r[1] - entry[1]) / len) * side,
            entry[1] + (r[1] - entry[1]) * t + ((r[0] - entry[0]) / len) * side,
          ];
          return (
            inside(p, geo.land) &&
            !geo.buildings.some(
              (b: any) =>
                inside(p, b.footprint) &&
                (b.fixedBase ?? geo.height(...p)) < geo.height(...p) + 2.2,
            )
          );
        }),
      );
    });
    if (target)
      geo.walkways.push({
        placeId: id,
        name: `${id === "services" ? "A28" : "A29"}道路接入口 ${pixel[0]}`,
        width: 2.8,
        points: [entry, target],
      });
  }
  // Runtime map labels and arrival headings must follow the registered exteriors.
  const destinations: Record<string, Point> = {
    services: point([630, 500]),
    industry: point([710, 775]),
  };
  for (const id of ["police", "hub30"]) {
    const ps: Point[] = geo.buildings
      .filter((b: any) => b.placeId === id)
      .flatMap((b: any) => b.footprint);
    destinations[id] = [
      (Math.min(...ps.map((p) => p[0])) + Math.max(...ps.map((p) => p[0]))) / 2,
      (Math.min(...ps.map((p) => p[1])) + Math.max(...ps.map((p) => p[1]))) / 2,
    ];
  }
  for (const [id, p] of Object.entries(destinations)) {
    data.places.find((p) => p.id === id)!.point = toMap(p);
    const entry = geo.walkways.find(
      (w: any) => w.placeId === id && w.name.includes("道路接入口"),
    );
    geo.spawns.find((s: any) => s.id === id)!.point = entry
      ? entry.points[entry.points.length - 1]
      : geo.nearestRoad(p).point;
  }
  geo.servicesIndustryRegistration = {
    translation: plan.translation,
    metresPerPixel: plan.metresPerPixel,
    method: plan.calibration.method,
  };
}
