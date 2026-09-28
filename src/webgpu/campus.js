import * as THREE from "three/webgpu";
import { positionWorld, mix, color, sin, cos, smoothstep } from "three/tsl";

export async function loadCampus(progress) {
  const base = import.meta.env.BASE_URL;
  const [metaResponse, binaryResponse] = await Promise.all([
    fetch(`${base}generated/campus.json`),
    fetch(`${base}generated/campus.meshpack`),
  ]);
  if (!metaResponse.ok || !binaryResponse.ok)
    throw new Error("校园模型未生成，请先运行 npm run bake。");
  const meta = await metaResponse.json();
  const buffer = await new Response(
    binaryResponse.body.pipeThrough(new DecompressionStream("gzip")),
  ).arrayBuffer();
  if (buffer.byteLength !== meta.byteLength)
    throw new Error("校园模型不完整，请刷新重新加载。");
  const root = new THREE.Group(),
    colliders = [],
    lodMeshes = [],
    renderMeshes = [];
  root.name = "黎安校园";
  const materials = meta.materials.map((entry) => {
    const glass = /glass|glaz|玻璃/i.test(entry.name),
      metal = /metal|steel|alumin|金属/i.test(entry.name);
    const material = new THREE.MeshStandardNodeMaterial({
      name: entry.name,
      color: new THREE.Color().setRGB(...entry.color, THREE.SRGBColorSpace),
      roughness: glass ? 0.16 : metal ? 0.4 : 0.87,
      metalness: glass ? 0.25 : metal ? 0.6 : 0,
      side: entry.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
      transparent: entry.alpha < 1,
      opacity: entry.alpha,
      depthWrite: entry.alpha >= 1,
    });
    if (glass) {
      material.color.lerp(new THREE.Color("#517b88"), 0.38);
      material.envMapIntensity = 0.85;
    }
    if (entry.name === "terrain") {
      const p = positionWorld;
      const variation = sin(p.x.mul(0.027))
        .mul(cos(p.z.mul(0.019)))
        .mul(0.5)
        .add(0.5);
      const grass = mix(color("#526b32"), color("#849858"), variation);
      const sand = color("#c9b58a");
      material.colorNode = mix(sand, grass, smoothstep(0.5, 7, p.y));
      material.roughness = 1;
    }
    if (/roads|road markings|walkways|paving/i.test(entry.name))
      material.roughness = 0.98;
    return material;
  });
  function attr(record, size, index = false) {
    return new THREE.BufferAttribute(
      index
        ? new Uint32Array(buffer, record.offset, record.count)
        : new Float32Array(buffer, record.offset, record.count),
      size,
    );
  }
  for (let i = 0; i < meta.meshes.length; i++) {
    const entry = meta.meshes[i],
      geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", attr(entry.position, 3));
    geometry.setAttribute("normal", attr(entry.normal, 3));
    geometry.setIndex(attr(entry.index, 1, true));
    if (entry.uv) geometry.setAttribute("uv", attr(entry.uv, 2));
    let mats = entry.materials.map((id) => materials[id]);
    if (entry.color) {
      const colorArray = new Float32Array(
        buffer,
        entry.color.offset,
        entry.color.count,
      ).slice();
      for (let j = 0; j < colorArray.length; j += 4)
        for (let k = 0; k < 3; k++) {
          const c = colorArray[j + k];
          colorArray[j + k] =
            c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        }
      geometry.setAttribute("color", new THREE.BufferAttribute(colorArray, 4));
      mats = mats.map((m) => {
        const copy = m.clone();
        copy.vertexColors = true;
        return copy;
      });
    }
    entry.groups.forEach((g) =>
      geometry.addGroup(g.start, g.count, g.materialIndex),
    );
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    const mesh = new THREE.Mesh(geometry, mats.length === 1 ? mats[0] : mats);
    mesh.name = entry.name;
    mesh.userData.placeId = entry.placeId;
    mesh.visible = entry.visible;
    mesh.receiveShadow = true;
    mesh.castShadow =
      entry.visible && entry.collision && entry.name !== "continuous terrain";
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    if (entry.collision)
      colliders.push({
        name: entry.name,
        placeId: entry.placeId,
        position: geometry.attributes.position.array,
        index: geometry.index.array,
      });
    if (entry.visible) {
      root.add(mesh);
      renderMeshes.push(mesh);
    }
    if (entry.lod && entry.visible)
      lodMeshes.push({ mesh, distance: entry.lod });
    if (i % 100 === 0) {
      progress(`正在装配校园模型 ${i} / ${meta.meshes.length}…`);
      await new Promise(requestAnimationFrame);
    }
  }
  return { root, meta, colliders, renderMeshes, materials, lodMeshes };
}
