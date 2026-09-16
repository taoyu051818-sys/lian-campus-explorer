import {
  Mesh,
  MeshBuilder,
  VertexData,
  Vector3,
  StandardMaterial,
  Color3,
  Scene,
} from "@babylonjs/core";
import type { Point } from "./world-geometry";
import type { RefinedBuilding } from "./refinement";
const material = (scene: Scene, name: string, color: string) => {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(color);
  m.specularColor.set(0.12, 0.12, 0.12);
  return m;
};
// Illustration-derived silhouette. Dimensions, solar modules and glazing spacing are estimates.
export function createTransportFacade(
  scene: Scene,
  volume: (
    name: string,
    fp: Point[],
    h: number,
    base: number,
    mat: StandardMaterial,
  ) => Mesh,
) {
  const ivory = material(scene, "transport ivory", "#e5e5d8"),
    glass = material(scene, "transport glazing", "#698f98"),
    solar = material(scene, "transport photovoltaic roof", "#455e73"),
    joint = material(scene, "transport roof seams", "#a6bcc3");
  return (b: RefinedBuilding, base: number) => {
    if (!["hub30", "hub87"].includes(b.kind || "")) return;
    const fp = b.footprint,
      c: Point = [
        fp.reduce((s, p) => s + p[0], 0) / fp.length,
        fp.reduce((s, p) => s + p[1], 0) / fp.length,
      ],
      parts: Mesh[] = [];
    parts.push(
      volume(
        "station glass walls",
        fp.map((p) => [
          c[0] + (p[0] - c[0]) * 1.006,
          c[1] + (p[1] - c[1]) * 1.006,
        ]),
        b.height,
        base,
        glass,
      ),
    );
    parts.push(
      volume(
        "station ivory plinth",
        fp.map((p) => [
          c[0] + (p[0] - c[0]) * 1.015,
          c[1] + (p[1] - c[1]) * 1.015,
        ]),
        0.9,
        base,
        ivory,
      ),
    );
    const box = (
      name: string,
      x: number,
      z: number,
      w: number,
      h: number,
      d: number,
      y: number,
      angle: number,
      m: StandardMaterial,
    ) => {
      const a = MeshBuilder.CreateBox(
        name,
        { width: w, height: h, depth: d },
        scene,
      );
      a.position.set(x, y, z);
      a.rotation.y = -angle;
      a.material = m;
      parts.push(a);
      return a;
    };
    for (let i = 0; i < fp.length; i++) {
      const a = fp[i],
        b = fp[(i + 1) % fp.length],
        len = Math.hypot(b[0] - a[0], b[1] - a[1]),
        angle = Math.atan2(b[1] - a[1], b[0] - a[0]),
        n = Math.max(1, Math.ceil(len / 2.5));
      for (let k = 0; k < n; k++)
        box(
          "station glazing mullion",
          a[0] + ((b[0] - a[0]) * k) / n,
          a[1] + ((b[1] - a[1]) * k) / n,
          0.12,
          3.4,
          0.15,
          base + 2.5,
          angle,
          ivory,
        );
    }
    const angle =
      b.kind === "hub30"
        ? Math.atan2(fp[1][1] - fp[0][1], fp[1][0] - fp[0][0])
        : Math.atan2(fp[0][1] - c[1], fp[0][0] - c[0]);
    const p = (x: number, z: number): Point => [
      c[0] + x * Math.cos(angle) - z * Math.sin(angle),
      c[1] + x * Math.sin(angle) + z * Math.cos(angle),
    ];
    if (b.kind === "hub30") {
      for (let i = 0; i < 5; i++) {
        const x = (i - 2) * 6,
          q = p(x, 0),
          roof = box(
            "station folded photovoltaic panel",
            ...q,
            6.2,
            0.22,
            14,
            base + 5.25,
            angle,
            solar,
          );
        roof.rotation.z = 0.17;
        for (let j = 0; j < 7; j++) {
          const z = (j - 3) * 2,
            r = p(x, z);
          const seam = box(
            "folded roof module seam",
            ...r,
            6.2,
            0.035,
            0.055,
            base + 5.39,
            angle,
            joint,
          );
          seam.rotation.z = 0.17;
        }
        const edge = p(x - 3, 0);
        box(
          "folded roof raised seam",
          ...edge,
          0.09,
          0.12,
          14,
          base + 4.87,
          angle,
          ivory,
        );
      }
    } else {
      const roofFp = Array.from({ length: 64 }, (_, i) =>
        p(Math.cos((i * Math.PI) / 32) * 17, Math.sin((i * Math.PI) / 32) * 9),
      );
      parts.push(
        volume("station elliptical roof rim", roofFp, 0.3, base + 4.65, ivory),
      );
      parts.push(
        volume(
          "station elliptical photovoltaic roof",
          roofFp.map((q) => [
            c[0] + (q[0] - c[0]) * 0.985,
            c[1] + (q[1] - c[1]) * 0.985,
          ]),
          0.06,
          base + 4.96,
          solar,
        ),
      );
      for (let x = -15; x <= 15; x += 1.5) {
        const d = 18 * Math.sqrt(1 - (x / 17) ** 2),
          q = p(x, 0);
        box(
          "elliptical solar module joint",
          ...q,
          0.045,
          0.035,
          d,
          base + 5.04,
          angle,
          joint,
        );
      }
      for (let z = -7.5; z <= 7.5; z += 1.5) {
        const w = 34 * Math.sqrt(1 - (z / 9) ** 2),
          q = p(0, z);
        box(
          "elliptical transverse module joint",
          ...q,
          w,
          0.035,
          0.045,
          base + 5.04,
          angle,
          joint,
        );
      }
    }
    const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, true)!;
    merged.name = "transport station facade " + b.placeId;
    merged.isPickable = false;
    return merged;
  };
}

