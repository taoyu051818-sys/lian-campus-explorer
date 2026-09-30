import * as THREE from "three/webgpu";
import {
  Fn,
  If,
  dFdx,
  dFdy,
  float,
  vec2,
  vec3,
  texture,
  positionWorld,
  normalWorldGeometry,
  materialColor,
  vertexColor,
  attribute,
  positionLocal,
  transformNormalToView,
  normalize,
  mix,
  smoothstep,
  sin,
  fract,
  max,
  min,
  dot,
  sqrt,
  fwidth,
} from "three/tsl";
import { physical } from "../vendor/tidewater/materials/Materials.js";
import { VillageTextures } from "../vendor/tidewater/world/village/TextureBaker.js";
import { getDetailTexture } from "../vendor/tidewater/world/terrain/DetailTextures.js";
import {
  srgb,
  rot2,
  triWeights,
  triplanar,
  perturbNormal,
  meadowTone,
  rockSurface,
} from "../vendor/tidewater/world/terrain/TerrainShading.js";
import { translucency } from "../vendor/tidewater/world/vegetation/VegMaterials.js";
import {
  gustAt,
  windDir3,
} from "../vendor/tidewater/world/vegetation/VegNodes.js";
import { LeafAtlas } from "../vendor/tidewater/world/vegetation/LeafTextures.js";
import { G } from "../vendor/tidewater/core/Globals.js";
import { materialFamily } from "./material-catalog.js";

// Tidewater's packed maps are linear data: RG normal.xy, B roughness, A AO.
// World-space projection keeps texel density in metres on the baked campus meshes,
// whose original UVs range from normalized boxes to very long facade strips.
function mappedNormal(tex, p, N, tile, strength) {
  const w = triWeights(N);
  const filteredStrength = float(strength).mul(
    float(1).sub(smoothstep(tile / 140, tile / 14, fwidth(p).length())),
  );
  const unpack = (t) => {
    const xy = t.xy.mul(2).sub(1);
    return xy
      .div(sqrt(max(float(1).sub(dot(xy, xy)), 0.04)))
      .mul(filteredStrength);
  };
  const x = unpack(texture(tex, p.zy.div(tile)));
  const y = unpack(texture(tex, p.xz.div(tile).add(0.37)));
  const z = unpack(texture(tex, p.xy.div(tile).add(0.71)));
  const slope = vec3(0, x.y, x.x)
    .mul(w.x)
    .add(vec3(y.x, 0, y.y).mul(w.y))
    .add(vec3(z.x, z.y, 0).mul(w.z));
  return normalize(N.add(slope.sub(N.mul(dot(N, slope)))));
}

// Analytic joints are filtered in metres; they fade when smaller than a pixel.
function joints(q, size, width) {
  const cell = q.div(size);
  const edge = min(fract(cell), float(1).sub(fract(cell))).mul(size);
  const aa = max(fwidth(q), vec2(0.001));
  const j = float(1).sub(smoothstep(vec2(width), vec2(width).add(aa), edge));
  return max(j.x, j.y).mul(
    float(1).sub(smoothstep(0.08, 0.3, max(aa.x, aa.y))),
  );
}

