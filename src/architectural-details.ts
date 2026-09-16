import { createServicesIndustryDetails } from "./services-industry-details";
import { createTeachingDetails } from "./teaching-details";
import { createLivingTwoDetails } from "./living-area-two-details";
import { createCanteenDetails } from "./canteen-details";
import { createPoliceDetails } from "./police-details";
import { createFireDetails } from "./fire-station";
import { createHospitalDetails } from "./hospital-details";
import { createTransportFacade } from "./transport-details";
import {
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  Scene,
  VertexData,
} from "@babylonjs/core";
import earcut from "earcut";
import {
  type Point,
  distance,
  toWorld,
  closest,
  inside,
} from "./world-geometry";
import { type RefinedBuilding } from "./refinement";
import type { AtlasData } from "./atlas";
import { createPlannedDetails } from "./planned-building-details";
export function createDetails(
  scene: Scene,
  height: (x: number, z: number) => number,
  volume: (
    name: string,
    fp: Point[],
    h: number,
    base: number,
    mat: StandardMaterial,
  ) => Mesh,
) {
  const material = (n: string, c: string) => {
    const m = new StandardMaterial(n, scene);
    m.diffuseColor = Color3.FromHexString(c);
    m.specularColor.set(0.08, 0.08, 0.08);
    return m;
  };
  const ivory = material("facade ivory", "#e5e2d6"),
    glass = material("recessed glazing", "#45666b"),
    stone = material("terrace paving", "#b9bcaf"),
    rail = material("metal screen", "#d5dcd6"),
    plant = material("roof planting", "#66856a"),
    red = material("terracotta accents", "#aa6955");
  const stats = {
    facadeBuildings: 0,
    decorativeMeshes: 0,
    landmarks: ["library", "stadium", "sports", "hall", "activity", "dorm3"],
  };
  const groups: Mesh[] = [];
  const policeDetails = createPoliceDetails(scene, volume);
  const fireDetails = createFireDetails(scene, volume);
  const hospitalDetails = createHospitalDetails(scene, volume);
  const transportDetails = createTransportFacade(scene, volume);
  const plannedDetails = createPlannedDetails(scene, volume);
  const canteenDetails = createCanteenDetails(scene, volume);
  const livingTwoDetails = createLivingTwoDetails(scene, volume);
  const servicesIndustryDetails = createServicesIndustryDetails(scene, volume);
  const teachingDetails = createTeachingDetails(scene, volume);
  function polygon(
    name: string,
    fp: Point[],
    offset: number,
    mat: StandardMaterial,
  ) {
    const ps = fp.flatMap((p) => [p[0], height(...p) + offset, p[1]]),
      ix: number[] = [];
    const signedArea = fp.reduce(
      (sum, p, j) =>
        sum +
        p[0] * fp[(j + 1) % fp.length][1] -
        fp[(j + 1) % fp.length][0] * p[1],
      0,
    );
    for (let i = 1; i < fp.length - 1; i++) {
      if (signedArea > 0) ix.push(0, i, i + 1);
      else ix.push(0, i + 1, i);
    }
    const normals: number[] = [];
    VertexData.ComputeNormals(ps, ix, normals);
    const v = new VertexData();
    v.positions = ps;
    v.indices = ix;
    v.normals = normals;
    v.uvs = new Array(fp.length * 2).fill(0);
    const m = new Mesh(name, scene);
    v.applyToMesh(m);
    m.material = mat;
    m.material.backFaceCulling = false;
    m.isPickable = false;
    return m;
  }
  function finalize(parts: Mesh[], name: string, limit = 850) {
    if (!parts.length) return;
    const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, true)!;
    merged.name = name;
    merged.isPickable = false;
    merged.addLODLevel(limit, null);
    groups.push(merged);
    stats.decorativeMeshes++;
  }
  const warmStone = material("auditorium limestone", "#d4c19b");
  const roofMetal = material("sports standing seam roof", "#819397");
  function facilityFacade(b: RefinedBuilding, base: number) {
    const parts: Mesh[] = [];
    const fp = b.footprint;
    const cx = fp.reduce((s, p) => s + p[0], 0) / fp.length;
    const cz = fp.reduce((s, p) => s + p[1], 0) / fp.length;
    const area = fp.reduce(
      (s, p, i) =>
        s +
        p[0] * fp[(i + 1) % fp.length][1] -
        fp[(i + 1) % fp.length][0] * p[1],
      0,
    );
    const isHall = b.kind === "hall" || b.kind === "hall-base";
    const isPool = b.kind === "pool";
    const skin = fp.map(
      (p) => [cx + (p[0] - cx) * 1.003, cz + (p[1] - cz) * 1.003] as Point,
    );
    parts.push(
      volume(
        "facility cladding",
        skin,
        b.height,
        base,
        isHall ? warmStone : ivory,
      ),
    );
    for (let i = 0; i < fp.length; i++) {
      const a = fp[i],
        c = fp[(i + 1) % fp.length],
        len = distance(a, c);
      const dx = (c[0] - a[0]) / len,
        dz = (c[1] - a[1]) / len;
      const nx = area > 0 ? dz : -dz,
        nz = area > 0 ? -dx : dx;
      const n = Math.max(1, Math.floor(len / (isHall ? 3.1 : 3.6)));
      const box = (
        name: string,
        t: number,
        y: number,
        w: number,
        h: number,
        depth: number,
        mat: StandardMaterial,
        offset = 0.28,
      ) => {
        const m = MeshBuilder.CreateBox(
          name,
          { width: w, height: h, depth },
          scene,
        );
        m.position.set(
          a[0] + (c[0] - a[0]) * t + nx * offset,
          base + y,
          a[1] + (c[1] - a[1]) * t + nz * offset,
        );
        m.rotation.y = -Math.atan2(dz, dx);
        m.material = mat;
        parts.push(m);
        return m;
      };
      if (isHall) {
        for (let j = 0; j < n; j++) {
          const t = (j + 0.5) / n;
          box(
            "auditorium vertical glazing",
            t,
            b.height * 0.48,
            (len / n) * 0.42,
            b.height * 0.62,
            0.12,
            glass,
          );
          box(
            "auditorium stone fin",
            t - 0.18 / n,
            b.height * 0.49,
            0.24,
            b.height * 0.77,
            0.55,
            warmStone,
            0.55,
          );
        }
        box(
          "auditorium cornice",
          0.5,
          b.height - 0.5,
          len + 0.1,
          0.45,
          0.7,
          warmStone,
          0.42,
        );
      } else {
        box("sports entrance glazing", 0.5, 2.0, len * 0.94, 3.7, 0.15, glass);
        if (isPool) {
          for (let row = 0; row < 5; row++)
            for (let j = 0; j < n; j++) {
              const t = (j + 0.35 + (row % 2) * 0.25) / n;
              const disc = MeshBuilder.CreateDisc(
                "pool hexagonal screen opening",
                {
                  radius: 0.74 + row * 0.035,
                  tessellation: 6,
                  sideOrientation: Mesh.DOUBLESIDE,
                },
                scene,
              );
              disc.position.set(
                a[0] + (c[0] - a[0]) * t + nx * 0.32,
                base + 6.1 + row * 3.25,
                a[1] + (c[1] - a[1]) * t + nz * 0.32,
              );
              disc.rotation.y = Math.atan2(nx, nz);
              disc.material = glass;
              parts.push(disc);
            }
        } else {
          // A light diagonal screen evokes the documented facade, without claiming an exact pattern.
          box("gym screen backing", 0.5, 11.7, len * 0.98, 12, 0.12, glass);
          for (let j = 0; j < n; j++)
            for (let row = 0; row < 3; row++) {
              const t = (j + 0.5) / n;
              for (const sign of [-1, 1]) {
                const bar = box(
                  "gym diagonal lattice",
                  t,
                  7.7 + row * 3.7,
                  0.19,
                  4.5,
                  0.16,
                  ivory,
                  0.48,
                );
                bar.rotate(Vector3.Forward(), sign * 0.65);
              }
            }
          box(
            "gym clerestory",
            0.5,
            b.height - 2.6,
            len * 0.89,
            1.4,
            0.1,
            glass,
          );
        }
        box(
          "sports roof fascia",
          0.5,
          b.height - 0.5,
          len + 0.2,
          0.8,
          0.7,
          ivory,
          0.38,
        );
      }
    }
    if (b.kind === "hall") {
      parts.push(
        volume(
          "auditorium pale roof",
          skin,
          0.35,
          base + b.height + 0.25,
          warmStone,
        ),
      );
    }
    if (!isHall) {
      const angle = (-34 * Math.PI) / 180,
        w = isPool ? 85.31 : 79,
        d = isPool ? 96.78 : 121.4;
      const pt = (x: number, z: number, y: number) =>
        new Vector3(
          cx + x * Math.cos(angle) - z * Math.sin(angle),
          y,
          cz + x * Math.sin(angle) + z * Math.cos(angle),
        );
      const paths = Array.from({ length: 19 }, (_, i) => {
        const x = (i / 18 - 0.5) * w * 0.87,
          y =
            base +
            b.height +
            0.45 +
            (isPool ? 2.1 : 1.3) * (1 - (x / (w * 0.435)) ** 2);
        return [pt(x, -d * 0.4, y), pt(x, d * 0.4, y)];
      });
      const canopy = MeshBuilder.CreateRibbon(
        "sports shallow barrel roof",
        { pathArray: paths, sideOrientation: Mesh.DOUBLESIDE },
        scene,
      );
      canopy.material = roofMetal;
      parts.push(canopy);
      for (let z = -d * 0.39; z <= d * 0.4; z += 4.5) {
        const path = paths.map((p) =>
          pt(
            (p[0].x - cx) * Math.cos(angle) + (p[0].z - cz) * Math.sin(angle),
            z,
            p[0].y + 0.07,
          ),
        );
        const rib = MeshBuilder.CreateTube(
          "standing roof seam",
          { path, radius: 0.07, tessellation: 4 },
          scene,
        );
        rib.material = rail;
        parts.push(rib);
      }
    }
    finalize(parts, "distinctive facade " + b.name, 1600);
    stats.facadeBuildings++;
  }

  const darkRoof = material("minzu charcoal roof", "#454c4d");
  const brightGreen = material("blcu green ribbons", "#80a946");
  const copper = material("incubator copper glass", "#a77e58");
  const silverGlass = material("incubator silver glass", "#81938e");
  const deepGlass = material("incubator dark glass", "#354f53");
  function incubatorFacade(b: RefinedBuilding, base: number) {
    const parts: Mesh[] = [];
    const fp = b.footprint;
    const area = fp.reduce(
      (s, p, i) =>
        s +
        p[0] * fp[(i + 1) % fp.length][1] -
        fp[(i + 1) % fp.length][0] * p[1],
      0,
    );
    const floors = b.floors || 5,
      fh = b.height / floors;
    for (let i = 0; i < fp.length; i++) {
      const a = fp[i],
        c = fp[(i + 1) % fp.length],
        len = distance(a, c),
        dx = (c[0] - a[0]) / len,
        dz = (c[1] - a[1]) / len;
      const nx = area > 0 ? dz : -dz,
        nz = area > 0 ? -dx : dx,
        n = Math.ceil(len / 2.3);
      for (let j = 0; j < n; j++)
        for (let f = 0; f < floors; f++) {
          const panel = MeshBuilder.CreateBox(
            "incubator curtain wall panel",
            { width: len / n - 0.055, height: fh - 0.09, depth: 0.15 },
            scene,
          );
          panel.position.set(
            a[0] + (dx * (j + 0.5) * len) / n + nx * 0.12,
            base + (f + 0.5) * fh,
            a[1] + (dz * (j + 0.5) * len) / n + nz * 0.12,
          );
          panel.rotation.y = -Math.atan2(dz, dx);
          panel.material = f >= 3 ? copper : f >= 1 ? silverGlass : deepGlass;
          if ((j + f * 7) % 19 === 0) panel.material = deepGlass;
          parts.push(panel);
        }
    }
    const a = fp[0],
      c = fp[1],
      d = fp[3],
      len = distance(a, c),
      depth = distance(a, d);
    const at = (u: number, v: number, y: number) =>
      new Vector3(
        a[0] + (c[0] - a[0]) * u + (d[0] - a[0]) * v,
        y,
        a[1] + (c[1] - a[1]) * u + (d[1] - a[1]) * v,
      );
    const beam = (p: Vector3, q: Vector3, thickness = 0.16) => {
      const m = MeshBuilder.CreateBox(
        "incubator white roof frame",
        { width: Vector3.Distance(p, q), height: thickness, depth: thickness },
        scene,
      );
      m.position = Vector3.Center(p, q);
      m.rotation.y = -Math.atan2(q.z - p.z, q.x - p.x);
      m.material = ivory;
      parts.push(m);
    };
    const y = base + b.height + 3.2;
    for (let u = 0.06; u <= 0.94; u += 5 / len)
      beam(at(u, 0.12, y), at(u, 0.88, y));
    for (let v = 0.12; v <= 0.88; v += 5 / depth)
      beam(at(0.06, v, y), at(0.94, v, y));
    for (let u = 0.06; u <= 0.95; u += 18 / len)
      for (const v of [0.12, 0.88]) {
        const post = MeshBuilder.CreateBox(
          "incubator roof canopy post",
          { width: 0.22, height: 3.2, depth: 0.22 },
          scene,
        );
        post.position = at(u, v, base + b.height + 1.6);
        post.material = ivory;
        parts.push(post);
      }
    finalize(parts, "incubator glass and roof frame", 1600);
    stats.facadeBuildings++;
  }
  function campusRoof(b: RefinedBuilding, base: number, parts: Mesh[]) {
    if (!["minzu", "blcu", "geology"].includes(b.kind || "")) return;
    const fp = b.footprint;
    if (b.kind === "minzu") {
      const vertices: number[] = [],
        indices: number[] = [];
      const roofY = (p: Point) =>
        base +
        b.height +
        0.38 +
        Math.min(
          2.6,
          Math.min(
            ...fp.map((a, i) =>
              distance(p, closest(p, a, fp[(i + 1) % fp.length])),
            ),
          ) * 0.3,
        );
      const tri = (a: Point, b: Point, c: Point, level: number) => {
        if (level) {
          const ab: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
            bc: Point = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2],
            ca: Point = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2];
          tri(a, ab, ca, level - 1);
          tri(ab, b, bc, level - 1);
          tri(ca, bc, c, level - 1);
          tri(ab, bc, ca, level - 1);
          return;
        }
        const n = vertices.length / 3;
        for (const p of [a, b, c]) vertices.push(p[0], roofY(p), p[1]);
        indices.push(n, n + 1, n + 2);
      };
      const ix = earcut(fp.flat());
      for (let i = 0; i < ix.length; i += 3)
        tri(fp[ix[i]], fp[ix[i + 1]], fp[ix[i + 2]], 3);
      const normals: number[] = [];
      VertexData.ComputeNormals(vertices, indices, normals);
      if (
        normals.filter((_, i) => i % 3 === 1).reduce((s, v) => s + v, 0) < 0
      ) {
        for (let i = 0; i < indices.length; i += 3)
          [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
        VertexData.ComputeNormals(vertices, indices, normals);
      }
      const mesh = new Mesh("minzu shallow pitched courtyard roof", scene),
        vd = new VertexData();
      vd.positions = vertices;
      vd.indices = indices;
      vd.normals = normals;
      vd.uvs = new Array((vertices.length / 3) * 2).fill(0);
      vd.applyToMesh(mesh);
      mesh.material = darkRoof;
      parts.push(mesh);
    } else {
      // Narrow roof planters stay inside each wing; do not fill the S-shaped courtyard.
      for (let i = 0; i < fp.length; i++) {
        const a = fp[i],
          c = fp[(i + 1) % fp.length],
          len = distance(a, c);
        if (len < 16) continue;
        const dx = (c[0] - a[0]) / len,
          dz = (c[1] - a[1]) / len;
        for (let s = 7; s < len - 5; s += 12) {
          let p: Point = [a[0] + dx * s - dz * 2.2, a[1] + dz * s + dx * 2.2];
          if (!inside(p, fp))
            p = [a[0] + dx * s + dz * 2.2, a[1] + dz * s - dx * 2.2];
          if (!inside(p, fp)) continue;
          const box = MeshBuilder.CreateBox(
            "campus rooftop planting",
            { width: 6, height: 0.35, depth: 1.1 },
            scene,
          );
          box.position.set(p[0], base + b.height + 0.55, p[1]);
          box.rotation.y = -Math.atan2(dz, dx);
          box.material = plant;
          parts.push(box);
        }
      }
    }
  }

  function facade(b: RefinedBuilding, base: number) {
    const planned =
      servicesIndustryDetails(b, base) ||
      teachingDetails(b, base) ||
      livingTwoDetails(b, base) ||
      canteenDetails(b, base) ||
      policeDetails(b, base) ||
      fireDetails(b, base) ||
      hospitalDetails(b, base) ||
      transportDetails(b, base) ||
      plannedDetails(b, base);
    if (planned) {
      groups.push(planned);
      stats.facadeBuildings++;
      stats.decorativeMeshes++;
      return;
    }
    if (b.kind === "incubator") return incubatorFacade(b, base);
    if (["hall", "hall-base", "pool", "gym"].includes(b.kind || ""))
      return facilityFacade(b, base);
    const parts: Mesh[] = [],
      floors = b.floors ?? Math.max(2, Math.round(b.height / 3.9)),
      fh = b.height / floors;
    const cx = b.footprint.reduce((s, p) => s + p[0], 0) / b.footprint.length,
      cz = b.footprint.reduce((s, p) => s + p[1], 0) / b.footprint.length;
    const bandFp = b.footprint.map(
      (p) => [cx + (p[0] - cx) * 1.012, cz + (p[1] - cz) * 1.012] as Point,
    );
    for (let f = 1; f <= floors; f++) {
      parts.push(volume("floor edge", bandFp, 0.2, base + f * fh - 0.2, ivory));
    }
    for (let i = 0; i < b.footprint.length; i++) {
      const a = b.footprint[i],
        c = b.footprint[(i + 1) % b.footprint.length],
        len = distance(a, c);
      if (len < 1.6) continue;
      const dx = (c[0] - a[0]) / len,
        dz = (c[1] - a[1]) / len,
        normal: Point = [-dz, dx];
      // Determine exterior from polygon signed area; consistently offset outward.
      const area = b.footprint.reduce(
        (s, p, j) =>
          s +
          p[0] * b.footprint[(j + 1) % b.footprint.length][1] -
          b.footprint[(j + 1) % b.footprint.length][0] * p[1],
        0,
      );
      if (area > 0) {
        normal[0] *= -1;
        normal[1] *= -1;
      }
      const n =
          b.kind === "library"
            ? Math.max(1, Math.floor(len / 4.5))
            : Math.max(1, Math.floor(len / 3.7)),
        spacing = len / n;
      for (let f = 0; f < floors; f++)
        for (let j = 0; j < n; j++) {
          const t = (j + 0.5) / n,
            x = a[0] + (c[0] - a[0]) * t + normal[0] * 0.07,
            z = a[1] + (c[1] - a[1]) * t + normal[1] * 0.07;
          const win = MeshBuilder.CreateBox(
            "window",
            { width: spacing * 0.74, height: fh * 0.48, depth: 0.12 },
            scene,
          );
          win.position.set(x, base + f * fh + fh * 0.53, z);
          win.rotation.y = -Math.atan2(dz, dx);
          win.material = glass;
          parts.push(win);
          if (b.kind === "dorm62") {
            const panel = MeshBuilder.CreateBox(
              "dorm terracotta recessed panel",
              { width: spacing * 0.84, height: fh * 0.68, depth: 0.08 },
              scene,
            );
            panel.position.set(
              x - normal[0] * 0.045,
              base + f * fh + fh * 0.52,
              z - normal[1] * 0.045,
            );
            panel.rotation.y = win.rotation.y;
            panel.material = red;
            parts.push(panel);
          }
          if (b.kind === "workshop") {
            const fin = MeshBuilder.CreateBox(
              "workshop vertical fin",
              { width: 0.17, height: fh - 0.2, depth: 0.45 },
              scene,
            );
            fin.position.set(
              x - dx * spacing * 0.45,
              base + f * fh + fh / 2,
              z - dz * spacing * 0.45,
            );
            fin.rotation.y = win.rotation.y;
            fin.material = ivory;
            parts.push(fin);
          }
          if (b.kind === "blcu" && (j + f) % 3 !== 0) {
            const accent = MeshBuilder.CreateBox(
              "blcu green facade ribbon",
              { width: spacing * 0.88, height: 0.32, depth: 0.18 },
              scene,
            );
            accent.position.set(
              x + normal[0] * 0.06,
              base + f * fh + fh * 0.25,
              z + normal[1] * 0.06,
            );
            accent.rotation.y = win.rotation.y;
            accent.material = brightGreen;
            parts.push(accent);
          }
          if (b.kind === "minzu" && len > 25 && j % 7 === 2 && f === 0) {
            const pier = MeshBuilder.CreateBox(
              "minzu red entrance pier",
              { width: 0.48, height: fh * 1.8, depth: 0.4 },
              scene,
            );
            pier.position.set(
              x + normal[0] * 0.2,
              base + fh * 0.9,
              z + normal[1] * 0.2,
            );
            pier.rotation.y = win.rotation.y;
            pier.material = red;
            parts.push(pier);
          }
        }
      if (
        [
          "bupt",
          "uestc",
          "library",
          "activity",
          "dorm3",
          "minzu",
          "blcu",
          "dorm62",
          "geology",
        ].includes(b.kind || "")
      )
        for (let f = 0; f < floors; f++) {
          const trim = MeshBuilder.CreateBox(
            "sunshade",
            { width: len + 0.12, height: 0.1, depth: 0.52 },
            scene,
          );
          trim.position.set(
            (a[0] + c[0]) / 2 + normal[0] * 0.23,
            base + f * fh + fh * 0.82,
            (a[1] + c[1]) / 2 + normal[1] * 0.23,
          );
          trim.rotation.y = -Math.atan2(dz, dx);
          trim.material = rail;
          parts.push(trim);
        }
      const parapet = MeshBuilder.CreateBox(
        "roof parapet",
        { width: len, height: 0.7, depth: 0.28 },
        scene,
      );
      parapet.position.set(
        (a[0] + c[0]) / 2,
        base + b.height + 0.4,
        (a[1] + c[1]) / 2,
      );
      parapet.rotation.y = -Math.atan2(dz, dx);
      parapet.material = b.kind === "bupt" ? red : ivory;
      parts.push(parapet);
    }
    campusRoof(b, base, parts);
    if (b.kind === "workshop")
      parts.push(
        volume(
          "workshop blue grey roof",
          b.footprint,
          0.13,
          base + b.height + 0.33,
          roofMetal,
        ),
      );
    if (b.kind === "dorm62" && floors > 1) {
      // Small blue panels follow actual wing interiors; none bridge an open courtyard.
      const fp = b.footprint;
      const minX = Math.min(...fp.map((p) => p[0])),
        maxX = Math.max(...fp.map((p) => p[0]));
      const minZ = Math.min(...fp.map((p) => p[1])),
        maxZ = Math.max(...fp.map((p) => p[1]));
      for (let x = minX + 3; x < maxX - 3; x += 6)
        for (let z = minZ + 3; z < maxZ - 3; z += 5) {
          const corners: Point[] = [
            [x - 2, z - 1.3],
            [x + 2, z - 1.3],
            [x + 2, z + 1.3],
            [x - 2, z + 1.3],
          ];
          if (
            !corners.every((p) => inside(p, fp)) ||
            fp.some(
              (a, i) =>
                distance([x, z], closest([x, z], a, fp[(i + 1) % fp.length])) <
                3,
            )
          )
            continue;
          const panel = MeshBuilder.CreateBox(
            "dorm blue roof panel",
            { width: 4, height: 0.16, depth: 2.6 },
            scene,
          );
          panel.position.set(x, base + b.height + 0.55, z);
          panel.rotation.x = 0.12;
          panel.material = glass;
          parts.push(panel);
        }
    }
    // Simple rooftop planting and equipment stay well inside the main footprint.
    if (b.footprint.length === 4) {
      const a = b.footprint[0],
        d = b.footprint[1],
        len = distance(a, d);
      const eq = MeshBuilder.CreateBox(
        "roof equipment",
        { width: Math.min(6, len * 0.3), height: 1.1, depth: 2.8 },
        scene,
      );
      eq.position.set(cx, base + b.height + 0.8, cz);
      eq.rotation.y = -Math.atan2(d[1] - a[1], d[0] - a[0]);
      eq.material = stone;
      parts.push(eq);
    }
    if (b.kind === "library") {
      const top = b.footprint.map(
        (p) => [cx + (p[0] - cx) * 0.82, cz + (p[1] - cz) * 0.82] as Point,
      );
      parts.push(
        volume("roof garden", top, 0.14, base + b.height + 0.34, plant),
      );
      const core = b.footprint.map(
        (p) => [cx + (p[0] - cx) * 0.4, cz + (p[1] - cz) * 0.4] as Point,
      );
      parts.push(
        volume("roof skylight", core, 0.75, base + b.height + 0.5, glass),
      );
    }
    finalize(
      parts,
      "facade " + b.placeId + " " + b.name,
      b.kind === "library"
        ? 2200
        : [
              "activity",
              "dorm3",
              "sports-annex",
              "minzu",
              "blcu",
              "dorm62",
              "workshop",
              "geology",
            ].includes(b.kind || "")
          ? 1600
          : 850,
    );
    stats.facadeBuildings++;
  }
  function stadium(data: AtlasData) {
    const c = toWorld(data.places.find((p) => p.id === "stadium")!.point),
      angle = 1.1;
    const transform = (x: number, z: number): Point => [
      c[0] + x * Math.cos(angle) - z * Math.sin(angle),
      c[1] + x * Math.sin(angle) + z * Math.cos(angle),
    ];
    const oval = (r: number): Point[] =>
      Array.from({ length: 129 }, (_, i) => {
        const t = (i / 128) * Math.PI * 2;
        return transform(
          Math.cos(t) * r + (Math.cos(t) >= 0 ? 42 : -42),
          Math.sin(t) * r,
        );
      });
    const blue = material("coastal blue track", "#3e9bc8"),
      green = material("football turf", "#639850"),
      white = material("field line", "#eef1df"),
      seatBlue = material("blue stands", "#507eae");
    // Overlay markings remain stable on browsers with lower depth precision.
    white.zOffset = -6;
    blue.zOffset = -3;
    green.zOffset = -1;
    const parts: Mesh[] = [],
      solids: Mesh[] = [];
    function ring(
      outer: Point[],
      inner: Point[],
      offset: number,
      mat: StandardMaterial,
    ) {
      for (let i = 0; i < outer.length - 1; i++)
        parts.push(
          polygon(
            "track strip",
            [outer[i], outer[i + 1], inner[i + 1], inner[i]],
            offset,
            mat,
          ),
        );
    }
    const outer = oval(39),
      inner = oval(30);
    ring(outer, inner, 0.12, blue);
    parts.push(polygon("turf", inner.slice(0, -1), 0.09, green));
    for (let lane = 0; lane < 8; lane++)
      ring(oval(30 + lane * 1.16 + 0.07), oval(30 + lane * 1.16), 0.15, white);
    const line = (a: Point, b: Point, w = 0.12) => {
      const len = distance(a, b),
        dx = (b[0] - a[0]) / len,
        dz = (b[1] - a[1]) / len;
      parts.push(
        polygon(
          "pitch line",
          [
            [a[0] - dz * w, a[1] + dx * w],
            [b[0] - dz * w, b[1] + dx * w],
            [b[0] + dz * w, b[1] - dx * w],
            [a[0] + dz * w, a[1] - dx * w],
          ],
          0.17,
          white,
        ),
      );
    };
    for (const [a, b] of [
      [
        [-51, -27],
        [51, -27],
      ],
      [
        [51, -27],
        [51, 27],
      ],
      [
        [51, 27],
        [-51, 27],
      ],
      [
        [-51, 27],
        [-51, -27],
      ],
      [
        [0, -27],
        [0, 27],
      ],
    ] as [Point, Point][])
      line(transform(...a), transform(...b));
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2,
        b = ((i + 1) / 48) * Math.PI * 2;
      line(
        transform(9.15 * Math.cos(a), 9.15 * Math.sin(a)),
        transform(9.15 * Math.cos(b), 9.15 * Math.sin(b)),
      );
    }
    // Open on the seaward side, matching the supplied aerial photograph.
    for (let i = 0; i < 64; i++) {
      const t = (i / 64) * Math.PI * 2;
      if (Math.sin(t) > 0.55) continue;
      for (let tier = 0; tier < 5; tier++) {
        const a = oval(43 + tier * 2),
          b = oval(45 + tier * 2);
        const fp = [a[i * 2], a[i * 2 + 2], b[i * 2 + 2], b[i * 2]];
        const base = Math.min(...fp.map((p) => height(...p)));
        const m = volume(
          "stand tier",
          fp,
          0.8 + tier * 0.8,
          base,
          tier % 2 ? ivory : seatBlue,
        );
        parts.push(m);
        if (tier === 4)
          solids.push(
            volume("stand collision", fp, 0.8 + tier * 0.8, base, seatBlue),
          );
      }
    }
    for (const end of [-1, 1]) {
      const fp = [transform(end * 51, -3.66), transform(end * 51, 3.66)];
      for (const p of fp) {
        const m = MeshBuilder.CreateCylinder(
          "goal post",
          { height: 2.44, diameter: 0.13, tessellation: 6 },
          scene,
        );
        m.position.set(p[0], height(...p) + 1.22, p[1]);
        m.material = white;
        parts.push(m);
      }
      const bar = MeshBuilder.CreateBox(
        "goal crossbar",
        { width: 7.32, height: 0.13, depth: 0.13 },
        scene,
      );
      const p = transform(end * 51, 0);
      bar.position.set(p[0], height(...p) + 2.44, p[1]);
      bar.rotation.y = -angle - Math.PI / 2;
      bar.material = white;
      parts.push(bar);
    }
    finalize(parts, "blue coastal stadium", 2200);
    for (const m of solids) m.isVisible = false;
    return solids;
  }
  function library(data: AtlasData) {
    const c = toWorld(data.places.find((p) => p.id === "library")!.point);
    const fp: Point[] = [
      [-14, -15],
      [16, -15],
      [25, 1],
      [12, 18],
      [-14, 18],
    ].map(([x, z]) => [c[0] + x, c[1] + z]);
    const base = Math.min(...fp.map((p) => height(...p)));
    const atrium = volume("library shared atrium", fp, 12.5, base, glass);
    atrium.metadata = { placeId: "library" };
    const canopy = volume("library atrium canopy", fp, 0.3, base + 12.5, ivory);
    canopy.isPickable = false;
    return [atrium];
  }
  return { facade, stadium, library, stats };
}
