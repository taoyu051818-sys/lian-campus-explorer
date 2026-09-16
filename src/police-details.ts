import {
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Scene,
} from "@babylonjs/core";
import type { Point } from "./world-geometry";
import type { RefinedBuilding } from "./refinement";
export function createPoliceDetails(
  scene: Scene,
  volume: (
    name: string,
    fp: Point[],
    height: number,
    base: number,
    mat: StandardMaterial,
  ) => Mesh,
) {
  const mat = (n: string, c: string) => {
    const m = new StandardMaterial(n, scene);
    m.diffuseColor = Color3.FromHexString(c);
    m.specularColor.set(0.08, 0.08, 0.08);
    return m;
  };
  const white = mat("police pale facade", "#e2e3d9"),
    blue = mat("police blue identity band", "#477d9e"),
    glass = mat("police recessed glazing", "#425c68"),
    recess = mat("police inset grey panels", "#7c898e"),
    roof = mat("police roof concrete", "#b9c3bd");
  return (b: RefinedBuilding, base: number) => {
    if (b.kind !== "police") return;
    const fp = b.footprint,
      c: Point = [
        fp.reduce((s, p) => s + p[0], 0) / fp.length,
        fp.reduce((s, p) => s + p[1], 0) / fp.length,
      ],
      parts: Mesh[] = [];
    // Keep the traced open courtyards: add only thin cladding and edge components.
    parts.push(
      volume(
        "police pale wall skin",
        fp.map((p) => [
          c[0] + (p[0] - c[0]) * 1.001,
          c[1] + (p[1] - c[1]) * 1.001,
        ]),
        b.height,
        base,
        white,
      ),
    );
    const signed = fp.reduce(
      (s, p, i) =>
        s +
        p[0] * fp[(i + 1) % fp.length][1] -
        fp[(i + 1) % fp.length][0] * p[1],
      0,
    );
    for (let i = 0; i < fp.length; i++) {
      const a = fp[i],
        q = fp[(i + 1) % fp.length],
        len = Math.hypot(q[0] - a[0], q[1] - a[1]),
        dx = (q[0] - a[0]) / len,
        dz = (q[1] - a[1]) / len,
        nx = signed > 0 ? dz : -dz,
        nz = signed > 0 ? -dx : dx,
        angle = Math.atan2(dz, dx);
      if (len < 0.2) continue;
      const box = (
        name: string,
        t: number,
        y: number,
        w: number,
        h: number,
        d: number,
        m: StandardMaterial,
        out = 0.18,
      ) => {
        const mesh = MeshBuilder.CreateBox(
          name,
          { width: w, height: h, depth: d },
          scene,
        );
        mesh.position.set(
          a[0] + dx * len * t + nx * out,
          base + y,
          a[1] + dz * len * t + nz * out,
        );
        mesh.rotation.y = -angle;
        mesh.material = m;
        parts.push(mesh);
      };
      const n = Math.max(1, Math.round(len / 2.6)),
        step = len / n;
      box("police continuous blue belt", 0.5, 3.95, len, 1.15, 0.2, blue, 0.2);
      for (let j = 0; j < n; j++) {
        const t = (j + 0.5) / n;
        box("police ground glazing", t, 1.8, step * 0.7, 2.4, 0.1, glass, 0.18);
        if (b.floors! > 1) {
          const h = b.height - 5.15;
          box(
            "police upper recessed panels",
            t,
            5.1 + h / 2,
            step * 0.83,
            h,
            0.1,
            recess,
            0.17,
          );
          for (let f = 1; f < b.floors!; f++)
            box(
              "police upper windows",
              t,
              ((f + 0.5) * b.height) / b.floors!,
              step * 0.66,
              1.45,
              0.12,
              glass,
              0.25,
            );
          box(
            "police tall white frame",
            j / n,
            5.0 + h / 2,
            0.28,
            h + 0.4,
            0.65,
            white,
            0.32,
          );
        }
      }
      box(
        "police roof parapet",
        0.5,
        b.height + 0.55,
        len + 0.15,
        0.5,
        0.24,
        white,
        0.08,
      );
      if (b.floors! > 1)
        box("police upper sill", 0.5, 4.9, len, 0.2, 0.45, white, 0.25);
    }
    parts.push(
      volume("police flat roof", fp, 0.16, base + b.height + 0.3, roof),
    );
    const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, true)!;
    merged.name = "police facade " + b.name;
    merged.isPickable = false;
    return merged;
  };
}
