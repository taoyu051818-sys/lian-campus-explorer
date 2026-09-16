import {
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Scene,
} from "@babylonjs/core";
import type { Point } from "./world-geometry";
import type { RefinedBuilding } from "./refinement";
// The boundary is surveyed; these building details are estimated from a single illustration.
export function createHospitalDetails(
  scene: Scene,
  volume: (
    name: string,
    fp: Point[],
    height: number,
    base: number,
    mat: StandardMaterial,
  ) => Mesh,
) {
  const mat = (name: string, c: string) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(c);
    m.specularColor.set(0.1, 0.1, 0.1);
    return m;
  };
  const ivory = mat("hospital warm white fins", "#e9e9de"),
    glass = mat("hospital recessed glazing", "#4b717b"),
    stone = mat("hospital pale plinth", "#bfc7be"),
    roof = mat("hospital roof grey", "#aebfc4"),
    solar = mat("hospital roof blue panels", "#66899d"),
    green = mat("hospital planted terrace", "#648348"),
    leaf = mat("hospital low terrace foliage", "#7b9654"),
    blue = mat("hospital entrance sign", "#447b92");
  return (b: RefinedBuilding, base: number) => {
    if (!b.kind?.startsWith("hospital-")) return;
    const fp = b.footprint,
      c: Point = [
        fp.reduce((s, p) => s + p[0], 0) / fp.length,
        fp.reduce((s, p) => s + p[1], 0) / fp.length,
      ],
      angle = Math.atan2(fp[1][1] - fp[0][1], fp[1][0] - fp[0][0]),
      w = Math.hypot(fp[1][0] - fp[0][0], fp[1][1] - fp[0][1]),
      d = Math.hypot(fp[2][0] - fp[1][0], fp[2][1] - fp[1][1]);
    const parts: Mesh[] = [],
      p = (x: number, z: number): Point => [
        c[0] + x * Math.cos(angle) - z * Math.sin(angle),
        c[1] + x * Math.sin(angle) + z * Math.cos(angle),
      ];
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
      const q = p(x, z),
        mesh = MeshBuilder.CreateBox(name, { width, height: h, depth }, scene);
      mesh.position.set(q[0], base + y, q[1]);
      mesh.rotation.y = -angle;
      mesh.material = m;
      parts.push(mesh);
      return mesh;
    };
    parts.push(
      volume(
        "hospital glass envelope",
        fp.map((q) => [
          c[0] + (q[0] - c[0]) * 1.006,
          c[1] + (q[1] - c[1]) * 1.006,
        ]),
        b.height,
        base,
        glass,
      ),
    );
    box(
      "hospital grounded plinth",
      0,
      0,
      w + 0.16,
      0.55,
      d + 0.16,
      0.275,
      stone,
    );
    const main = b.kind === "hospital-main",
      garden = b.kind === "hospital-garden",
      start = main ? 4.2 : 0.4;
    for (const side of [-1, 1]) {
      const count = Math.round(w / (main ? 1.9 : 2.8));
      for (let i = 0; i <= count; i++)
        box(
          main ? "hospital tall vertical sunshade" : "hospital glazing mullion",
          (i / count - 0.5) * w,
          side * (d / 2 + 0.25),
          main ? 0.68 : 0.17,
          b.height - start,
          main ? 1.05 : 0.35,
          start + (b.height - start) / 2,
          ivory,
        );
      for (let f = 1; f < b.floors!; f++)
        box(
          "hospital recessed spandrel",
          0,
          side * (d / 2 + 0.08),
          w,
          0.55,
          0.16,
          (f * b.height) / b.floors!,
          stone,
        );
    }
    for (const side of [-1, 1])
      for (let i = 0; i <= Math.ceil(d / 2); i++)
        box(
          "hospital return facade fin",
          side * (w / 2 + 0.23),
          (i / Math.ceil(d / 2) - 0.5) * d,
          0.75,
          b.height - start,
          0.35,
          start + (b.height - start) / 2,
          ivory,
        );
    box(
      "hospital flat roof",
      0,
      0,
      w + 0.5,
      0.2,
      d + 0.5,
      b.height + 0.35,
      roof,
    );
    for (const side of [-1, 1]) {
      box(
        "hospital roof parapet",
        0,
        side * (d / 2 + 0.06),
        w + 0.35,
        0.6,
        0.24,
        b.height + 0.65,
        ivory,
      );
      box(
        "hospital end parapet",
        side * (w / 2 + 0.06),
        0,
        0.24,
        0.6,
        d + 0.35,
        b.height + 0.65,
        ivory,
      );
    }
    if (main) {
      for (const x of [-w / 2 + 5, w / 2 - 5]) {
        box(
          "hospital rooftop service core",
          x,
          1,
          5.5,
          2.2,
          4.8,
          b.height + 1.5,
          ivory,
        );
        box("hospital core cap", x, 1, 5.8, 0.16, 5.1, b.height + 2.68, roof);
      }
      for (let x = -w / 2 + 10; x < w / 2 - 8; x += 3.2) {
        const panel = box(
          "hospital roof blue module",
          x,
          -3,
          3.05,
          0.12,
          5,
          b.height + 0.54,
          solar,
        );
        panel.rotation.x = 0.05;
      }
    } else if (garden) {
      box(
        "hospital planted roof bed",
        0,
        0,
        w - 1.3,
        0.28,
        d - 1.2,
        b.height + 0.6,
        green,
      );
      // Short irregular leaf clumps sit below the parapet; no trunks or spherical tree crowns.
      for (let i = 0; i < 95; i++) {
        const x = ((Math.sin(i * 12.9898) * 43758.5453) % 1) * (w / 2 - 1),
          z = ((Math.sin(i * 7.233) * 17358.21) % 1) * (d / 2 - 0.8),
          h = 0.18 + 0.2 * Math.abs(Math.sin(i * 3.3));
        const tuft = box(
          "hospital low terrace shrub",
          x,
          z,
          0.45 + 0.2 * Math.abs(Math.cos(i)),
          h,
          0.35,
          b.height + 0.8 + h / 2,
          i % 3 ? leaf : green,
        );
        tuft.rotation.y += i * 1.7;
      }
      box(
        "hospital garden balcony fascia",
        0,
        -d / 2 - 0.28,
        w + 0.6,
        0.72,
        0.42,
        b.height + 0.55,
        ivory,
      );
    } else {
      if (b.kind === "hospital-entry") {
        box(
          "hospital entrance canopy",
          0,
          -d / 2 - 1.4,
          w + 1.6,
          0.22,
          3.1,
          3.3,
          ivory,
        );
        box(
          "hospital entrance sign panel",
          0,
          -d / 2 - 0.31,
          2.1,
          1.6,
          0.18,
          5.6,
          blue,
        );
        box(
          "hospital white wayfinding cross horizontal",
          0,
          -d / 2 - 0.42,
          1.15,
          0.26,
          0.08,
          5.6,
          ivory,
        );
        box(
          "hospital white wayfinding cross vertical",
          0,
          -d / 2 - 0.42,
          0.26,
          1.1,
          0.08,
          5.6,
          ivory,
        );
      } else {
        box(
          "hospital annex service core",
          0,
          1,
          3.2,
          1.5,
          3,
          b.height + 1.05,
          ivory,
        );
      }
    }
    const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, true)!;
    merged.name = "hospital facade " + b.name;
    merged.isPickable = false;
    return merged;
  };
}
