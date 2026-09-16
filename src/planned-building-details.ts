import {
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  Scene,
} from "@babylonjs/core";
import { inside, closest, distance, type Point } from "./world-geometry";
import type { RefinedBuilding } from "./refinement";

// Planning illustrations support appearance; window modules and equipment sizes remain estimates.
export function createPlannedDetails(
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
    m.specularColor.set(0.12, 0.12, 0.12);
    return m;
  };
  const white = mat("planned ivory frames", "#e6e8df"),
    red = mat("law terracotta cladding", "#9f5343"),
    glass = mat("planned blue grey glazing", "#4c6875"),
    roof = mat("energy equipment metal", "#aebcc0"),
    dark = mat("cooling fan recess", "#354a50");
  const housing = mat("community estimated stone facade", "#c7c3b7");
  const orange = mat("school warm facade panels", "#c27848");

  return function build(b: RefinedBuilding, base: number): Mesh | undefined {
    const community = b.kind?.startsWith("community");
    const lowHousing = b.kind === "community-low";
    const dorm = b.kind?.startsWith("dorm56");
    const service = b.kind === "dorm56-service";
    const campus =
      b.kind === "youth" || b.kind?.startsWith("school") || dorm || community;
    if (!b.kind?.startsWith("law-") && b.kind !== "energy" && !campus) return;
    const parts: Mesh[] = [],
      energy = b.kind === "energy",
      fp = b.footprint;
    const floors = b.floors!,
      fh = b.height / floors;
    const signed = fp.reduce(
      (s, p, i) =>
        s +
        p[0] * fp[(i + 1) % fp.length][1] -
        fp[(i + 1) % fp.length][0] * p[1],
      0,
    );
    const cx = fp.reduce((s, p) => s + p[0], 0) / fp.length,
      cz = fp.reduce((s, p) => s + p[1], 0) / fp.length;
    const skin = fp.map(
      (p) => [cx + (p[0] - cx) * 1.002, cz + (p[1] - cz) * 1.002] as Point,
    );
    parts.push(
      volume(
        "planned facade skin",
        skin,
        b.height,
        base,
        energy
          ? glass
          : service
            ? red
            : lowHousing
              ? housing
              : campus || b.kind === "law-white"
                ? white
                : red,
      ),
    );
    const edgeLengths = fp.map((a, i) => distance(a, fp[(i + 1) % fp.length]));
    for (let i = 0; i < fp.length; i++) {
      const a = fp[i],
        c = fp[(i + 1) % fp.length],
        len = edgeLengths[i];
      if (len < 0.5) continue;
      const dx = (c[0] - a[0]) / len,
        dz = (c[1] - a[1]) / len,
        nx = signed > 0 ? dz : -dz,
        nz = signed > 0 ? -dx : dx;
      const box = (
        name: string,
        t: number,
        y: number,
        w: number,
        h: number,
        d: number,
        m: StandardMaterial,
        offset = 0.18,
      ) => {
        const flat =
          name === "law window surround" || name === "law inset glazing";
        const p = flat
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
        p.position.set(
          a[0] + dx * len * t + nx * offset,
          base + y,
          a[1] + dz * len * t + nz * offset,
        );
        p.rotation.y = -Math.atan2(dz, dx);
        p.material = m;
        parts.push(p);
        return p;
      };
      const n = Math.max(1, Math.round(len / (energy ? 3.2 : 3.6))),
        step = len / n;
      for (let f = 0; f < floors; f++) {
        for (let j = 0; j < n; j++) {
          const t = (j + 0.5) / n;
          if (!energy) {
            box(
              "law window surround",
              t,
              (f + 0.51) * fh,
              step * 0.88,
              fh * 0.76,
              0.11,
              b.kind?.startsWith("school")
                ? orange
                : b.kind === "law-white"
                  ? red
                  : white,
              0.19,
            );
            box(
              "law inset glazing",
              t,
              (f + 0.51) * fh,
              step * 0.72,
              fh * 0.62,
              0.1,
              glass,
              0.27,
            );
          } else {
            // Continuous glass with slim joints; the post-renovation scheme has horizontal bands.
            box(
              "energy glazing joint",
              j / n,
              (f + 0.5) * fh,
              0.07,
              fh,
              0.12,
              white,
              0.2,
            );
          }
        }
        if (energy || b.kind !== "law-tower-red") {
          const redBase = b.kind === "law-tower-white" && f < 3;
          box(
            "planned horizontal floor band",
            0.5,
            (f + 1) * fh - 0.18,
            len,
            0.36,
            lowHousing ? 0.45 : campus ? 1.15 : 0.27,
            b.kind?.startsWith("school") && f % 2 === 0
              ? orange
              : redBase
                ? red
                : white,
            campus ? 0.5 : 0.3,
          );
        }
        if (dorm && !service && f > 0) {
          box(
            "dorm balcony shadow",
            0.5,
            f * fh + 0.74,
            len - 0.4,
            0.9,
            0.12,
            glass,
            0.43,
          );
          box(
            "dorm balcony rail",
            0.5,
            f * fh + 1.22,
            len - 0.4,
            0.08,
            0.1,
            white,
            0.56,
          );
        }
        if (energy && f > 0) {
          for (let j = 0; j < Math.ceil(len / 1.3); j++)
            box(
              "energy band grille",
              (j + 0.5) / Math.ceil(len / 1.3),
              (f + 1) * fh - 0.62,
              0.12,
              0.8,
              0.32,
              white,
              0.28,
            );
        }
      }
      if (!energy) {
        for (let j = 0; j <= n; j += b.kind === "law-tower-red" ? 2 : 4)
          box(
            "law full height pier",
            j / n,
            b.height / 2,
            0.3,
            b.height,
            0.36,
            campus || b.kind === "law-white" ? white : red,
            0.37,
          );
        box(
          "law roof parapet",
          0.5,
          b.height + 0.48,
          len,
          0.55,
          0.32,
          b.kind === "law-tower-red" ? red : white,
        );
      } else {
        // A varying-height open screen follows the roof perimeter without filling the roof recess.
        const screenAt = (t: number) =>
          3 + 2.8 * (0.5 + 0.5 * Math.cos(i * 1.7 + t * 2.2));
        const count = Math.ceil(len / 1.15);
        for (let j = 0; j < count; j++) {
          const t = (j + 0.5) / count,
            h = screenAt(t);
          box(
            "energy rooftop vertical screen",
            t,
            b.height + h / 2,
            0.14,
            h,
            0.28,
            white,
            0.12,
          );
        }
        for (const frac of [0.48, 1]) {
          const y1 = b.height + screenAt(0) * frac,
            y2 = b.height + screenAt(1) * frac;
          const beam = box(
            "energy folded screen rail",
            0.5,
            (y1 + y2) / 2,
            Math.hypot(len, y2 - y1),
            0.16,
            0.22,
            white,
            0.12,
          );
          beam.rotation.z = Math.atan2(y2 - y1, len);
        }
      }
    }

    const k = edgeLengths.indexOf(Math.max(...edgeLengths)),
      a = fp[k],
      c = fp[(k + 1) % fp.length],
      len = edgeLengths[k];
    const dx = (c[0] - a[0]) / len,
      dz = (c[1] - a[1]) / len;
    const corners = (x: number, z: number, w: number, d: number): Point[] =>
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([u, v]) => [
        x + (dx * u * w) / 2 - (dz * v * d) / 2,
        z + (dz * u * w) / 2 + (dx * v * d) / 2,
      ]);
    const safe = (p: Point, w: number, d: number) =>
      corners(...p, w, d).every((q) => inside(q, fp)) &&
      fp.every(
        (a, i) =>
          distance(p, closest(p, a, fp[(i + 1) % fp.length])) >
          Math.hypot(w, d) / 2 + 0.6,
      );
    if (campus)
      parts.push(
        volume("campus pale roof", fp, 0.16, base + b.height + 0.35, white),
      );
    if (b.kind !== "law-tower-red" && !campus) {
      const minX = Math.min(...fp.map((p) => p[0])),
        maxX = Math.max(...fp.map((p) => p[0])),
        minZ = Math.min(...fp.map((p) => p[1])),
        maxZ = Math.max(...fp.map((p) => p[1]));
      let units = 0;
      for (let x = minX + 5; x < maxX - 4; x += energy ? 11 : 8)
        for (let z = minZ + 5; z < maxZ - 4; z += energy ? 12 : 8) {
          if (!safe([x, z], energy ? 7 : 5, energy ? 4 : 3)) continue;
          if (energy && units >= 18) continue;
          units++;
          const panel = MeshBuilder.CreateBox(
            energy ? "energy roof cooling unit" : "law blue roof panel",
            {
              width: energy ? 7 : 5,
              height: energy ? 1.9 : 0.14,
              depth: energy ? 4 : 3,
            },
            scene,
          );
          panel.position.set(x, base + b.height + (energy ? 1.28 : 0.55), z);
          panel.rotation.y = -Math.atan2(dz, dx);
          panel.material = energy ? roof : glass;
          parts.push(panel);
          if (energy) {
            for (const side of [-1, 1]) {
              const center = new Vector3(
                x + dx * side * 1.75,
                base + b.height + 2.32,
                z + dz * side * 1.75,
              );
              const recess = MeshBuilder.CreateCylinder(
                "cooling fan well",
                { diameter: 2.3, height: 0.14, tessellation: 16 },
                scene,
              );
              recess.position.copyFrom(center);
              recess.material = dark;
              parts.push(recess);
              const ring = MeshBuilder.CreateTorus(
                "cooling fan rim",
                { diameter: 2.25, thickness: 0.17, tessellation: 16 },
                scene,
              );
              ring.position.copyFrom(center);
              ring.position.y += 0.1;
              ring.material = white;
              parts.push(ring);
              for (let blade = 0; blade < 3; blade++) {
                const fan = MeshBuilder.CreateBox(
                  "static cooling fan blade",
                  { width: 1.8, height: 0.07, depth: 0.24 },
                  scene,
                );
                fan.position.copyFrom(center);
                fan.position.y += 0.16;
                fan.rotation.y = (blade * Math.PI) / 3;
                fan.material = roof;
                parts.push(fan);
              }
            }
          }
        }
    }
    const mesh = Mesh.MergeMeshes(parts, true, true, undefined, false, true)!;
    mesh.name = "planned detail " + b.name;
    mesh.isPickable = false;
    mesh.addLODLevel(1600, null);
    return mesh;
  };
}