export function createCampusMaterialSystem() {
  const baker = new VillageTextures();
  const detail = getDetailTexture();
  const leaves = new LeafAtlas();
  const T = baker.textures;
  const created = new Set();
  const foliageCache = new Map();
  const sprigCache = new Map();
  let shoreWetness = null;

  function ground(m, turfOnly = false) {
    const rough = float(0.95).toVar(),
      normal = vec3(0, 1, 0).toVar(),
      ao = float(1).toVar();
    m.colorNode = Fn(() => {
      const p = positionWorld,
        N = normalize(normalWorldGeometry);
      const a = texture(detail, rot2(p.xz, 0.7).div(173));
      const b = texture(detail, rot2(p.xz, 2.1).div(47));
      const mid = texture(detail, p.xz.div(4.7));
      const fine = texture(detail, rot2(p.xz, 0.4).div(0.65));
      const grain = texture(detail, p.xz.div(0.18));
      const footprint = fwidth(p).length();
      const near = float(1).sub(smoothstep(0.015, 0.12, footprint));
      const mt = meadowTone(a.a, b.a, float(1).sub(N.y), N.z, mid.a);
      const clump = mid.a.mul(0.6).add(fine.g.mul(0.4));
      const comb = texture(detail, vec2(p.x.mul(0.14), p.z.mul(1.1))).a;
      const grass = (
        turfOnly
          ? materialColor.rgb
          : mix(materialColor.rgb.mul(0.75), mt.tone.mul(1.25), 0.45)
      )
        .mul(clump.sub(0.5).mul(0.65).add(1))
        .mul(fine.g.sub(0.4).mul(0.24).add(1))
        .mul(comb.sub(0.5).mul(0.2).add(1));
      // Source-style grain is restored here at a physical scale, with mip filtering.
      const hd = fine.g.mul(0.016).add(grain.g.mul(0.003).mul(near)).toVar();
      const col = grass.toVar();
      if (!turfOnly) {
        const h = p.y.sub(G.seaLevel);
        const beach = float(1).sub(
          smoothstep(1.2, 7.0, h.add(b.a.sub(0.5).mul(4))),
        );
        const wet = smoothstep(
          1.1,
          0.12,
          h.add(mid.a.sub(0.5).mul(0.4)),
        ).toVar();
        if (shoreWetness)
          If(h.lessThan(2.0), () => {
            wet.assign(max(wet, shoreWetness(p.xz, p.y)));
          });
        const sand = mix(srgb(0.83, 0.75, 0.6), srgb(0.9, 0.84, 0.72), a.a)
          .mul(fine.b.sub(0.45).mul(0.28).add(1))
          .mul(mix(1, 0.58, wet));
        const ripple = sin(p.x.mul(49).add(mid.a.mul(7)))
          .mul(0.5)
          .add(0.5);
        const forest = smoothstep(30, 80, p.y).mul(float(1).sub(beach));
        const woodland = mix(
          srgb(0.18, 0.31, 0.16),
          srgb(0.3, 0.42, 0.22),
          b.a,
        ).mul(mid.a.mul(0.3).add(0.8));
        const marsh = smoothstep(0.5, 1.7, h)
          .mul(float(1).sub(smoothstep(4.5, 7.5, h)))
          .mul(smoothstep(0.96, 0.995, N.y));
        const tidalSoil = mix(
          srgb(0.43, 0.4, 0.28),
          srgb(0.4, 0.49, 0.29),
          a.a,
        );
        col.assign(
          mix(mix(mix(grass, woodland, forest), sand, beach), tidalSoil, marsh),
        );
        hd.assign(
          mix(hd, fine.b.mul(0.004).add(ripple.mul(0.003).mul(near)), beach),
        );
        rough.assign(mix(0.96, 0.23, wet.mul(beach)));
        // Flat campus lawns do not need the cliff shader. Take derivatives before
        // branching and pass explicit gradients, as Tidewater's terrain does.
        const grad = {
          dpdx: dFdx(p).toVar(),
          dpdy: dFdy(p).toVar(),
          fwY: fwidth(h).toVar(),
        };
        const rockWeight = smoothstep(0.32, 0.7, float(1).sub(N.y)).toVar();
        const macro = a.a.toVar();
        If(rockWeight.greaterThan(0.001), () => {
          const rock = rockSurface({ tex: detail, p, N, h, macro, grad });
          col.assign(mix(col, rock.albedo, rockWeight));
          hd.assign(mix(hd, rock.hd, rockWeight));
          rough.assign(mix(rough, rock.rough, rockWeight));
        });
      }
      normal.assign(perturbNormal(N, hd));
      ao.assign(smoothstep(0.15, 0.7, clump).mul(0.18).add(0.82));
      return col;
    })();
    m.normalNode = transformNormalToView(normal);
    m.roughnessNode = rough;
    m.aoNode = ao;
  }

  function create(entry) {
    const family = materialFamily(entry.name);
    const isGlass = family === "glass" || family === "solar";
    const m = physical({
      name: entry.name,
      color: new THREE.Color().setRGB(...entry.color, THREE.SRGBColorSpace),
      roughness: 0.8,
      metalness: 0,
      side: entry.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
      transparent: entry.alpha < 1,
      opacity: entry.alpha,
      depthWrite: entry.alpha >= 1,
    });
    m.userData.family = family;
    m.underwaterLighting =
      family === "terrain" ? "full" : family === "foliage" ? "none" : "lite";
    created.add(m);
    if (family === "terrain" || family === "turf") {
      ground(m, family === "turf");
      return m;
    }
    const p = positionWorld,
      N = normalize(normalWorldGeometry),
      w = triWeights(N);
    const sample = (t, tile) => triplanar(t, p, w, tile);
    const macro = sample(T.grime, 19),
      grime = sample(T.grime, 2.7);
    const fine = sample(
      detail,
      family === "asphalt" || family === "rubber" ? 1.8 : 0.65,
    );
    let col = materialColor.rgb,
      rough = float(0.85),
      ao = float(1);
    let n = N;

    if (family === "water") {
      m.ior = 1.333;
      m.clearcoat = 1;
      m.clearcoatRoughness = 0.13;
      m.envMapIntensity = 0.7;
      rough = float(0.19);
      col = col.mul(macro.a.mul(0.12).add(0.88));
      n = mappedNormal(T.paintN, p, N, 7, 0.035);
    } else if (isGlass) {
      // Non-metallic dielectric glazing: Fresnel/IOR handles the reflection.
      // Alpha glass retains the authored see-through balcony panels; opaque panes
      // represent shaded interiors, so no fictional rooms are generated.
      m.ior = 1.5;
      m.specularIntensity = 1;
      m.envMapIntensity = 1.05;
      m.clearcoat = 0.25;
      m.clearcoatRoughness = 0.09;
      rough = grime.r.mul(0.045).add(0.075);
      col = col.mul(macro.a.sub(0.5).mul(0.1).add(0.76));
      n = mappedNormal(T.paintN, p, N, 2.5, 0.025);
      if (family === "solar") {
        const q = vec2(p.x, p.z);
        const grid = joints(q, vec2(0.16, 0.16), 0.0015);
        col = mix(col.mul(0.6), srgb(0.47, 0.52, 0.58), grid.mul(0.6));
        rough = rough.add(0.08);
      }
    } else if (family === "foliage") {
      // Solid low shrubs use leaf clusters as relief, preserving their silhouettes.
      const st = fract(p.xz.div(0.7));
      const leaf = leaves.sample(st, float(2));
      const variation = mix(0.63, 1.15, leaf.r).mul(leaf.g.mul(0.35).add(0.76));
      col = col.mul(variation).mul(macro.a.mul(0.15).add(0.85));
      rough = leaf.b.mul(0.16).add(0.61);
      n = perturbNormal(N, leaf.r.mul(0.007).add(fine.g.mul(0.005)));
      ao = mix(0.7, 1, leaf.r);
      m.specularIntensity = 0.3;
      m.translucencyNode = (light) =>
        translucency(materialColor.rgb, normalWorldGeometry, 0.16, light);
    } else if (family === "metal" || family === "roofMetal") {
      const pack = sample(T.hardN, 1.6),
        wear = sample(T.hardA, 1.6);
      const roof = family === "roofMetal";
      rough = pack.b.mul(0.22).add(roof ? 0.34 : 0.26);
      m.metalness = roof ? 0.7 : 0.65;
      col = col
        .mul(macro.a.sub(0.5).mul(0.14).add(1))
        .mul(wear.g.mul(0.12).add(0.92));
      n = mappedNormal(T.hardN, p, N, 1.6, 0.16);
      ao = mix(1, pack.a, 0.35);
      if (roof) {
        const packRoof = sample(T.roofN, 2);
        n = mappedNormal(T.roofN, p, n, 2, 0.28);
        rough = mix(rough, packRoof.b, 0.3);
      }
    } else if (family === "stone") {
      const A = sample(T.stoneA, 2.2),
        pack = sample(T.stoneN, 2.2);
      // Keep campus limestone pale; use Tidewater's pits, joints and AO.
      col = col.mul(A.rgb.mul(0.65).add(0.72));
      rough = pack.b.mul(0.2).add(0.68);
      ao = mix(1, pack.a, 0.7);
      n = mappedNormal(T.stoneN, p, N, 2.2, 0.42);
    } else if (family === "asphalt" || family === "rubber") {
      col = col
        .mul(fine.b.sub(0.45).mul(0.5).add(0.91))
        .mul(macro.a.sub(0.5).mul(0.24).add(1));
      rough = fine.b.mul(0.13).add(0.84);
      n = perturbNormal(N, fine.b.mul(0.004));
      ao = fine.b.mul(0.1).add(0.9);
    } else {
      const paint = family === "paint" || family === "plastic";
      const pack = sample(T.paintN, 1.5);
      col = col
        .mul(
          macro.a
            .sub(0.5)
            .mul(paint ? 0.05 : 0.13)
            .add(1),
        )
        .mul(float(1).sub(grime.r.mul(paint ? 0.025 : 0.09)));
      n = mappedNormal(T.paintN, p, N, 1.5, paint ? 0.15 : 0.5);
      rough = pack.b.mul(0.13).add(paint ? 0.5 : 0.75);
      ao = mix(1, pack.a, 0.4);
      if (
        family === "concrete" ||
        family === "paving" ||
        family === "ceramic"
      ) {
        n = perturbNormal(
          n,
          fine.b.mul(family === "concrete" ? 0.0015 : 0.0025),
        );
        const q = vec2(
          p.x.mul(w.y.add(w.z)).add(p.z.mul(w.x)),
          p.y.mul(w.x.add(w.z)).add(p.z.mul(w.y)),
        );
        const size =
          family === "paving"
            ? vec2(0.6, 0.4)
            : family === "ceramic"
              ? vec2(0.6, 0.3)
              : vec2(3, 1.5);
        const j = joints(q, size, family === "concrete" ? 0.003 : 0.005);
        col = col.mul(float(1).sub(j.mul(family === "concrete" ? 0.12 : 0.24)));
        n = perturbNormal(n, j.mul(-0.0018));
        ao = ao.mul(float(1).sub(j.mul(0.16)));
      }
    }
    m.colorNode = col.add(baker.trigger);
    m.roughnessNode = rough.clamp(0.04, 1);
    m.normalNode = transformNormalToView(n);
    m.aoNode = ao;
    return m;
  }

  return {
    create,
    baker,
    detail,
    setShoreWetness(fn) {
      shoreWetness = fn;
    },
    // Clones of ScenePhysicalMaterial must retain its additional lighting fields.
    vertexColored(m) {
      if (foliageCache.has(m)) return foliageCache.get(m);
      const copy = m.clone();
      copy.vertexColors = true;
      copy.underwaterLighting = m.underwaterLighting;
      copy.translucencyNode = m.translucencyNode
        ? (light) =>
            translucency(
              materialColor.rgb.mul(vertexColor().rgb),
              normalWorldGeometry,
              0.16,
              light,
            )
        : null;
      created.add(copy);
      foliageCache.set(m, copy);
      return copy;
    },
    forMesh(m, entry, geometry) {
      if (!entry.name.startsWith("shrub leaf detail")) return m;
      // Five authored vertices per sprig; anchor its base so leaves flutter without
      // sliding their whole bed or changing the collision meshes.
      if (!geometry.hasAttribute("leafSway")) {
        const pos = geometry.attributes.position;
        const weights = new Float32Array(pos.count);
        for (let i = 0; i < pos.count; i += 5) {
          let base = Infinity,
            top = -Infinity;
          for (let j = 0; j < 5; j++) {
            const y = pos.getY(i + j);
            base = Math.min(base, y);
            top = Math.max(top, y);
          }
          for (let j = 0; j < 5; j++)
            weights[i + j] =
              (pos.getY(i + j) - base) / Math.max(0.02, top - base);
        }
        geometry.setAttribute(
          "leafSway",
          new THREE.BufferAttribute(weights, 1),
        );
      }
      if (sprigCache.has(m)) return sprigCache.get(m);
      const copy = m.clone();
      copy.underwaterLighting = m.underwaterLighting;
      copy.translucencyNode = m.translucencyNode;
      copy.positionNode = Fn(() => {
        const phase = G.time
          .mul(3.2)
          .add(positionLocal.x.mul(0.47))
          .add(positionLocal.z.mul(0.31));
        const wind = sin(phase)
          .mul(0.014)
          .add(gustAt(positionLocal.xz).mul(0.012));
        return positionLocal.add(
          windDir3.mul(wind).mul(attribute("leafSway", "float")),
        );
      })();
      copy.castShadowPositionNode = copy.positionNode;
      created.add(copy);
      sprigCache.set(m, copy);
      return copy;
    },
    bake(renderer) {
      baker.bake(renderer);
      leaves.bake(renderer);
    },
    dispose() {
      baker.dispose();
      leaves.rt.dispose();
      detail.dispose();
      created.forEach((m) => m.dispose());
    },
  };
}
