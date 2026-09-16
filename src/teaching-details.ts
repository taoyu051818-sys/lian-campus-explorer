import {
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Scene,
} from "@babylonjs/core";
import { distance, inside, type Point } from "./world-geometry";
import type { RefinedBuilding } from "./refinement";

// Exterior motifs from the supplied south aerial rendering. Modules are estimates.
export function createTeachingDetails(
  scene: Scene,
  volume: (
    name: string,
    fp: Point[],
    h: number,
    base: number,
    mat: StandardMaterial,
  ) => Mesh,
) {
  const mat = (name: string, color: string) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(color);
    m.specularColor.set(0.08, 0.08, 0.08);
    return m;
  };
  const ivory = mat("teaching pale terrace fascia", "#e6e7df"),
    glass = mat("teaching continuous shaded glazing", "#405a65"),
    warm = mat("teaching warm fins", "#b79772"),
    green = mat("teaching low roof planting", "#637e4a"),
    blue = mat("teaching stadium seats", "#547eac"),
    dark = mat("teaching roof perforations", "#a2b4bf");
  return (b: RefinedBuilding, base: number): Mesh | undefined => {
    if (!b.kind?.startsWith("teaching-")) return;
    const parts: Mesh[] = [],
      fp = b.footprint;
    const box = (
      name: string,
      x: number,
      z: number,
      y: number,
      w: number,
      h: number,
      d: number,
      angle: number,
      m: StandardMaterial,
    ) => {
      const mesh = MeshBuilder.CreateBox(
        name,
        { width: w, height: h, depth: d },
        scene,
      );
      mesh.position.set(x, base + y, z);
      mesh.rotation.y = angle;
      mesh.material = m;
      parts.push(mesh);
      return mesh;
    };
    if (b.kind === "teaching-pier") {
      parts.push(volume("teaching bridge support", fp, b.height, base, ivory));
    } else if (b.kind === "teaching-stand") {
      const c = (b as any).stadiumCenter as Point,
        a = (b as any).arcStart as number,
        e = (b as any).arcEnd as number;
      const ring = (r: number, t: number): Point => [
        c[0] + Math.sin(t) * r,
        c[1] + Math.cos(t) * r + Math.sign(Math.cos(t)) * 46,
      ];
      const band = (r1: number, r2: number) => [
        ...Array.from({ length: 49 }, (_, i) =>
          ring(r2, a + ((e - a) * i) / 48),
        ),
        ...Array.from({ length: 49 }, (_, i) =>
          ring(r1, e - ((e - a) * i) / 48),
        ),
      ];
      for (let t = 0; t < 10; t++) {
        parts.push(
          volume(
            "A79 seating terrace",
            band(51 + t * 1.25, 52.25 + t * 1.25),
            0.42,
            base + 3.42 + t * 0.61,
            ivory,
          ),
        );
        parts.push(
          volume(
            "A79 blue seating row",
            band(51.2 + t * 1.25, 51.8 + t * 1.25),
            0.48,
            base + 3.83 + t * 0.61,
            blue,
          ),
        );
      }
      // Split canopies and open ends retain views through the stadium.
      parts.push(
        volume(
          "A79 white spectator canopy",
          band(61.5, 67),
          0.45,
          base + 14.9,
          ivory,
        ),
      );
      for (let i = 0; i <= 20; i++) {
        const p = ring(65.5, a + ((e - a) * i) / 20);
        box("A79 canopy column", ...p, 9.1, 0.38, 11.8, 0.38, 0, ivory);
      }
    } else if (b.kind === "teaching-bridge") {
      // Only the two long sides get rails; segment joints remain unobstructed.
      for (const [a, c] of [
        [fp[0], fp[1]],
        [fp[2], fp[3]],
      ]) {
        const l = distance(a, c),
          angle = -Math.atan2(c[1] - a[1], c[0] - a[0]);
        box(
          "bridge continuous handrail",
          (a[0] + c[0]) / 2,
          (a[1] + c[1]) / 2,
          1.8,
          l,
          0.1,
          0.1,
          angle,
          ivory,
        );
        const count = Math.ceil(l / 2.4);
        for (let j = 0; j <= count; j++)
          box(
            "bridge rail post",
            a[0] + ((c[0] - a[0]) * j) / count,
            a[1] + ((c[1] - a[1]) * j) / count,
            1.19,
            0.09,
            1.08,
            0.09,
            angle,
            ivory,
          );
      }
      parts.push(
        volume(
          "bridge pale walking deck",
          fp,
          0.08,
          base + b.height + 0.03,
          ivory,
        ),
      );
    } else {
      parts.push(
        volume("teaching recessed exterior", fp, b.height, base, glass),
      );
      const n = b.floors || 1,
        fh = b.height / n;
      const signed = fp.reduce(
        (s, p, i) =>
          s +
          p[0] * fp[(i + 1) % fp.length][1] -
          fp[(i + 1) % fp.length][0] * p[1],
        0,
      );
      for (let i = 0; i < fp.length; i++) {
        const a = fp[i],
          c = fp[(i + 1) % fp.length],
          len = distance(a, c);
        if (len < 0.2) continue;
        const dx = (c[0] - a[0]) / len,
          dz = (c[1] - a[1]) / len,
          nx = signed > 0 ? dz : -dz,
          nz = signed > 0 ? -dx : dx,
          angle = -Math.atan2(dz, dx);
        const edge = (
          name: string,
          t: number,
          y: number,
          w: number,
          h: number,
          d: number,
          m: StandardMaterial,
          off = 0.12,
        ) =>
          box(
            name,
            a[0] + dx * len * t + nx * off,
            a[1] + dz * len * t + nz * off,
            y,
            w,
            h,
            d,
            angle,
            m,
          );
        for (let f = 0; f <= n; f++)
          edge(
            "continuous white terrace band",
            0.5,
            f * fh,
            len,
            0.48,
            0.8,
            ivory,
            0.15,
          );
        const count = Math.max(1, Math.floor(len / 4));
        for (let j = 0; j < count; j++) {
          edge(
            "teaching glazing mullion",
            (j + 0.5) / count,
            b.height / 2,
            0.12,
            b.height,
            0.17,
            ivory,
          );
          if (j % 3 === 0)
            edge(
              "teaching warm vertical screen",
              (j + 0.5) / count,
              b.height / 2,
              0.6,
              b.height - 0.7,
              0.22,
              warm,
              0.27,
            );
        }
        if (b.kind !== "teaching-podium")
          edge(
            "teaching roof edge",
            0.5,
            b.height + 0.2,
            len,
            0.4,
            0.45,
            ivory,
          );
        if (b.kind === "teaching-wing" && len > 12) {
          for (let f = 1; f < n; f += 2) {
            edge(
              "teaching terrace planter",
              0.58,
              f * fh + 0.45,
              Math.min(6, len * 0.35),
              0.5,
              0.65,
              ivory,
              0.35,
            );
            edge(
              "teaching terrace shrubs",
              0.58,
              f * fh + 0.86,
              Math.min(5.8, len * 0.34),
              0.34,
              0.6,
              green,
              0.35,
            );
          }
        }
      }
      if (b.kind === "teaching-hall") {
        parts.push(
          volume(
            "low public hall planted roof",
            fp,
            0.28,
            base + b.height + 0.3,
            green,
          ),
        );
      } else if (b.kind === "teaching-wing") {
        parts.push(
          volume(
            "teaching pale roof canopy",
            fp,
            0.28,
            base + b.height + 0.3,
            ivory,
          ),
        );
        const xs = fp.map((p) => p[0]),
          zs = fp.map((p) => p[1]);
        for (let x = Math.min(...xs) + 1.5; x < Math.max(...xs) - 1.5; x += 3.2)
          for (
            let z = Math.min(...zs) + 1.5;
            z < Math.max(...zs) - 1.5;
            z += 3.2
          ) {
            const corners: Point[] = [
              [x - 0.5, z - 0.8],
              [x + 0.5, z - 0.8],
              [x + 0.5, z + 0.8],
              [x - 0.5, z + 0.8],
            ];
            if (corners.every((p) => inside(p, fp)))
              parts.push(
                volume(
                  "canopy patterned inset",
                  corners,
                  0.025,
                  base + b.height + 0.6,
                  dark,
                ),
              );
          }
      }
    }
    if (!parts.length) return;
    const mesh = Mesh.MergeMeshes(parts, true, true, undefined, false, true)!;
    mesh.name = "teaching planning exterior " + b.name;
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
    return mesh;
  };
}
