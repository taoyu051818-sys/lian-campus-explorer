import fs from "node:fs";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, ""),
  s = await createServer({ root, server: { middlewareMode: true } }),
  g = await s.ssrLoadModule("/src/world-geometry.ts"),
  r = await s.ssrLoadModule("/src/refinement.ts");
const data = JSON.parse(fs.readFileSync(root + "/public/overall/data.json")),
  plans = JSON.parse(fs.readFileSync(root + "/public/refined-plans.json")),
  geo = g.geometry(
    data,
    JSON.parse(fs.readFileSync(root + "/public/campus.json")),
  ),
  reg = r.refine(geo, data, plans).find((x) => x.id === "dorm52");
const origin = g
  .toWorld(data.places.find((p) => p.id === "dorm52").point)
  .map((v, i) => v + reg.translation[i]);
const paths = geo.walkways.filter(
  (p) => p.placeId === "dorm52" && p.name !== "生活二区候选道路连接",
);
let candidates = [];
for (const path of paths.slice(4))
  for (const point of [path.points[0], path.points.at(-1)]) {
    const q = geo.nearestRoad(point).point,
      len = g.distance(point, q),
      dx = (q[0] - point[0]) / len,
      dz = (q[1] - point[1]) / len;
    let clear = true;
    for (let k = 0; k <= Math.ceil(len); k++)
      for (const side of [-1, 0, 1]) {
        const p = [
          point[0] + dx * k - dz * 1.6 * side,
          point[1] + dz * k + dx * 1.6 * side,
        ];
        if (
          !g.inside(p, geo.land) ||
          geo.buildings.some((b) => g.inside(p, b.footprint))
        )
          clear = false;
      }
    if (clear) candidates.push({ point, q, len });
  }
candidates.sort((a, b) => a.len - b.len);
if (!candidates.length) throw Error("No straight entrance route");
const a = candidates[0];
plans.dorm52.walkways = plans.dorm52.walkways.filter(
  (p) => p.name !== "生活二区候选道路连接",
);
plans.dorm52.walkways.push({
  name: "生活二区候选道路连接",
  width: 2.8,
  points: [a.point, a.q].map((p) =>
    p.map((v, i) => +(v - origin[i]).toFixed(3)),
  ),
});
fs.writeFileSync(
  root + "/public/refined-plans.json",
  JSON.stringify(plans, null, 2) + "\n",
);
console.log({
  registration: reg.translation,
  entranceLength: a.len,
  bodyCount: geo.buildings.length,
});
await s.close();
