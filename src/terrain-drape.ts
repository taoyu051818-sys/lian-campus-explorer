type Point = [number, number];
// Clip surface polygons to the terrain's actual triangles. Merely sampling the
// ribbon edges lets a wide road cut through a ridge between its edge vertices.
export function drapePolygon(
  polygon: Point[],
  height: (x: number, z: number) => number,
  offset: number,
  step = 20,
) {
  const position: number[] = [],
    index: number[] = [];
  const cross = (a: Point, b: Point, p: Point) =>
    (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  function clip(poly: Point[], a: Point, b: Point) {
    const out: Point[] = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i],
        q = poly[(i + 1) % poly.length],
        d = cross(a, b, p),
        e = cross(a, b, q);
      if (d >= -1e-8) out.push(p);
      if (d >= 0 !== e >= 0) {
        const t = d / (d - e);
        out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
    return out;
  }
  const minX = Math.floor(Math.min(...polygon.map((p) => p[0])) / step) * step,
    maxX = Math.ceil(Math.max(...polygon.map((p) => p[0])) / step) * step;
  const minZ = Math.floor(Math.min(...polygon.map((p) => p[1])) / step) * step,
    maxZ = Math.ceil(Math.max(...polygon.map((p) => p[1])) / step) * step;
  for (let x = minX; x < maxX; x += step)
    for (let z = minZ; z < maxZ; z += step) {
      const a: Point = [x, z],
        b: Point = [x + step, z],
        c: Point = [x, z + step],
        d: Point = [x + step, z + step];
      for (const tri of [
        [a, b, c],
        [b, d, c],
      ]) {
        let poly = polygon;
        for (let i = 0; i < 3 && poly.length; i++)
          poly = clip(poly, tri[i], tri[(i + 1) % 3]);
        if (poly.length < 3) continue;
        const area = poly.reduce((sum, p, i) => {
          const q = poly[(i + 1) % poly.length];
          return sum + p[0] * q[1] - q[0] * p[1];
        }, 0);
        if (Math.abs(area) < 1e-7) continue;
        if (area < 0) poly.reverse();
        const start = position.length / 3;
        for (const p of poly) position.push(p[0], height(...p) + offset, p[1]);
        for (let i = 1; i < poly.length - 1; i++)
          if (Math.abs(cross(poly[0], poly[i], poly[i + 1])) > 1e-8)
            index.push(start, start + i, start + i + 1);
      }
    }
  return { position, index };
}
