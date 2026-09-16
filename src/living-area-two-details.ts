import {
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Scene,
} from "@babylonjs/core";
import { distance, type Point } from "./world-geometry";
import type { RefinedBuilding } from "./refinement";
// Official close photographs support six-floor white balcony grids and blue frames.
// Repetition, exact bay spacing and the candidate A52 registration remain estimates.
export function createLivingTwoDetails(
  scene: Scene,
  volume: (
    name: string,
    fp: Point[],
    h: number,
    base: number,
    mat: StandardMaterial,
  ) => Mesh,
) {
  const mat = (name: string, c: string) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(c);
    m.specularColor.set(0.08, 0.08, 0.08);
    return m;
  };
  const white = mat("living two ivory concrete grid", "#e7e9e3"),
    glass = mat("living two shaded window recess", "#344b56"),
    brick = mat("living two stair brick", "#9b6655"),
    roof = mat("living two flat roof", "#b4bdba"),
    accent = mat("living two cyan frames", "#248fac"),
    louver = mat("living two bronze privacy louvers", "#746e60"),
    railGlass = mat("living two balcony glass", "#7e9ba4"),
    metal = mat("living two slim balcony rails", "#c3d0d0");
  railGlass.alpha = 0.68;
  railGlass.backFaceCulling = false;
  return (b: RefinedBuilding, base: number): Mesh | undefined => {
    if (!b.kind?.startsWith("dorm52-")) return;
    const shared = b.kind === "dorm52-shared",
      fp = b.footprint,
      parts: Mesh[] = [],
      floors = b.floors || 1,
      fh = b.height / floors;
    const signed = fp.reduce(
      (s, p, i) =>
        s +
        p[0] * fp[(i + 1) % fp.length][1] -
        fp[(i + 1) % fp.length][0] * p[1],
      0,
    );
    parts.push(volume("living two shaded exterior", fp, b.height, base, glass));
    parts.push(
      volume("living two light roof", fp, 0.24, base + b.height + 0.12, roof),
    );
    for (let i = 0; i < fp.length; i++) {
      const a = fp[i],
        c = fp[(i + 1) % fp.length],
        len = distance(a, c);
      if (len < 0.4) continue;
      const dx = (c[0] - a[0]) / len,
        dz = (c[1] - a[1]) / len,
        nx = signed > 0 ? dz : -dz,
        nz = signed > 0 ? -dx : dx;
      const part = (
        name: string,
        t: number,
        y: number,
        w: number,
        h: number,
        d: number,
        m: StandardMaterial,
        off = 0.18,
        flat = false,
      ) => {
        const mesh = flat
          ? MeshBuilder.CreatePlane(
              name,
              { width: w, height: h, sideOrientation: Mesh.DOUBLESIDE },
              scene,
            )
          : MeshBuilder.CreateBox(
              name,
              { width: w, height: h, depth: d },
              scene,
            );
        mesh.position.set(
          a[0] + dx * len * t + nx * off,
          base + y,
          a[1] + dz * len * t + nz * off,
        );
        mesh.rotation.y = -Math.atan2(dz, dx);
        mesh.material = m;
        parts.push(mesh);
      };
      const bays = Math.max(1, Math.round(len / (shared ? 3.5 : 3.3))),
        bay = len / bays;
      for (let f = 0; f <= floors; f++)
        part(
          "white balcony slab",
          0.5,
          f * fh,
          len + 0.05,
          0.36,
          0.92,
          white,
          0.34,
        );
      for (let j = 0; j <= bays; j++)
        part(
          "full height balcony pier",
          j / bays,
          b.height / 2,
          0.22,
          b.height,
          0.9,
          white,
          0.36,
        );
      for (let f = 0; f < floors; f++) {
        if (f > 0) {
          part(
            "balcony continuous top rail",
            0.5,
            f * fh + 1.12,
            len,
            0.055,
            0.055,
            metal,
            0.83,
          );
          part(
            "balcony continuous lower rail",
            0.5,
            f * fh + 0.3,
            len,
            0.05,
            0.055,
            metal,
            0.83,
          );
        }
        for (let j = 0; j < bays; j++) {
          const t = (j + 0.5) / bays;
          part(
            "recessed room opening",
            t,
            f * fh + 1.72,
            bay * 0.66,
            2.3,
            0.02,
            glass,
            0.22,
            true,
          );
          if (f > 0)
            part(
              "balcony glazed guard",
              t,
              f * fh + 0.7,
              Math.max(0.12, bay - 0.3),
              0.78,
              0.025,
              railGlass,
              0.82,
              true,
            );
          if (!shared && len > 15) {
            const center = (j + 0.84) / bays;
            part(
              "privacy louver dark panel",
              center,
              f * fh + 1.87,
              bay * 0.23,
              2.68,
              0.025,
              louver,
              0.31,
              true,
            );
            for (let k = 0; k < 7; k++)
              part(
                "privacy louver blade",
                center,
                f * fh + 0.64 + k * 0.37,
                bay * 0.23,
                0.045,
                0.035,
                white,
                0.345,
                true,
              );
          }
        }
      }
      part(
        "solid white roof parapet",
        0.5,
        b.height + 0.49,
        len,
        0.8,
        0.46,
        white,
        0.16,
      );
      if (!shared && len > 35) {
        for (const t of [0.04, 0.96])
          part(
            "broad white end panel",
            t,
            b.height / 2,
            Math.min(2.9, len * 0.07),
            b.height,
            0.4,
            white,
            0.24,
          );
        for (const [t, f] of [
          [0.43, 1],
          [0.8, 3],
        ]) {
          const width = bay * 2.1,
            height = fh * 2,
            y = (f + 1) * fh;
          for (const side of [-1, 1])
            part(
              "cyan frame vertical",
              t + (side * width) / (2 * len),
              y,
              0.32,
              height + 0.32,
              0.32,
              accent,
              0.95,
            );
          for (const side of [-1, 1])
            part(
              "cyan frame horizontal",
              t,
              y + (side * height) / 2,
              width + 0.32,
              0.32,
              0.32,
              accent,
              0.95,
            );
        }
      }
      if (!shared && b.name.endsWith("外翼3") && len < 14 && i === 1) {
        part(
          "photo reference brick stair wall",
          0.5,
          b.height / 2,
          len - 0.2,
          b.height,
          0.12,
          brick,
          0.92,
        );
        for (let f = 0; f < floors; f++)
          part(
            "stair core square window",
            0.5,
            f * fh + 1.9,
            1.05,
            1.3,
            0.06,
            glass,
            1.01,
            true,
          );
      }
      if (shared) {
        // Ground-level openings remain part of the exterior; no interior spaces are modelled.
        part(
          "shared gallery roof fascia",
          0.5,
          b.height + 0.26,
          len,
          0.48,
          0.6,
          white,
          0.4,
        );
      }
    }
    const mesh = Mesh.MergeMeshes(parts, true, true, undefined, false, true)!;
    mesh.name = "living two six-floor photo exterior";
    mesh.isPickable = false;
    mesh.checkCollisions = false;
    mesh.addLODLevel(1500, null);
    mesh.freezeWorldMatrix();
    return mesh;
  };
}
