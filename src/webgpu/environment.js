import "../vendor/tidewater/core/TSLPatches.js";
import * as THREE from "three/webgpu";
import {
  Fn,
  vec2,
  vec3,
  vec4,
  float,
  texture,
  positionWorld,
  cameraPosition,
  normalize,
  dot,
  reflect,
  max,
  mix,
  smoothstep,
  pow,
  log2,
  pass,
  uniform,
} from "three/tsl";
import { CSMShadowNode } from "three/addons/csm/CSMShadowNode.js";
import { ao } from "three/addons/tsl/display/GTAONode.js";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { fxaa } from "three/addons/tsl/display/FXAANode.js";
import {
  Atmosphere,
  SUN_ILLUMINANCE,
} from "../vendor/tidewater/sky/Atmosphere.js";
import { Sky, sunDirectionFromTime } from "../vendor/tidewater/sky/Sky.js";
import { Clouds } from "../vendor/tidewater/sky/Clouds.js";
import { Environment } from "../vendor/tidewater/sky/Environment.js";
import { OceanFFT } from "../vendor/tidewater/ocean/OceanFFT.js";
import { CDLOD } from "../vendor/tidewater/core/CDLOD.js";
import { G } from "../vendor/tidewater/core/Globals.js";

const PRESETS = {
  tropical: { hour: 14.8, cloud: 0.36, haze: 0.85, exposure: 0.66, wind: 5.5 },
  morning: { hour: 7.1, cloud: 0.32, haze: 1.2, exposure: 0.76, wind: 4.5 },
  sunset: { hour: 17.5, cloud: 0.41, haze: 1.35, exposure: 0.87, wind: 5 },
};

