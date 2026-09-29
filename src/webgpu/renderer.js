import {
  WebGPURenderer,
  ACESFilmicToneMapping,
  PCFShadowMap,
} from "three/webgpu";

export async function createRenderer(canvas, { antialias = false } = {}) {
  if (!navigator.gpu)
    throw new Error(
      "此浏览器未提供 WebGPU。请使用支持 WebGPU 的 Chrome、Edge 或 Safari，并启用硬件加速。",
    );
  let timeout;
  const adapter = await Promise.race([
    navigator.gpu.requestAdapter({ powerPreference: "high-performance" }),
    new Promise((_, reject) => {
      timeout = setTimeout(
        () =>
          reject(new Error("WebGPU 初始化超时。请在系统浏览器中打开此地址。")),
        12000,
      );
    }),
  ]).finally(() => clearTimeout(timeout));
  if (!adapter)
    throw new Error("未找到 WebGPU 图形设备。请检查浏览器和显卡驱动。");
  const limits = {
    maxSampledTexturesPerShaderStage: 32,
    maxStorageBuffersPerShaderStage: 10,
    maxComputeWorkgroupStorageSize: 32768,
    maxStorageTexturesPerShaderStage: 8,
    maxColorAttachmentBytesPerSample: 64,
  };
  for (const k of Object.keys(limits))
    limits[k] = Math.min(limits[k], adapter.limits[k]);
  const device = await adapter.requestDevice({
    requiredLimits: limits,
    requiredFeatures: ["float32-filterable"].filter((f) =>
      adapter.features.has(f),
    ),
  });
  const renderer = new WebGPURenderer({
    canvas,
    device,
    antialias,
    reversedDepthBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(
    canvas.clientWidth || innerWidth,
    canvas.clientHeight || innerHeight,
    false,
  );
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.7;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  await renderer.init();
  return renderer;
}
