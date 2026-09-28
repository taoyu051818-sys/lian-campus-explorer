// Existing procedural campus builders now run at build time, never in the WebGPU page.
import {
  NullEngine,
  Scene,
  Vector3,
  Mesh,
  MeshBuilder,
  VertexData,
  StandardMaterial,
  Color3,
} from "@babylonjs/core";
import earcut from "earcut";
import { geometry, toWorld, distance, type Point } from "../src/world-geometry";
import { refine, type RefinedBuilding } from "../src/refinement";
import { createDetails } from "../src/architectural-details";
import { createLandscape, createTurfTexture } from "../src/landscape";
import { createSchoolGrounds } from "../src/school-grounds";
import { createForecourts } from "../src/fire-station";
import { createTransportSites } from "../src/transport-details";
import { createTeachingAccess } from "../src/teaching-access";
import type { AtlasData } from "../src/atlas";
export function buildCampus(data: AtlasData, campus: any, plans: any) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const geo = geometry(data, campus),
    height = geo.height;
  const registrations = refine(geo, data, plans);
  const mat = (name: string, hex: string) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor.set(0.03, 0.03, 0.03);
    return m;
  };
  const grass = mat("terrain", "#879e59"),
    asphalt = mat("roads", "#657778"),
    shoulder = mat("walkways", "#d9d9c9"),
    white = mat("road markings", "#e8e7d5"),
    grey = mat("schematic blocks", "#bcc3be"),
    traced = mat("traced UESTC", "#e5dcc5"),
    roof = mat("roofs", "#909f99"),
    parcelMat = mat("parcel surfaces", "#90a865");
  const turfTexture = createTurfTexture(scene);
  grass.diffuseTexture = turfTexture;
  parcelMat.diffuseTexture = turfTexture;
  const ground = new Mesh("continuous terrain", scene),
    positions: number[] = [],
    indices: number[] = [],
    normals: number[] = [];
  const xmin = -1840,
    xmax = 3360,
    zmin = -2100,
    zmax = 3900,
    step = 20,
    nx = (xmax - xmin) / step,
    nz = (zmax - zmin) / step;
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      const x = xmin + i * step,
        z = zmin + j * step;
      positions.push(x, geo.rawHeight(x, z), z);
    }
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i,
        b = a + 1,
        c = a + nx + 1,
        d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  VertexData.ComputeNormals(positions, indices, normals);
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.normals = normals;
  vd.uvs = positions.flatMap((_, i) =>
    i % 3 === 0 ? [positions[i] / 12, positions[i + 2] / 12] : [],
  );
  vd.applyToMesh(ground);
  ground.material = grass;

  function ribbon(
    name: string,
    path: Point[],
    width: number,
    offset: number,
    material: StandardMaterial,
    subdivision = 8,
  ) {
    const ps: number[] = [],
      ix: number[] = [];
    for (let j = 1; j < path.length; j++) {
      const a = path[j - 1],
        b = path[j],
        len = distance(a, b),
        n = Math.max(1, Math.ceil(len / subdivision)),
        dx = (b[0] - a[0]) / len,
        dz = (b[1] - a[1]) / len;
      const start = ps.length / 3;
      for (let k = 0; k <= n; k++) {
        const x = a[0] + ((b[0] - a[0]) * k) / n,
          z = a[1] + ((b[1] - a[1]) * k) / n;
        for (const sign of [-1, 1]) {
          const px = x - ((dz * width) / 2) * sign,
            pz = z + ((dx * width) / 2) * sign;
          ps.push(px, height(px, pz) + offset, pz);
        }
      }
      for (let k = 0; k < n; k++) {
        const a = start + k * 2;
        ix.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const m = new Mesh(name, scene),
      v = new VertexData(),
      ns: number[] = [];
    VertexData.ComputeNormals(ps, ix, ns);
    v.positions = ps;
    v.indices = ix;
    v.normals = ns;
    v.applyToMesh(m);
    m.material = material;
    m.isPickable = false;
    return m;
  }
  for (const r of geo.roads) {
    ribbon(r.name + "步道", r.points, r.width + 7, 0.12, shoulder);
    ribbon(r.name, r.points, r.width, 0.22, asphalt);
    for (const p of r.points) {
      const m = MeshBuilder.CreateDisc(
        "junction",
        {
          radius: r.width / 2,
          tessellation: 20,
          sideOrientation: Mesh.DOUBLESIDE,
        },
        scene,
      );
      m.rotation.x = Math.PI / 2;
      m.position.set(p[0], height(...p) + 0.25, p[1]);
      m.material = asphalt;
      m.isPickable = false;
    }
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1],
        b = r.points[i],
        len = distance(a, b);
      for (let s = 8; s < len - 6; s += 20) {
        const p: Point = [
            a[0] + ((b[0] - a[0]) * s) / len,
            a[1] + ((b[1] - a[1]) * s) / len,
          ],
          q: Point = [
            a[0] + ((b[0] - a[0]) * (s + 5)) / len,
            a[1] + ((b[1] - a[1]) * (s + 5)) / len,
          ];
        ribbon("dash", [p, q], 0.25, 0.31, white);
      }
    }
  }
  const dashes = scene.meshes.filter((m) => m.name === "dash") as Mesh[];
  if (dashes.length)
    Mesh.MergeMeshes(dashes, true, true, undefined, false, false);
  function volume(
    name: string,
    fp: Point[],
    h: number,
    base: number,
    material: StandardMaterial,
  ) {
    const m = MeshBuilder.ExtrudePolygon(
      name,
      {
        shape: fp.map((p) => new Vector3(p[0], 0, p[1])),
        depth: h,
        sideOrientation: Mesh.DOUBLESIDE,
      },
      scene,
      earcut,
    );
    m.position.y = base + h;
    m.material = material;
    return m;
  }
  const physicalMeshes: Mesh[] = [ground];
  const details = createDetails(scene, height, volume);
  for (const p of data.places) {
    // A75/A79 crosses the stadium terrain transition; its coarse parcel overlay hid ground paths.
    if (!p.polygon || p.id === "teaching") continue;
    const fp = p.polygon.map(toWorld);
    const m = MeshBuilder.CreatePolygon(
      "parcel " + p.id,
      {
        shape: fp.map((q) => new Vector3(q[0], 0, q[1])),
        sideOrientation: Mesh.DOUBLESIDE,
      },
      scene,
      earcut,
    );
    const ps = m.getVerticesData("position")!;
    for (let i = 0; i < ps.length; i += 3)
      ps[i + 1] = height(ps[i], ps[i + 2]) + 0.045;
    m.setVerticesData("position", ps);
    m.setVerticesData(
      "uv",
      Array.from(ps).flatMap((_, i) =>
        i % 3 === 0 ? [ps[i] / 12, ps[i + 2] / 12] : [],
      ),
    );
    m.material = parcelMat;
    m.isPickable = false;
  }
  const facilityBase = new Map<string, number>();
  for (const id of [
    "hall",
    "workshop",
    "geology",
    "law",
    "energy",
    "hospital",
    "fire",
    "police",
    "dorm56",
    "dorm52",
  ]) {
    const points = geo.buildings
      .filter((b) => b.placeId === id)
      .flatMap((b) => b.footprint);
    facilityBase.set(id, Math.min(...points.map((p) => height(...p))) - 0.15);
  }
  let generatedBuildings = 0;
  for (const b of geo.buildings as RefinedBuilding[]) {
    const base =
      b.fixedBase ??
      (facilityBase.get(b.placeId) ??
        Math.min(...b.footprint.map((p) => height(...p))) - 0.15) +
        (b.baseOffset || 0);
    if (b.placeId === "library" && b.height < 30) {
      const cx = b.footprint.reduce((s, p) => s + p[0], 0) / b.footprint.length;
      const cz = b.footprint.reduce((s, p) => s + p[1], 0) / b.footprint.length;
      for (let floor = 0; floor < 4; floor++) {
        const fp = b.footprint.map(
          (p) =>
            [
              cx + (p[0] - cx) * (1 - floor * 0.065),
              cz + (p[1] - cz) * (1 - floor * 0.065),
            ] as Point,
        );
        const y = base + floor * 4.4;
        const body = volume(b.name + " terrace " + floor, fp, 4.4, y, traced);
        body.metadata = { placeId: b.placeId };
        physicalMeshes.push(body);
        details.facade(
          { ...b, footprint: fp, height: 4.4, floors: 1, kind: "library" },
          y,
        );
      }
      continue;
    }
    const solid = volume(
      b.name,
      b.footprint,
      b.height,
      base,
      b.traced || b.placeId === "library" ? traced : grey,
    );
    solid.metadata = { placeId: b.placeId };
    physicalMeshes.push(solid);
    const cap = volume(
      "roof " + b.name,
      b.footprint,
      0.3,
      base + b.height,
      roof,
    );
    cap.isPickable = false;
    details.facade(b, base);
  }
  for (const path of campus.roads as Point[][])
    ribbon("UESTC internal road", path.map(geo.local), 5, 0.24, shoulder);
  const entrance = geo.local(campus.roads[0][0]);
  ribbon(
    "UESTC access",
    [entrance, geo.nearestRoad(entrance).point],
    6,
    0.26,
    shoulder,
  );
  const walkPaving = new StandardMaterial("residential path paving", scene);
  walkPaving.diffuseColor = Color3.FromHexString("#c3b7a0");
  walkPaving.specularColor.set(0.08, 0.08, 0.08);
  for (const path of geo.walkways) {
    ribbon(
      path.name + " edge",
      path.points,
      path.width + 0.4,
      0.18,
      shoulder,
      2,
    );
    ribbon(path.name, path.points, path.width, 0.21, walkPaving, 2);
  }
  physicalMeshes.push(...createTeachingAccess(scene, geo, volume));
  const landscape = createLandscape(scene, geo, data, campus);
  createSchoolGrounds(scene, geo);
  createForecourts(scene, geo);
  physicalMeshes.push(...createTransportSites(scene, geo).physical);
  physicalMeshes.push(...details.stadium(data));
  physicalMeshes.push(...details.library(data));

  return {
    scene,
    engine,
    geo,
    registrations,
    physicalMeshes,
    details,
    landscape,
  };
}
