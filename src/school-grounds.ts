import {
  Mesh,
  VertexData,
  StandardMaterial,
  Color3,
  Scene,
} from "@babylonjs/core";
import type { Point } from "./world-geometry";
export function createSchoolGrounds(scene: Scene, geo: any) {
  const material = (name: string, c: string) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(c);
    m.specularColor.set(0, 0, 0);
    return m;
  };
  const blue = material("school blue running track", "#508ca9"),
    grass = material("school sports turf", "#718e4b"),
    white = material("school field lines", "#ebece1"),
    court = material("outdoor ball court surface", "#648d88");
  white.zOffset = -4;
  const parts: Mesh[] = [];
  function polygon(fp: Point[], mat: StandardMaterial, offset: number) {
    const positions = fp.flatMap((p) => [
        p[0],
        geo.height(...p) + offset,
        p[1],
      ]),
      indices: number[] = [],
      normals: number[] = [];
    for (let i = 1; i < fp.length - 1; i++) indices.push(0, i, i + 1);
    VertexData.ComputeNormals(positions, indices, normals);
    if (normals.filter((_, i) => i % 3 === 1).reduce((s, n) => s + n, 0) < 0) {
      for (let i = 0; i < indices.length; i += 3)
        [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
      VertexData.ComputeNormals(positions, indices, normals);
    }
    const vd = new VertexData();
    vd.positions = positions;
    vd.indices = indices;
    vd.normals = normals;
    vd.uvs = new Array(fp.length * 2).fill(0);
    const mesh = new Mesh("school sports surface", scene);
    vd.applyToMesh(mesh);
    mesh.material = mat;
    mesh.isPickable = false;
    parts.push(mesh);
  }
  for (const g of geo.grounds) {
    if (g.kind?.startsWith("court-")) {
      const [a, b, , d] = g.footprint as Point[];
      const p = (u: number, v: number): Point => [
        a[0] + (b[0] - a[0]) * u + (d[0] - a[0]) * v,
        a[1] + (b[1] - a[1]) * u + (d[1] - a[1]) * v,
      ];
      const mark = (u: number, v: number, x: number, y: number) => {
        const a = p(u, v),
          b = p(x, y),
          length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (!length) return;
        const nx = (-(b[1] - a[1]) / length) * 0.06,
          nz = ((b[0] - a[0]) / length) * 0.06;
        polygon(
          [
            [a[0] + nx, a[1] + nz],
            [b[0] + nx, b[1] + nz],
            [b[0] - nx, b[1] - nz],
            [a[0] - nx, a[1] - nz],
          ],
          white,
          0.22,
        );
      };
      polygon(g.footprint, court, 0.15);
      mark(0.09, 0.07, 0.91, 0.07);
      mark(0.09, 0.93, 0.91, 0.93);
      mark(0.09, 0.07, 0.09, 0.93);
      mark(0.91, 0.07, 0.91, 0.93);
      mark(0.09, 0.5, 0.91, 0.5);
      if (g.kind === "court-tennis") {
        mark(0.22, 0.07, 0.22, 0.93);
        mark(0.78, 0.07, 0.78, 0.93);
        mark(0.22, 0.3, 0.78, 0.3);
        mark(0.22, 0.7, 0.78, 0.7);
        mark(0.5, 0.3, 0.5, 0.7);
      } else {
        for (const end of [0, 1]) {
          const near = end === 0 ? 0.07 : 0.93,
            far = end === 0 ? 0.25 : 0.75;
          mark(0.35, near, 0.35, far);
          mark(0.65, near, 0.65, far);
          mark(0.35, far, 0.65, far);
        }
        for (let i = 0; i < 32; i++) {
          const a = (i / 32) * Math.PI * 2,
            b = ((i + 1) / 32) * Math.PI * 2;
          mark(
            0.5 + Math.cos(a) * 0.12,
            0.5 + Math.sin(a) * 0.08,
            0.5 + Math.cos(b) * 0.12,
            0.5 + Math.sin(b) * 0.08,
          );
        }
      }
      continue;
    }
    const point = (x: number, y: number): Point => [
      g.center[0] + g.axis[1] * x + g.axis[0] * y,
      g.center[1] - g.axis[0] * x + g.axis[1] * y,
    ];
    const oval = (r: number): Point[] =>
      Array.from({ length: 129 }, (_, i) => {
        const a = (i / 128) * Math.PI * 2;
        return point(
          Math.sin(a) * r,
          Math.cos(a) * r + (Math.cos(a) >= 0 ? 1 : -1) * g.straightHalfLength,
        );
      });
    const ring = (a: Point[], b: Point[], mat: StandardMaterial, h: number) => {
      for (let i = 0; i < a.length - 1; i++)
        polygon([a[i], a[i + 1], b[i + 1], b[i]], mat, h);
    };
    polygon(oval(g.radius - 8).slice(0, -1), grass, 0.13);
    ring(oval(g.radius), oval(g.radius - 8), blue, 0.14);
    for (let i = 0; i <= 6; i++)
      ring(
        oval(g.radius - 8 + i * 1.2 + 0.07),
        oval(g.radius - 8 + i * 1.2),
        white,
        0.19,
      );
    const line = (a: Point, b: Point) => {
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]),
        nx = (-(b[1] - a[1]) / d) * 0.09,
        ny = ((b[0] - a[0]) / d) * 0.09;
      polygon(
        [
          [a[0] + nx, a[1] + ny],
          [b[0] + nx, b[1] + ny],
          [b[0] - nx, b[1] - ny],
          [a[0] - nx, a[1] - ny],
        ].map((p) => point(p[0], p[1])),
        white,
        0.2,
      );
    };
    for (const y of [-52.5, 0, 52.5]) line([-32, y], [32, y]);
    for (const x of [-32, 32]) line([x, -52.5], [x, 52.5]);
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2,
        b = ((i + 1) / 64) * Math.PI * 2;
      line(
        [Math.cos(a) * 9.15, Math.sin(a) * 9.15],
        [Math.cos(b) * 9.15, Math.sin(b) * 9.15],
      );
    }
    for (const s of [-1, 1]) {
      line([-20.15, s * 36], [20.15, s * 36]);
      for (const x of [-20.15, 20.15]) line([x, s * 36], [x, s * 52.5]);
    }
  }
  if (!parts.length) return;
  const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, true)!;
  merged.name = "school sports ground and markings";
  merged.isPickable = false;
  return merged;
}
