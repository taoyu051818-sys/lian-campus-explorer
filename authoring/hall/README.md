# 会堂外景与周边绿化

v0.32.0 首轮 Blender 外景精修。正式 GLB 已随仓库提供，网页构建不依赖 Blender。完整可编辑 `.blend` 和预览图随任务交付包提供。

## 资料与尺度

[官方规划核实附件](https://wap.study-hn.cn/upload/file/2025/08/04/bffa53c4f2b84bebae05ea11f4793733.docx)中，image2 是实建测量图；image6、image8、image10 分别是一层、二层和设备层实建图。image13.jpeg 是标注 2025-01-07 的建成照片，同一张照片在文档中插入两次，不计作两个实拍视角。image12 是报建设计效果图，仅补充屋顶、后区廊架与扇形铺装意向。

实建总高 19.70 m。测量图顺时针旋转 90° 后采用六个红线控制点，既有人工描绘轮廓按米制保留，曲线前缘平滑、后区保留直边。0.343 m 是控制点拟合残差，不代表人工轮廓或校园配准精度。`digitization.json` 保留控制点、转换矩阵与依据。

模型局部 X 沿后区宽边，深度朝向后区；通过同一旋转和平移接入校园，模型、植物和碰撞一致变换。没有缩小建筑来避让道路，本批不需要额外平移。校园总图仍为示意配准。

## 本批内容

- 椭圆主厅、石材低区和后部支持用房；19.70 m 总高。
- 浅米色石材分缝、实际内凹的高窗、三段阶梯状窗头、门窗横梃和深入口金色檐底。
- 屋面女儿墙、小型检修构件、后区开放廊架及平台栏杆。
- 两侧外楼梯共 72 级踏步，含中间平台、可见扶手和简化行走斜面。平台体量切开梯井，避免整块碰撞挡住楼梯。
- 八处草地／种植区、15 株棕榈及乔木、319 组低灌木、树木支撑、五根细灯杆和扇形铺装。近中远三档各自具有完整外轮廓。

低区 5.2 m、后区高度、窗洞排列、开间、楼梯构件及未拍摄立面均含估算。屋顶和铺装包含设计意向参考；植物种类、个数、精确位置不是实测清单。本批只制作外景，不虚构可进入的室内。

## 重建

依赖仓库 Node、pnpm 与 Blender 4.5 LTS。先安装项目依赖，再运行：

```sh
node tools/prepare-hall.mjs
blender -b --python authoring/hall/build.py
node authoring/library/compress.mjs --pnpm --asset=hall
node tools/bake-campus.mjs
node tools/test-hall.mjs
node tools/test-physics.mjs
```

`prepare-hall.mjs` 生成地形高度、道路净空与植物布置；`build.py` 生成三个集合和独立碰撞。压缩仅在重新导出后执行，避免重复量化。给 Blender 命令增加 `-- --render` 可同时生成四张预览。`Preview only` 地面不导出到校园 GLB。

`building.html?asset=hall` 提供整体、正面、入口、楼梯、屋顶和绿化视角。近中远模型还会在校园中自动切换。详细检验范围和剩余估算见 `验证记录/hall-blender.json`。
