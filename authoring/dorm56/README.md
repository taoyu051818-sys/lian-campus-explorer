# 学生生活一区 · v0.41.0

本版以11栋编号楼为组，替换原来33个程序体块。宿舍按逐层外轮廓合并楼板，保留高低退台；立面加入白色楼板带、灰色墙面、凹进窗、玻璃栏板。11号配套楼使用三层红砖框架。玻璃连廊跨过院落，首层柱廊留有实际空隙。

## 参考与限制

- [官方规划核实附件](https://wap.study-hn.cn/upload/file/2025/08/04/25debde2816b4d37a9c0f72000a7847c.docx)：2026-09-30下载，使用 bundled documents renderer 渲染17页并检查。image1为报建屋顶图；image2为实建地块图；image13–23为1–11号楼实建照片。报建效果图与实拍分开使用。
- [园区全景](https://www.720yun.com/vr/5dejtgefzu6)：Chrome查看「学生生活1区」和「生活区鸟瞰」各四个方向。公开配置场景27335351、27335712；播放器未返回运行时场景ID，以选中缩略图和实际画面核对。
- 阶梯轮廓沿用报建屋顶图描绘；实建小图分辨率不足以校核每一段。54477.7平方米的地块面积用于比例估算，A56由面积与道路交叉对应，未取得统一测绘坐标。
- 首层4.2米、标准层3.4米、开间、连廊具体位置和高度、树种和种植数量为估算。连廊外观有照片依据，10段连接的位置仍待更清晰实建图核对。
- 高屋面设备、退台绿化和院落乔木作可见外部表达；未重建房间、楼梯及电梯。上层露台和连廊未建立从地面上楼的完整交通系统。球场设施仍留待补充，不将全部室外设施标为竣工复原。

## 地形与通行

`terrain-grading.json`独立保存v0.40中原33个体量下的台地约束和14条外部步道，避免替换模型后台地消失。这个新资产不加入九个早期模型的旧地形保护区。GLB、树根和碰撞使用同一锚点、旋转和固定基准，地面铺装与草地按校园20米三角网切割后贴地；它们不是悬浮平板。

48株乔木/棕榈为模型布置数量，院落草地让开建筑、道路、中央步道和原通行路径。旧楼体、旧铺装和地块面在此地块隐藏，防止重复几何盖住精细地面。封闭房间保留碰撞；首层柱、楼板、连廊和树干有独立碰撞。地面路径与连廊下通道纳入连续往返测试。

## 复现

Python图形预处理需要Shapely 2.1.2；Blender导出只依赖Blender 4.5自身及`authoring/common/geometry.py`。

```sh
node tools/prepare-dorm56.mjs
python3 tools/prepare-dorm56-geometry.py
blender --background --python authoring/dorm56/build.py
node authoring/library/compress.mjs --pnpm --asset=dorm56
node tools/bake-campus.mjs
node tools/test-dorm56.mjs
node tools/test-terrain.mjs
node tools/test-physics.mjs
node tools/test-materials.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
```

压缩仅对新导出的GLB执行一次。源文件包括三个LOD集合，另有不导出的地形和摄影机。`-- --render`会在重新导出后生成Cycles预览；只需重新拍摄时应打开现有blend再渲染，避免覆盖已压缩模型。

网页入口`building.html?asset=dorm56`；校园入口`world.html?place=dorm56&view=orbit`。离线渲染、压缩几何、物理通行和原生WebGPU验证分别记录，验证记录中的估算限制继续有效。
