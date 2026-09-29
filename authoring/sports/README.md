# 综合体育中心：双馆、附馆与周边绿化

v0.30.0 使用 Blender 4.5 LTS 制作米制外景资产，替换原程序化双馆和附馆。常规网页构建直接加载 `public/models/sports/` 中已提交的三档 GLB，不需要 Blender。校园内选择综合体育中心可打开 `building.html?asset=sports`，查看整体、两馆、绿化和屋顶。

## 参考与估算

[规划核实附件](https://wap.study-hn.cn/upload/file/2025/08/04/594775550c264ea39e5dda6616583998.pdf)共 15 页。本次重新下载并检查第 1–2 页实建图及第 15 页建成照片，原件不嵌入分发模型。

- 实建图：游泳馆 85.31 × 96.78 m、高 23.9 m；体育馆 79 × 121.4 m、高 29.9 m；附馆高 17.4 m。体育馆采用实建图高度，不混用较早报建高度。
- 照片：游泳馆白色穿孔外墙及翻上屋顶的宽金属曲面；体育馆几何格栅、后退主馆及高窗；附馆透镜形窗与带围网的绿色屋顶球场；室外弧形楼梯；草坪、棕榈形乔木、阔叶乔木和浅色铺装。
- 估算：圆角半径、附馆平面、相对位置与校园配准、孔洞与格栅模数、金属曲面细节、楼梯尺寸、球场线、背面门窗以及植物品种、数量和位置。曲面顶端比游泳馆主体高约 0.6 m 是模型处理，不是另一个实测高度。

用户提供的 720 云入口本轮超时／返回 HTTP 502，未声称已浏览其中全部场景。本批按上述可取得的实建资料推进。模型不含室内，也不代表施工放样或统一测绘坐标。

## 模型与场地

近景保留真实孔洞及孔壁、立体格栅、后退玻璃、屋顶接缝、附馆开窗、围网和 36 级弧形台阶；中远景逐步减少构件和细分。远景格栅复用本项目原创的图书馆纹样贴图，作为照片纹样的简化表达。GLB 保留独立 PBR 材质，并接入现有 Three.js WebGPU 日光、阴影和环境。

38 株乔木、38 处带低灌木的草地种植岛、三处周边铺装和游泳馆前赭色步道构成首轮场地模型。树木和种植岛采样现有校园地形，避开建筑、道路、通路与到达点。具体布置仍为实拍参考估算，不是已取得景观施工图；连续草地和更自然的植物组合可在全园复查时继续调整。

模型和独立碰撞共享一套注册变换：42 个体积包含三座建筑、游泳馆曲面和树干，另有楼梯通行斜面。体积数量不能当作真实建筑栋数。楼梯采用连续斜面承托角色；近景踏步保持可见。

## 复现

从仓库根目录执行，`BLENDER` 指向 Blender 4.5 LTS 可执行文件：

```sh
node tools/prepare-sports.mjs
"$BLENDER" --background --python authoring/sports/build.py -- --render
node authoring/library/compress.mjs --asset=sports
node tools/bake-campus.mjs
npm run test:sports
npm run test:physics
npm run test:library
npm run test:materials
npm run build
```

没有 npx 的环境可为压缩命令加 `--pnpm`；使用固定版本 glTF Transform 4.2.1。压缩命令应在重新导出后执行，不要反复对已经量化的 GLB 压缩。生成脚本需要共享的 `authoring/common/geometry.py` 与 `public/models/library/screen-baked.png`，均已随源文件包附带。

`prepare-sports.mjs` 生成尺寸、地形配准和绿化布置；`build.py` 生成三档网格、GLB、碰撞清单、可编辑 `sports.blend` 及四张 Cycles 预览。源码坐标为 `(x, depth, elevation)`，Blender 使用 `(x, -depth, elevation)`，glTF 导出后回到 Three.js 的 Y 向上坐标。Blender 源文件和预览放在交付包，Git 保存可复现脚本及运行时 GLB。

## 验证状态

三档压缩模型的全部 Meshopt 数据、索引、法线、米制范围与校验和通过检查；GLTF Validator 无错误或警告，其不支持的 Meshopt 扩展另由自有检查完整解码。38 株树的 912 个树冠边界采样及种植岛的 912 个边界采样通过通路避让检查；33 处到达点和楼梯上下行物理检查通过。Blender 源文件已重新打开，四个参考视角渲染已检查。

记录见 `验证记录/sports-blender.json`。本轮没有重新运行浏览器 WebGPU 画面检查，HTTP 资源加载及构建通过不能替代此项；保留待复查状态，继续推进下一个建筑。
