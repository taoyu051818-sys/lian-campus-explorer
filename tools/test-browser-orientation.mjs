import fs from "node:fs/promises";
import assert from "node:assert/strict";
const read = async (p) => JSON.parse(await fs.readFile(p));
const report = await read(process.argv[2]);
assert.equal(report.gpu.status, "passed");
assert.equal(report.errors.length, 0);
assert.equal(report.failed.length, 0);
const meta = await read("public/generated/campus.json"),
  data = await read("public/overall/data.json");
const expected = data.places.map((place, index) => {
  const blocks = meta.buildings.filter((b) => b.placeId === place.id),
    points = blocks.flatMap((b) => b.footprint);
  let x, z;
  if (points.length) {
    const xs = points.map((p) => p[0]),
      zs = points.map((p) => p[1]);
    x = (Math.min(...xs) + Math.max(...xs)) / 2;
    z = (Math.min(...zs) + Math.max(...zs)) / 2;
  } else {
    x = ((place.point[0] - 359) * 1000) / 190;
    z = ((870 - place.point[1]) * 1000) / 190;
  }
  const label = report.northUp[index];
  assert.equal(label?.name, place.name);
  return { map: [x, -z], screen: [label.x, label.y] };
});
const area = (a, b, c) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
let checks = 0;
for (let i = 0; i < expected.length - 2; i++)
  for (let j = i + 1; j < expected.length - 1; j++)
    for (let k = j + 1; k < expected.length; k++) {
      const p = [expected[i], expected[j], expected[k]],
        a = area(...p.map((p) => p.map)),
        b = area(...p.map((p) => p.screen));
      // Labels sit above roofs in a perspective camera. Near-collinear triples
      // can change sign under that height parallax without a coordinate reflection.
      const span2 = Math.max(
        ...p.flatMap((a) =>
          p.map((b) => (a.map[0] - b.map[0]) ** 2 + (a.map[1] - b.map[1]) ** 2),
        ),
      );
      if (Math.abs(a) < span2 * 0.1) continue;
      assert.equal(
        Math.sign(a),
        Math.sign(b),
        `Rendered landmarks mirrored: ${i},${j},${k}`,
      );
      checks++;
    }
for (let i = 0; i < expected.length; i++)
  for (let j = i + 1; j < expected.length; j++) {
    const a = expected[i],
      b = expected[j];
    for (let k = 0; k < 2; k++)
      if (Math.abs(a.map[k] - b.map[k]) > 50)
        assert.equal(
          Math.sign(a.map[k] - b.map[k]),
          Math.sign(a.screen[k] - b.screen[k]),
        );
  }
assert.ok(checks > 3000, "insufficient separated landmark triples");
console.log(
  JSON.stringify({
    status: "passed",
    renderedLabels: expected.length,
    signedTriangles: checks,
    axes: "east-right/north-up",
  }),
);
