import {
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Scene,
  VertexData,
} from "@babylonjs/core";
import earcut from "earcut";
import { distance, type Point } from "./world-geometry";
import type { RefinedBuilding } from "./refinement";

export function createServicesIndustryDetails(
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
    m.specularColor.set(0.16, 0.16, 0.16);
    return m;
  };
  const ivory = mat("service continuous ivory slab", "#e4e9e5"),
    glass = mat("service recessed blue glazing", "#557c8b"),
    roof = mat("service curved metal roof", "#819da8"),
    frame = mat("service fine roof ribs", "#cbd7d9"),
    green = mat("exhibition planted roof", "#829858");
  return (b: RefinedBuilding, base: number): Mesh | undefined => {
    if (!b.kind?.startsWith("services-") && !b.kind?.startsWith("industry-"))
      return;
    const fp = b.footprint,
      parts: Mesh[] = [],
      pavilion = b.kind === "services-pavilion",
      floors = b.floors || 1,
      fh = b.height / floors;
    parts.push(volume("service glass envelope", fp, b.height, base, glass));
    const signed = fp.reduce(
      (s, p, i) =>
        s +
        p[0] * fp[(i + 1) % fp.length][1] -
        fp[(i + 1) % fp.length][0] * p[1],
      0,
    );
    const top = base + b.height;
    // Wave profile references the render; exact roof sections were not published.
    const wave = (p: Point) =>
      pavilion
        ? top + 0.18
        : top +
          0.45 +
          8.05 * (0.5 + 0.5 * Math.sin((p[0] * 0.72 + p[1] * 0.69) / 37));
    for (let i = 0; i < fp.length; i++) {
      const a = fp[i],
        c = fp[(i + 1) % fp.length],
        len = distance(a, c);
      if (len < 0.05) continue;
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
        const mesh = MeshBuilder.CreateBox(
          name,
          { width: w, height: h, depth: d },
          scene,
        );
        mesh.position.set(
          a[0] + dx * len * t + nx * offset,
          y,
          a[1] + dz * len * t + nz * offset,
        );
        mesh.rotation.y = -Math.atan2(dz, dx);
        mesh.material = m;
        parts.push(mesh);
        return mesh;
      };
      for (let f = 1; f <= floors; f++)
        box(
          "continuous floor lip",
          0.5,
          base + f * fh - 0.26,
          len + 0.08,
          0.45,
          pavilion ? 0.4 : 1.15,
          ivory,
          0.32,
        );
      const n = Math.max(1, Math.ceil(len / 3));
      for (let j = 0; j < n; j++) {
        box(
          "slender glazing mullion",
          (j + 0.5) / n,
          base + b.height / 2,
          0.095,
          b.height,
          0.12,
          frame,
          0.13,
        );
        if (!pavilion && j % 2 === 0) {
          const t = (j + 0.5) / n,
            p: Point = [a[0] + dx * len * t, a[1] + dz * len * t],
            h = wave(p) - top;
          box("wave canopy support", t, top + h / 2, 0.16, h, 0.18, frame, 0);
        }
      }
      const mid: Point = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2],
        h1 = wave(a),
        h2 = wave(c);
      const rail = box(
        "wave roof edge",
        0.5,
        (h1 + h2) / 2,
        Math.hypot(len, h2 - h1),
        0.26,
        0.4,
        ivory,
        0.05,
      );
      rail.rotation.z = Math.atan2(h2 - h1, len);
    }
    // Triangulated variable-height roof preserves the open courtyard in each traced sector.
    let positions: number[] = [],
      indices: number[] = [],
      uvs: number[] = [];
    if (b.kind.endsWith("-curve")) {
      const n = fp.length / 2,
        strips = 6;
      for (let i = 0; i < n; i++)
        for (let j = 0; j <= strips; j++) {
          const a = fp[i],
            c = fp[fp.length - 1 - i],
            t = j / strips,
            p: Point = [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t];
          positions.push(p[0], wave(p), p[1]);
          uvs.push(i / 5, t);
          if (i < n - 1 && j < strips) {
            const k = i * (strips + 1) + j;
            indices.push(
              k,
              k + 1,
              k + strips + 2,
              k,
              k + strips + 2,
              k + strips + 1,
            );
          }
        }
      for (let i = 0; i < n; i += 2) {
        const a = fp[i],
          c = fp[fp.length - 1 - i];
        for (let j = 0; j < strips; j++) {
          const t = j / strips,
            u = (j + 1) / strips,
            p: Point = [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t],
            q: Point = [a[0] + (c[0] - a[0]) * u, a[1] + (c[1] - a[1]) * u],
            len = distance(p, q),
            dy = wave(q) - wave(p);
          const rib = MeshBuilder.CreateBox(
            "curved roof seam",
            { width: Math.hypot(len, dy), height: 0.06, depth: 0.08 },
            scene,
          );
          rib.position.set(
            (p[0] + q[0]) / 2,
            (wave(p) + wave(q)) / 2 + 0.055,
            (p[1] + q[1]) / 2,
          );
          rib.rotation.y = -Math.atan2(q[1] - p[1], q[0] - p[0]);
          rib.rotation.z = Math.atan2(dy, len);
          rib.material = frame;
          parts.push(rib);
        }
      }
    } else {
      positions = fp.flatMap((p) => [p[0], wave(p), p[1]]);
      indices = earcut(fp.flatMap((p) => p));
      uvs = fp.flatMap((p) => [p[0] / 5, p[1] / 5]);
    }
    // Babylon uses left-handed normals; orient every roof triangle upward.
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 3,
        b = indices[i + 1] * 3,
        c = indices[i + 2] * 3;
      const ny =
        (positions[b + 2] - positions[a + 2]) * (positions[c] - positions[a]) -
        (positions[b] - positions[a]) * (positions[c + 2] - positions[a + 2]);
      if (ny > 0)
        [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
    }
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    const vd = new VertexData();
    vd.positions = positions;
    vd.indices = indices;
    vd.normals = normals;
    vd.uvs = uvs;
    const cover = new Mesh("plan reference wave roof", scene);
    vd.applyToMesh(cover);
    cover.material = pavilion ? green : roof;
    cover.material.backFaceCulling = false;
    parts.push(cover);
    const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, true)!;
    merged.name = "services-industry exterior " + b.name;
    merged.isPickable = false;
    merged.addLODLevel(1900, null);
    return merged;
  };
}