export function createTransportSites(scene: Scene, geo: any) {
  const asphalt = material(scene, "transport yard asphalt", "#535e5e"),
    white = material(scene, "transport lane markings", "#e9e9d9"),
    metal = material(scene, "transport canopy frames", "#c2cbc5"),
    blue = material(scene, "transport canopy roof", "#7496a1"),
    glass = material(scene, "transport vehicle glass", "#314e5b"),
    body = material(scene, "transport bus ivory", "#dadfd8"),
    rubber = material(scene, "transport tires", "#303a39");
  const physical: Mesh[] = [],
    visual: Mesh[] = [],
    stats = {
      sites: 0,
      canopies: 0,
      staticBuses: 0,
      staticShuttles: 0,
      parkingBays: 0,
      accesses: 0,
    };
  const box = (
    name: string,
    p: Point,
    w: number,
    h: number,
    d: number,
    y: number,
    angle: number,
    m: StandardMaterial,
    solid = false,
  ) => {
    const mesh = MeshBuilder.CreateBox(
      name,
      { width: w, height: h, depth: d },
      scene,
    );
    mesh.position.set(p[0], y, p[1]);
    mesh.rotation.y = -angle;
    mesh.material = m;
    (solid ? physical : visual).push(mesh);
    return mesh;
  };
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
    vd.indices = ix;
    vd.normals = ns;
    vd.uvs = new Array(fp.length * 2).fill(0);
    const mesh = new Mesh("transport paved surface", scene);
    vd.applyToMesh(mesh);
    mesh.material = m;
    visual.push(mesh);
  };
  for (const site of geo.transportSites) {
    stats.sites++;
    const a = site.angle,
      c = site.center,
      p = (x: number, z: number): Point => [
        c[0] + x * Math.cos(a) - z * Math.sin(a),
        c[1] + x * Math.sin(a) + z * Math.cos(a),
      ];
    const rect = (x: number, z: number, w: number, d: number) => [
      p(x - w / 2, z - d / 2),
      p(x + w / 2, z - d / 2),
      p(x + w / 2, z + d / 2),
      p(x - w / 2, z + d / 2),
    ];
    for (let x = -30; x < 30; x += 2)
      for (let z = -32; z < 32; z += 2)
        surface(rect(x + 1, z + 1, 2, 2), asphalt);
    // Connect a clear entrance to the existing road, using a 6 m approach that follows terrain.
    const e = site.entry as Point,
      r = site.road as Point,
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
          asphalt,
          0.34,
        );
      }
    stats.accesses++;
    const line = (x: number, z: number, w: number, d: number) =>
      surface(rect(x, z, w, d), white, 0.36);
    const bus = (x: number, z: number, shuttle = false, turn = 0) => {
      const q = p(x, z),
        y = geo.height(...q) + 0.34,
        rot = a + turn,
        w = shuttle ? 1.7 : 2.55,
        d = shuttle ? 3.6 : 10.5,
        h = shuttle ? 1.9 : 3.1;
      box(
        shuttle ? "static electric shuttle" : "static parked bus",
        q,
        w,
        h,
        d,
        y + h / 2 + 0.25,
        rot,
        body,
        true,
      );
      box(
        "vehicle dark glazing band",
        q,
        w + 0.02,
        h * 0.42,
        d * 0.88,
        y + h * 0.67 + 0.25,
        rot,
        glass,
      );
      box(
        "vehicle pale roof",
        q,
        w + 0.08,
        0.16,
        d + 0.08,
        y + h + 0.35,
        rot,
        body,
      );
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const t: Point = [
            q[0] +
              ((sx * w) / 2) * Math.cos(rot) -
              sz * d * 0.31 * Math.sin(rot),
            q[1] +
              ((sx * w) / 2) * Math.sin(rot) +
              sz * d * 0.31 * Math.cos(rot),
          ];
          const wheel = MeshBuilder.CreateCylinder(
            "static vehicle wheel",
            { height: 0.22, diameter: shuttle ? 0.5 : 0.85, tessellation: 10 },
            scene,
          );
          wheel.rotation.z = Math.PI / 2;
          wheel.rotation.y = -rot;
          wheel.position.set(t[0], y + 0.48, t[1]);
          wheel.material = rubber;
          visual.push(wheel);
        }
      if (shuttle) stats.staticShuttles++;
      else stats.staticBuses++;
    };
    for (const canopy of site.canopies) {
      stats.canopies++;
      const { x, z, width: w, depth: d } = canopy,
        q = p(x, z),
        h = site.placeId === "hub30" ? 3.6 : 4.9,
        y = Math.max(...rect(x, z, w, d).map((q) => geo.height(...q))) + 0.35;
      box("parking canopy roof", q, w, 0.18, d, y + h, a, blue, true);
      const long = d > w,
        steps = Math.ceil((long ? d : w) / 5);
      for (let i = 0; i <= steps; i++) {
        const shift = (i / steps - 0.5) * (long ? d : w);
        const beam = p(x + (long ? 0 : shift), z + (long ? shift : 0));
        box(
          "canopy cross beam",
          beam,
          long ? w : 0.12,
          0.15,
          long ? 0.12 : d,
          y + h - 0.15,
          a,
          metal,
        );
        if (i % 2 === 0 || i === steps)
          for (const side of [-1, 1]) {
            const post = p(
                x + (long ? side * (w / 2 - 0.3) : shift),
                z + (long ? shift : side * (d / 2 - 0.3)),
              ),
              bottom = geo.height(...post) + 0.3;
            box(
              "canopy support",
              post,
              0.16,
              y + h - bottom,
              0.16,
              (bottom + y + h) / 2,
              a,
              metal,
              true,
            );
          }
      }
      if (site.placeId === "hub30") {
        for (let i = 0; i < 7; i++) {
          const zz = z - 12 + i * 4;
          line(x, zz, 6.5, 0.12);
          stats.parkingBays++;
          if (i % 2 === 0) bus(x, zz + 1.9, true, Math.PI / 2);
        }
      } else {
        for (let i = 0; i < 7; i++) {
          const xx = x - 21 + i * 7;
          line(xx, z, 0.12, 12);
          if (i < 6) {
            stats.parkingBays++;
            if (i !== 3) bus(xx + 3.5, z);
          }
        }
      }
    }
    // Lane dashes and short transverse crossing at the entry; both remain walkable.
    for (let z = -25; z < 27; z += 7) line(25, z, 0.18, 3);
    for (let i = 0; i < 5; i++)
      line(20 + i * 1.3, site.placeId === "hub30" ? -28 : 28, 0.7, 3.2);
    box(
      "entry ticket pedestal",
      p(29, site.placeId === "hub30" ? -28 : 28),
      0.45,
      1.1,
      0.45,
      geo.height(...p(29, site.placeId === "hub30" ? -28 : 28)) + 0.85,
      a,
      blue,
      true,
    );
  }
  const merged = Mesh.MergeMeshes(visual, true, true, undefined, false, true);
  if (merged) {
    merged.name = "transport yards canopies and parked vehicles";
    merged.isPickable = false;
  }
  return { physical, stats };
}
