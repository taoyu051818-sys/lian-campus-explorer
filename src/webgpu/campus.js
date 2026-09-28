import * as THREE from "three/webgpu";
import { createCampusMaterialSystem } from "./materials.js";
import { LAYERS } from "../vendor/tidewater/core/SceneRenderer.js";

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
  const materialSystem = createCampusMaterialSystem();
  const materials = meta.materials.map(materialSystem.create);
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
      mats = mats.map(materialSystem.vertexColored);
    }
    mats = mats.map((m) => materialSystem.forMesh(m, entry, geometry));
    entry.groups.forEach((g) =>
      geometry.addGroup(g.start, g.count, g.materialIndex),
    );
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    if (entry.collision)
      colliders.push({
        name: entry.name,
        placeId: entry.placeId,
        position: geometry.attributes.position.array,
        index: geometry.index.array,
      });
    // A baked building can contain both concrete and glass groups. Separate their
    // draw lists so balcony glass is composited AFTER the ocean refraction pass.
    for (const transparent of [false, true]) {
      const groups = entry.groups.filter(
        (g) => mats[g.materialIndex].transparent === transparent,
      );
      if (!groups.length || !entry.visible) continue;
      const drawGeometry = new THREE.BufferGeometry();
      drawGeometry.attributes = geometry.attributes;
      drawGeometry.setIndex(geometry.index);
      drawGeometry.boundingBox = geometry.boundingBox;
      drawGeometry.boundingSphere = geometry.boundingSphere;
      groups.forEach((g) =>
        drawGeometry.addGroup(g.start, g.count, g.materialIndex),
      );
      const mesh = new THREE.Mesh(drawGeometry, mats);
      mesh.name = entry.name + (transparent ? " · glazing" : "");
      mesh.userData.placeId = entry.placeId;
      mesh.receiveShadow = true;
      mesh.castShadow = !transparent && entry.name !== "continuous terrain";
      mesh.layers.set(transparent ? LAYERS.TRANSPARENT : LAYERS.OPAQUE);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      root.add(mesh);
      renderMeshes.push(mesh);
      if (entry.lod) lodMeshes.push({ mesh, distance: entry.lod });
    }
    if (i % 100 === 0) {
      progress(`正在装配校园模型 ${i} / ${meta.meshes.length}…`);
      await new Promise(requestAnimationFrame);
    }
  }
  return {
    root,
    meta,
    colliders,
    renderMeshes,
    materials,
    lodMeshes,
    materialSystem,
  };
}