export function createEnvironment(renderer, scene, camera, campus) {
  const atmosphere = new Atmosphere(renderer),
    sky = new Sky(atmosphere);
  const clouds = new Clouds(renderer, atmosphere);
  sky.clouds = clouds;
  clouds.resolutionScale = 0.5;
  scene.backgroundNode = sky.backgroundNode();
  scene.fog = new THREE.FogExp2(0xb8d4db, 0.000035);
  const sun = new THREE.DirectionalLight(0xfff1df, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 4000;
  sun.shadow.bias = -0.00002;
  sun.shadow.normalBias = 0.065;
  const csm = new CSMShadowNode(sun, {
    cascades: 3,
    maxFar: 1200,
    lightMargin: 300,
  });
  csm.fade = true;
  sun.shadow.shadowNode = csm;
  scene.add(sun, sun.target);
  const env = new Environment(renderer, scene, sky, 64);
  const fft = new OceanFFT(renderer, { choppiness: 0.8 });
  G.seaLevel.value = -0.8;

  // The source terrain is a regular 20 m grid. Share its heights with the water
  // shader so wave amplitude and colour follow this campus's actual shoreline.
  const terrain = campus.colliders.find((m) => m.name === "continuous terrain");
  const h = new Uint16Array(261 * 301);
  for (let i = 0; i < h.length; i++)
    h[i] = THREE.DataUtils.toHalfFloat(terrain.position[i * 3 + 1]);
  const heightTex = new THREE.DataTexture(
    h,
    261,
    301,
    THREE.RedFormat,
    THREE.HalfFloatType,
  );
  heightTex.minFilter = heightTex.magFilter = THREE.LinearFilter;
  heightTex.needsUpdate = true;
  const heightNode = texture(heightTex);
  const seaDepth = (xz) => {
    const uv = xz.sub(vec2(-1840, -2100)).div(vec2(5200, 6000));
    const inside = uv.x
      .greaterThanEqual(0)
      .and(uv.x.lessThanEqual(1))
      .and(uv.y.greaterThanEqual(0))
      .and(uv.y.lessThanEqual(1));
    return inside.select(G.seaLevel.sub(heightNode.sample(uv).r), float(100));
  };
  const cdlod = new CDLOD({
    gridSize: 32,
    leafSize: 16,
    levels: 12,
    maxInstances: 1800,
    minY: -5,
    maxY: 5,
  });
  const dispTex = texture(fft.displacementTexture),
    derivTex = texture(fft.derivativeTexture);
  const waterMaterial = new THREE.MeshBasicNodeMaterial({
    name: "Tidewater FFT ocean",
    side: THREE.FrontSide,
  });
  waterMaterial.positionNode = Fn(() => {
    const { worldXZ, spacing } = cdlod.vertexNodes();
    const depth = seaDepth(worldXZ).toVar(),
      disp = vec3(0).toVar();
    for (let c = 0; c < fft.cascades; c++) {
      const level = max(log2(spacing.div(fft.sizes[c] / 256)).add(0.7), 0);
      const attenuation = smoothstep(
        0,
        Math.min(8, fft.sizes[c] * 0.015),
        depth,
      );
      disp.addAssign(
        dispTex
          .sample(worldXZ.div(fft.sizes[c]))
          .depth(c)
          .level(level)
          .xyz.mul(attenuation),
      );
    }
    return vec3(
      worldXZ.x.add(disp.x),
      G.seaLevel.add(disp.y),
      worldXZ.y.add(disp.z),
    );
  })();
  waterMaterial.colorNode = Fn(() => {
    const xz = positionWorld.xz,
      depth = seaDepth(xz).max(0).toVar();
    const slope = vec2(0).toVar(),
      foam = float(0).toVar();
    for (let c = 0; c < fft.cascades; c++) {
      const att = smoothstep(0, Math.min(8, fft.sizes[c] * 0.015), depth);
      slope.addAssign(
        derivTex.sample(xz.div(fft.sizes[c])).depth(c).xy.mul(att),
      );
      foam.addAssign(dispTex.sample(xz.div(fft.sizes[c])).depth(c).w.mul(0.24));
    }
    const n = normalize(vec3(slope.x.negate(), 1, slope.y.negate()));
    const view = normalize(cameraPosition.sub(positionWorld));
    const reflected = reflect(view.negate(), n);
    const fresnel = pow(float(1).sub(dot(n, view).max(0)), 5)
      .mul(0.98)
      .add(0.02);
    const base = mix(
      vec3(0.045, 0.39, 0.31),
      vec3(0.005, 0.08, 0.105),
      smoothstep(0, 12, depth),
    );
    const reflection = sky.reflectionRadiance(reflected);
    const half = normalize(view.add(G.sunDir));
    const glint = pow(max(dot(n, half), 0), 320)
      .mul(G.sunColor)
      .mul(1.4);
    const water = mix(
      base.mul(G.skyIrradiance.add(0.4)),
      reflection,
      fresnel,
    ).add(glint);
    const shore = smoothstep(0.8, 0.04, depth).mul(smoothstep(0, 0.15, depth));
    return mix(
      water,
      vec3(0.83, 0.91, 0.87).mul(G.skyIrradiance.add(0.6)),
      foam.add(shore.mul(0.35)).clamp(0, 0.7),
    );
  })();
  const water = new THREE.Mesh(cdlod.geometry, waterMaterial);
  water.name = "FFT ocean";
  water.frustumCulled = false;
  scene.add(water);

  const pipeline = new THREE.RenderPipeline(renderer),
    scenePass = pass(scene, camera);
  const color = scenePass.getTextureNode("output"),
    depth = scenePass.getTextureNode("depth");
  const aoPass = ao(depth, null, camera);
  aoPass.resolutionScale = 0.5;
  aoPass.radius.value = 1.8;
  aoPass.thickness.value = 1.8;
  aoPass.samples.value = 8;
  const aoAmount = uniform(0.45),
    bloomPass = bloom(color, 0.08, 0.35, 1.3);
  const graded = vec4(
    color.rgb
      .mul(mix(1, aoPass.getTextureNode().r, aoAmount))
      .add(bloomPass.rgb),
    color.a,
  );
  pipeline.outputNode = fxaa(graded);
  function preset(name) {
    const p = PRESETS[name] || PRESETS.tropical;
    sunDirectionFromTime(p.hour, 18.4, 6, atmosphere.sunDir.value);
    atmosphere.sunDir.value.z *= -1; // Campus authoring uses +Z for north.
    G.sunDir.value.copy(atmosphere.sunDir.value);
    clouds.coverage.value = p.cloud;
    atmosphere.mieScale.value = p.haze;
    atmosphere.invalidate();
    renderer.toneMappingExposure = p.exposure;
    fft.local.windSpeed = p.wind;
    fft.updateSpectrumUniforms();
    env.timer = 0;
  }
  preset("tropical");
  function quality(name) {
    const scale = name === "high" ? 1 : name === "low" ? 0.65 : 0.85;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5) * scale);
    clouds.resolutionScale = name === "high" ? 0.7 : name === "low" ? 0.3 : 0.5;
    pipeline.outputNode = name === "low" ? fxaa(color) : fxaa(graded);
    pipeline.needsUpdate = true;
    aoPass.samples.value = name === "high" ? 12 : 8;
  }
  return {
    preset,
    quality,
    water,
    pipeline,
    update(dt, time) {
      G.time.value = time;
      G.dt.value = dt;
      // Meter-scale contact AO is not meaningful from kilometre-high overview cameras.
      aoAmount.value =
        0.45 * (1 - THREE.MathUtils.smoothstep(camera.position.y, 80, 500));
      atmosphere.update(dt, camera.position.y);
      if (atmosphere.sunTransmittance) {
        G.sunColor.value
          .fromArray(atmosphere.sunTransmittance)
          .multiplyScalar(SUN_ILLUMINANCE);
        G.skyIrradiance.value.fromArray(atmosphere.skyIrradiance);
        G.horizonColor.value.fromArray(atmosphere.horizon);
        sun.color.copy(G.sunColor.value);
        sun.intensity = 1;
        scene.fog.color.copy(G.horizonColor.value);
      }
      sun.position.copy(camera.position).addScaledVector(G.sunDir.value, 500);
      sun.target.position.copy(camera.position);
      clouds.update(dt, camera);
      env.update(dt);
      fft.update(dt);
      cdlod.update(camera);
    },
    render() {
      pipeline.render();
    },
    dispose() {
      pipeline.dispose();
      heightTex.dispose();
      cdlod.geometry.dispose();
      waterMaterial.dispose();
      env.target.dispose();
      env.back?.dispose();
      env.front?.dispose();
      env.pmrem?.dispose();
    },
  };
}
