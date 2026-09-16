import {
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Scene,
} from "@babylonjs/core";
import { inside, distance, closest, type Point } from "./world-geometry";
import type { RefinedBuilding } from "./refinement";

// The public photograph supports these exterior motifs, not exact dimensions.
// OSM supplies a candidate footprint; parcel correspondence remains unverified.
export function createCanteenDetails(
  scene: Scene,
  volume: (
    name: string,
    fp: Point[],
    height: number,
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
  const red = mat("canteen terracotta screen", "#a55333"),
    white = mat("canteen pale side wing", "#e5e1cf"),
    glass = mat("canteen shaded glazing", "#334e57"),
    metal = mat("canteen rooftop metal", "#88959a"),
    dark = mat("canteen panel joints", "#40545a"),
    panel = mat("canteen dark solar modules", "#35465b"),
    frame = mat("canteen silver panel frame", "#c4cdd0");
  return (b: RefinedBuilding, base: number): Mesh | undefined => {
    if (b.kind !== "canteen-photo") return;
    const fp = b.footprint,
      parts: Mesh[] = [];
    parts.push(volume("canteen pale envelope", fp, b.height, base, white));
    const signed = fp.reduce(
      (s, p, i) =>
        s +
        p[0] * fp[(i + 1) % fp.length][1] -
        fp[(i + 1) % fp.length][0] * p[1],
      0,
    );
    const lengths = fp.map((p, i) => distance(p, fp[(i + 1) % fp.length]));
    const longest = lengths.indexOf(Math.max(...lengths));
    for (let i = 0; i < fp.length; i++) {
      const a = fp[i],
        c = fp[(i + 1) % fp.length],
        len = lengths[i];
      if (len < 1) continue;
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
        off = 0.12,
      ) => {
        const mesh = MeshBuilder.CreateBox(
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
        return mesh;
      };
      const screened = len > 30 && (i === longest || i === 2 || i === 8);
      box("canteen ground glazing", 0.5, 2.35, len - 0.5, 3.6, 0.12, glass);
      box("canteen upper glazing", 0.5, 7.3, len - 0.5, 3.8, 0.12, glass);
      box(
        "canteen floor band",
        0.5,
        5.25,
        len,
        0.48,
        0.35,
        screened ? red : white,
        0.18,
      );
      box(
        "canteen roof parapet",
        0.5,
        b.height + 0.3,
        len,
        0.6,
        0.36,
        screened ? red : white,
        0.13,
      );
      const count = Math.max(2, Math.floor(len / (screened ? 1.15 : 4)));
      for (let j = 0; j < count; j++) {
        const t = (j + 0.5) / count;
        // Central entrance stays visually open on the principal facade.
        if (screened && i === longest && Math.abs(t - 0.5) < 0.12) continue;
        box(
          screened ? "canteen terracotta fin" : "canteen white mullion",
          t,
          6.7,
          screened ? 0.3 : 0.22,
          screened ? 8.5 : 8.8,
          screened ? 0.62 : 0.24,
          screened ? red : white,
          0.36,
        );
      }
      if (i === longest) {
        box("canteen entrance lintel", 0.5, 6.15, 12, 0.65, 1.35, white, 0.7);
        box("canteen entrance doors", 0.5, 2.1, 7.5, 3.8, 0.1, glass, 0.48);
        box("canteen entrance canopy", 0.5, 4.05, 12.4, 0.18, 2.4, white, 1.05);
        box("canteen canopy glass", 0.5, 4.17, 11.6, 0.055, 2.15, glass, 1.05);
        for (const side of [-1, 1])
          box(
            "canteen canopy slim column",
            0.5 + (side * 5.5) / len,
            1.98,
            0.16,
            3.96,
            0.16,
            metal,
            2.12,
          );
        for (const side of [-1, 0, 1])
          box(
            "canteen entrance door mullion",
            0.5 + (side * 2.5) / len,
            2.1,
            0.09,
            3.8,
            0.12,
            white,
            0.55,
          );
      }
    }
    // The confirmed aerial shows one dense front array and a rear services strip.
    // Orient all modules to the principal facade; counts and dimensions are estimates.
    const a = fp[longest],
      c = fp[(longest + 1) % fp.length],
      length = lengths[longest],
      ux = (c[0] - a[0]) / length,
      uz = (c[1] - a[1]) / length,
      sign = Math.sign(signed),
      vx = -uz * sign,
      vz = ux * sign;
    const local = (u: number, v: number): Point => [
      a[0] + ux * u + vx * v,
      a[1] + uz * u + vz * v,
    ];
    const corners = (u: number, v: number, w: number, d: number): Point[] =>
      [
        [u - w / 2, v - d / 2],
        [u + w / 2, v - d / 2],
        [u + w / 2, v + d / 2],
        [u - w / 2, v + d / 2],
      ].map((p) => local(p[0], p[1]));
    const safe = (points: Point[], margin = 0.6) =>
      points.every(
        (p) =>
          inside(p, fp) &&
          fp.every(
            (q, i) =>
              distance(p, closest(p, q, fp[(i + 1) % fp.length])) > margin,
          ),
      );
    const depths: number[] = [];
    for (const t of [0.25, 0.4, 0.5, 0.6, 0.75]) {
      let d = 1;
      while (d < 60 && inside(local(length * t, d), fp)) d += 0.3;
      depths.push(d);
    }
    depths.sort((a, b) => a - b);
    const depth = depths[2];
    const add = (
      name: string,
      u: number,
      v: number,
      w: number,
      d: number,
      h: number,
      y: number,
      m: StandardMaterial,
    ) => {
      const footprint = corners(u, v, w, d);
      if (!safe(footprint)) return false;
      parts.push(volume(name, footprint, h, base + b.height + y, m));
      return true;
    };
    let modules = 0,
      units = 0;
    for (let u = 3; u < length - 2; u += 2.75)
      for (let v = 2; v < depth * 0.59; v += 1.75) {
        if (
          !add(
            "canteen framed roof array module",
            u,
            v,
            2.5,
            1.48,
            0.09,
            0.4,
            frame,
          )
        )
          continue;
        add(
          "canteen dark photovoltaic face",
          u,
          v,
          2.36,
          1.34,
          0.025,
          0.5,
          panel,
        );
        modules++;
        for (const fraction of [-0.25, 0, 0.25])
          add(
            "canteen module cell line",
            u + fraction * 2.36,
            v,
            0.018,
            1.32,
            0.012,
            0.529,
            frame,
          );
        add("canteen module midline", u, v, 2.32, 0.018, 0.012, 0.529, frame);
      }
    for (let u = 5; u < length - 3; u += 8) {
      const v = depth * 0.8;
      if (
        !add(
          "canteen rear rooftop equipment",
          u,
          v,
          3.5,
          2.6,
          1.15,
          0.42,
          metal,
        )
      )
        continue;
      units++;
      add("canteen plant pad", u, v, 3.9, 3, 0.14, 0.31, white);
      for (const du of [-0.75, 0.75]) {
        const p = local(u + du, v);
        const fan = MeshBuilder.CreateCylinder(
          "canteen rooftop fan recess",
          { diameter: 1.02, height: 0.055, tessellation: 12 },
          scene,
        );
        fan.position.set(p[0], base + b.height + 1.6, p[1]);
        fan.material = dark;
        parts.push(fan);
      }
      add(
        "canteen rear ventilation duct",
        u + 2.2,
        v,
        0.7,
        1.1,
        0.55,
        0.4,
        white,
      );
    }
    // Preserve the circulation strip between the array and the mechanical zone.
    for (let u = 4; u < length - 4; u += 6)
      add(
        "canteen roof maintenance paving",
        u,
        depth * 0.65,
        5.6,
        0.68,
        0.035,
        0.36,
        white,
      );
    const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, true)!;
    merged.name = "canteen photo reference exterior";
    merged.metadata = {
      photoDetails: {
        roofModules: modules,
        mechanicalUnits: units,
        roofDepthEstimate: depth,
        roofBasis: [ux, uz, vx, vz],
      },
    };
    merged.addLODLevel(1500, null);
    merged.isPickable = false;
    merged.checkCollisions = false;
    merged.freezeWorldMatrix();
    return merged;
  };
}
