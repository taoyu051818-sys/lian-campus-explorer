# 校园坐标约定（v0.42.0）

总图像素向右为东、向下为南。历史建模数据使用 `(x, y, z) = (东, 高程, 北)`，即 `src/world-geometry.ts` 中的 Babylon 创作坐标。这一套数字直接放入右手系 Three.js，会让整体方位镜像；修改三角面绕序只能解决正反面，不能解决镜像。

保留总图、建筑清单、地形约束、GLB 和 meshpack 的创作坐标，避免重采样地形及重复配准。`src/webgpu/coordinates.js` 是进入运行时的唯一转换定义：运行时采用 **+X 东、+Y 上、−Z 北**。

- meshpack 顶点和法线 Z 取反，同时交换每个三角面的后两个索引。渲染和 Rapier 使用同一份转换后的数组。
- `campus.meta` 保持创作坐标；到达点、标签、聚焦范围和入口在使用时转换。小地图使用相反的映射返回原图像素。
- GLB 保留局部创作坐标。放置矩阵为 `T(anchorX, base, -anchorZ) × Ry(-yaw) × S(1,1,-1)`，包含建筑、周边绿化、铺装及所有 LOD。仅翻锚点会使不对称楼翼与碰撞错位。
- Blender 原生文字并不遵循建筑轮廓的手性。图书馆、孵化中心及食堂的独立文字节点按局部字宽方向补偿，保持字序可读；必须使用 GLTFLoader 保留的原始 `userData.name`，兼容 Blender 的 `.001` 后缀。
- 单楼预览同步翻转局部模型、随坡地面和参考相机。资产文件本身没有重导出。
- 地形顶点行顺序保持原样，运行时行 Z 步长为 −20 m。CPU 与 GPU 通过同一格网原点和有符号跨度取样，坡度法线也使用有符号步长。海浪传播场在运行时的正方形区域重新求解。
- 人物方位角为从北顺时针计量，太阳沿用 Tidewater 已有的东／上／南约定。

## 验证

`npm run test:coordinates` 检查33处总图地点的有向关系、5678份网格、156000个核心地形三角面，以及11处GLB三档的世界坐标和碰撞轮廓。距离相同不能证明没有镜像，因此必须检查有向关系。

现有物理测试追加 `--runtime` 会先把碰撞网格转换到运行时，再把原始路线投到同一空间：`node tools/test-physics.mjs --runtime`、`node tools/test-stadium.mjs --runtime`、`node tools/test-dorm52.mjs --runtime`、`node tools/test-dorm56.mjs --runtime`。测试适配器仅用于复用已有创作空间路线，不进入产品代码。

开发服务器打开 `/tools/coordinate-probe.html`，在原生 WebGPU 读回地形高度、坡度法线和海岸传播场；浮点16位高度纹理的误差单独记录。`tools/test-browser-orientation.mjs` 读取浏览器记录，对真实页面的正北俯视标签投影检查方向。

本修复解决坐标系造成的全局镜像，不证明现有地块级配准达到测绘精度。各单体仍按资料清单逐一核对；地形仍是总图和全景约束的近似重建。
