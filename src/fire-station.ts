import {
  Mesh,
  MeshBuilder,
  VertexData,
  StandardMaterial,
  Color3,
  Scene,
} from "@babylonjs/core";
import type { Point } from "./world-geometry";
import type { RefinedBuilding } from "./refinement";
const mat = (scene: Scene, name: string, c: string) => {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(c);
  m.specularColor.set(0.1, 0.1, 0.1);
  return m;
};
export function createFireDetails(
  scene: Scene,
  volume: (
    name: string,
    fp: Point[],
    height: number,
    base: number,
    mat: StandardMaterial,
  ) => Mesh,
) {
  const red = mat(scene, "fire station brick red", "#ac5b48"),
    white = mat(scene, "fire station ivory frame", "#e3e5dc"),
    glass = mat(scene, "fire station blue glazing", "#3f5c69"),
    dark = mat(scene, "fire station garage doors", "#4e5757"),
    grey = mat(scene, "fire station flat roof", "#a8b6b5"),
    blue = mat(scene, "fire station blue fascia", "#446c89");
  return (b: RefinedBuilding, base: number) => {
    if (!b.kind?.startsWith("fire-")) return;
    const fp = b.footprint,
      parts: Mesh[] = [],
      c: Point = [
        fp.reduce((s, p) => s + p[0], 0) / 4,
        fp.reduce((s, p) => s + p[1], 0) / 4,
      ],
      w = Math.hypot(fp[1][0] - fp[0][0], fp[1][1] - fp[0][1]),
      d = Math.hypot(fp[2][0] - fp[1][0], fp[2][1] - fp[1][1]),
      a = Math.atan2(fp[1][1] - fp[0][1], fp[1][0] - fp[0][0]);
    const box = (
      name: string,
      x: number,
      z: number,
      width: number,
      h: number,
      depth: number,
      y: number,
      m: StandardMaterial,
    ) => {
      const mesh = MeshBuilder.CreateBox(
        name,
        { width, height: h, depth },
        scene,
      );
      mesh.position.set(
        c[0] + x * Math.cos(a) - z * Math.sin(a),
        base + y,
        c[1] + x * Math.sin(a) + z * Math.cos(a),
      );
      mesh.rotation.y = -a;
      mesh.material = m;
      parts.push(mesh);
      return mesh;
    };
    parts.push(
      volume(
        "fire red facade skin",
        fp.map((p) => [
          c[0] + (p[0] - c[0]) * 1.004,
          c[1] + (p[1] - c[1]) * 1.004,
        ]),
        b.height,
        base,
        red,
      ),
    );
    box("fire roof cap", 0, 0, w + 0.3, 0.2, d + 0.3, b.height + 0.36, grey);
    for (const s of [-1, 1]) {
      box(
        "fire roof edge",
        0,
        (s * d) / 2,
        w + 0.35,
        0.5,
        0.24,
        b.height + 0.65,
        red,
      );
      box(
        "fire roof return edge",
        (s * w) / 2,
        0,
        0.24,
        0.5,
        d + 0.35,
        b.height + 0.65,
        red,
      );
    }
    if (b.kind === "fire-main") {
      // Closed garage doors retain the main building collider; interiors are not modelled yet.
      for (let i = 0; i < 6; i++) {
        const x = (i - 2.5) * 5.2;
        box(
          "fire garage dark door",
          x,
          d / 2 + 0.13,
          4.5,
          4.5,
          0.18,
          2.4,
          dark,
        );
        for (let j = 0; j < 7; j++)
          box(
            "fire garage door panel seam",
            x,
            d / 2 + 0.24,
            4.42,
            0.04,
            0.04,
            0.8 + j * 0.5,
            grey,
          );
        box(
          "fire garage door high glazing",
          x,
          d / 2 + 0.26,
          3.9,
          0.8,
          0.07,
          3.8,
          glass,
        );
        box(
          "fire garage front pier",
          x - 2.5,
          d / 2 + 0.38,
          0.45,
          5,
          0.6,
          2.5,
          white,
        );
      }
      box("fire garage end pier", 15.5, d / 2 + 0.38, 0.45, 5, 0.6, 2.5, white);
      box(
        "fire garage canopy fascia",
        0,
        d / 2 + 0.75,
        35,
        0.5,
        1.6,
        5.15,
        white,
      );
      box(
        "fire upper front window band",
        0,
        d / 2 + 0.16,
        w - 2,
        1.6,
        0.19,
        6.65,
        glass,
      );
      for (let x = -w / 2 + 1; x < w / 2; x += 1.6)
        box(
          "fire upper window mullion",
          x,
          d / 2 + 0.28,
          0.09,
          1.65,
          0.12,
          6.65,
          white,
        );
      box("fire blue front band", 0, d / 2 + 0.2, w - 1, 0.38, 0.2, 7.8, blue);
      for (const s of [-1, 1])
        box(
          "fire pale corner block",
          s * (w / 2 - 2),
          d / 2 + 0.16,
          3.8,
          5.3,
          0.22,
          2.65,
          white,
        );
    }
    for (const s of [-1, 1]) {
      if (b.kind === "fire-main" && s === 1) continue;
      for (let f = 0; f < b.floors!; f++) {
        const y = ((f + 0.57) * b.height) / b.floors!,
          n = Math.max(1, Math.floor(w / (b.kind === "fire-tower" ? 4 : 3.5)));
        for (let j = 0; j < n; j++)
          box(
            "fire rear and tower window",
            ((j + 0.5) * w) / n - w / 2,
            s * (d / 2 + 0.13),
            (w / n) * 0.7,
            b.kind === "fire-tower" ? 1.3 : 1.4,
            0.16,
            y,
            glass,
          );
        if (b.kind === "fire-tower")
          box(
            "fire training ledge",
            0,
            s * (d / 2 + 0.3),
            w + 0.25,
            0.15,
            0.8,
            y - 0.85,
            white,
          );
      }
    }
    for (const s of [-1, 1])
      for (let f = 0; f < b.floors!; f++)
        box(
          "fire end window",
          s * (w / 2 + 0.14),
          0,
          0.18,
          1.15,
          d * 0.42,
          ((f + 0.6) * b.height) / b.floors!,
          glass,
        );
    if (b.kind === "fire-rear") {
      for (const x of [-8, 0, 8])
        box("fire roof equipment", x, 0, 3, 0.65, 2.5, b.height + 0.8, grey);
      box("fire rear roof access", 10, 1, 3.6, 1.4, 3, b.height + 1.1, white);
    }
    const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, true)!;
    merged.name = "fire station facade " + b.name;
    merged.isPickable = false;
    return merged;
  };
}
export function createForecourts(scene: Scene, geo: any) {
  const pavement = mat(scene, "fire forecourt paving", "#929e99"),
    red = mat(scene, "fire training lane surface", "#a36350"),
    line = mat(scene, "fire training lane marks", "#e5e5d8"),
    parts: Mesh[] = [];
  const surface = (fp: Point[], m: StandardMaterial, offset = 0.3) => {
    const ps = fp.flatMap((p) => [p[0], geo.height(...p) + offset, p[1]]),
      ix = [0, 2, 1, 0, 3, 2],
      ns: number[] = [];
    VertexData.ComputeNormals(ps, ix, ns);
    if (ns[1] < 0) {
      ix.splice(0, 6, 0, 1, 2, 0, 2, 3);
      VertexData.ComputeNormals(ps, ix, ns);
    }
    const vd = new VertexData();
    vd.positions = ps;
    vd.normals = ns;
    vd.indices = ix;
    vd.uvs = new Array(8).fill(0);
    const mesh = new Mesh("fire forecourt surface", scene);
    vd.applyToMesh(mesh);
    mesh.material = m;
    parts.push(mesh);
  };
  for (const court of geo.forecourts) {
    const [a, b, , d] = court.footprint as Point[],
      p = (u: number, v: number): Point => [
        a[0] + (b[0] - a[0]) * u + (d[0] - a[0]) * v,
        a[1] + (b[1] - a[1]) * u + (d[1] - a[1]) * v,
      ];
    for (let i = 0; i < 25; i++)
      for (let j = 0; j < 9; j++)
        surface(
          [
            p(i / 25, j / 9),
            p((i + 1) / 25, j / 9),
            p((i + 1) / 25, (j + 1) / 9),
            p(i / 25, (j + 1) / 9),
          ],
          pavement,
        );
    for (let i = 0; i < 25; i++) {
      surface(
        [
          p(i / 25, 0.2),
          p((i + 1) / 25, 0.2),
          p((i + 1) / 25, 0.48),
          p(i / 25, 0.48),
        ],
        red,
        0.32,
      );
      for (let j = 0; j < 5; j++)
        surface(
          [
            p(i / 25, 0.2 + j * 0.07),
            p((i + 1) / 25, 0.2 + j * 0.07),
            p((i + 1) / 25, 0.203 + j * 0.07),
            p(i / 25, 0.203 + j * 0.07),
          ],
          line,
          0.35,
        );
    }
    const e = court.entry as Point,
      r = court.road as Point,
      dx = r[0] - e[0],
      dz = r[1] - e[1],
      len = Math.hypot(dx, dz),
      n = Math.max(1, Math.ceil(len / 2));
    if (len > 0.1)
      for (let i = 0; i < n; i++) {
        const q = (t: number, s: number): Point => [
          e[0] + dx * t - (dz / len) * 3 * s,
          e[1] + dz * t + (dx / len) * 3 * s,
        ];
        surface(
          [q(i / n, -1), q((i + 1) / n, -1), q((i + 1) / n, 1), q(i / n, 1)],
          pavement,
          0.33,
        );
      }
  }
  if (!parts.length) return;
  const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, true)!;
  merged.name = "fire station forecourt and road approach";
  merged.isPickable = false;
  return merged;
}
