import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
const root = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, ""),
  server = await createServer({ root, server: { middlewareMode: true } }),
  g = await server.ssrLoadModule("/src/world-geometry.ts"),
  r = await server.ssrLoadModule("/src/refinement.ts");
const read = (p) => JSON.parse(fs.readFileSync(root + "/public/" + p)),
  data = read("overall/data.json"),
  plans = read("refined-plans.json"),
  geo = g.geometry(data, read("campus.json")),
  reg = r.refine(geo, data, plans).find((x) => x.id === "canteen");
const b = geo.buildings.find((b) => b.placeId === "canteen"),
  fp = b.footprint,
  sign = Math.sign(
    fp.reduce(
      (s, p, i) =>
        s +
        p[0] * fp[(i + 1) % fp.length][1] -
        fp[(i + 1) % fp.length][0] * p[1],
      0,
    ),
  );
const lengths = fp.map((p, i) => g.distance(p, fp[(i + 1) % fp.length])),
  k = lengths.indexOf(Math.max(...lengths)),
  a = fp[k],
  c = fp[(k + 1) % fp.length],
  len = lengths[k],
  dx = (c[0] - a[0]) / len,
  dz = (c[1] - a[1]) / len,
  nx = dz * sign,
  nz = -dx * sign;
const start = [(a[0] + c[0]) / 2 + nx * 2.4, (a[1] + c[1]) / 2 + nz * 2.4],
  front = [start[0] + nx * 5, start[1] + nz * 5];
const clear = (a, b) => {
  const len = g.distance(a, b),
    n = Math.ceil(len / 0.5),
    dx = (b[0] - a[0]) / len,
    dz = (b[1] - a[1]) / len;
  for (let j = 0; j <= n; j++)
    for (const side of [-1, 0, 1]) {
      const p = [
        a[0] + (dx * len * j) / n - dz * 1.6 * side,
        a[1] + (dz * len * j) / n + dx * 1.6 * side,
      ];
      if (
        !g.inside(p, geo.land) ||
        geo.buildings.some((b) => g.inside(p, b.footprint))
      )
        return false;
    }
  return true;
};
let choices = [];
for (const s of geo.segments) {
  const q = g.closest(front, s.a, s.b);
  if (clear(start, front) && clear(front, q))
    choices.push({ q, len: g.distance(front, q) });
}
choices.sort((a, b) => a.len - b.len);
if (!choices.length) throw Error("No clear canteen entrance route");
const p = choices[0],
  origin = g
    .toWorld(data.places.find((p) => p.id === "canteen").point)
    .map((v, i) => v + reg.translation[i]);
plans.canteen.walkways = [
  {
    name: "食堂照片参考入口道路步道",
    width: 2.8,
    points: [start, front, p.q].map((p) =>
      p.map((v, i) => +(v - origin[i]).toFixed(3)),
    ),
  },
];
fs.writeFileSync(
  root + "/public/refined-plans.json",
  JSON.stringify(plans, null, 2) + "\n",
);
console.log({ registration: reg.translation, pathLength: p.len + 5 });
await server.close();
