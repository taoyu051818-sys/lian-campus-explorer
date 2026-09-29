# 创新创业孵化中心：错层幕墙、屋顶构架与入口绿化

依据 2025 年实建分层图和建成照片重建一栋长条孵化中心。五个地上楼层分别描绘轮廓，保留不对齐的凹口、悬挑、顶层西端露台和局部架空层；多个几何体不代表多栋楼。

- 深色首层、银灰中段与铜色上部幕墙分开使用 PBR 材质，补细窗梃、小开启窗框、退台栏杆和屋顶设备百叶。
- 白色屋顶构架为实体杆件加局部格栅，三档均保持镂空。屋顶“黎安国际科创港”字样已转网格，Blender 源文件无需外部字体。
- 西侧屋顶露台包含木铺地、种植槽和低灌木。地面八处种植岛、30 株乔木／棕榈、812 组低绿篱，入口两处断开绿化以保留通路；两端设小型廊架和庭院铺地。

## 依据与估算

[官方规划核实公示 Word](https://wap.study-hn.cn/upload/file/2025/09/23/1758593138960022228.docx)：2025 年 9 月公示，实建图测量日期 2025-05-11。原文件中的 `image2.png` 是实建位置图；`image6/8/10/12/14/16/18.png` 为架空层、一至五层和屋顶层实建图；`image20.jpeg` 是建成照片。`image19.jpeg` 为早期报建效果图，绿色外观不用于本模型。已渲染完整文档，并对照实建图片；文档部分正文缺字时以 XML 中的原始标题、图纸自身标题及图片顺序交叉核对。

[720 全景](https://www.720yun.com/vr/5dejtgefzu6) 的已读取场景清单中没有名为孵化中心的独立场景，因此本批未声称完成孵化中心全景实景检查。外观依据为上述官方建成照片。

`digitize.py` 保留六个界址控制点，拟合残差约 0.503 m；长条外包轮廓约 138.90 × 34.98 m。各层黑色边线手工描绘并归一化，轮廓只是简化游戏模型，不是 CAD 或测绘成果。局部深度归一化、立面分格、构架尺寸和幕墙反射率均为近似。

实建图确认五个地上楼层，另有部分计入地下的架空层；本模型按 2.8 m 局部下层与 4.2 m 上部层高表达高低关系，标高未经剖面图确认。铜色来自照片观感，不等于已确认材料为铜板。植物品种、数量、位置及两侧廊架细部为实景参考估算。地下室、完整室内、屋顶花园通行未复原。建筑保留实建总图方向和米制比例，在示意校园路网中整体平移，不能视为地籍配准。

## 复现

```sh
python3 authoring/incubator/digitize.py # 需要 NumPy
node tools/prepare-incubator.mjs
blender --background --python authoring/incubator/build.py
node authoring/library/compress.mjs --pnpm --asset=incubator
node tools/bake-campus.mjs
node tools/test-incubator.mjs
node tools/test-physics.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
```

建模文字使用 macOS 的 STHeiti Medium 字体，生成时转网格；在其他系统复现需替换脚本中的字体路径。已交付 `.blend` 不依赖该字体。增加 `-- --render` 输出四个 Cycles 视角；压缩仅对新导出的 GLB 执行一次。

网页 `building.html?asset=incubator`；校园 `world.html?place=incubator&view=orbit`。三档 GLB、碰撞和绿化共享坐标变换。验证包含真实网格凹口射线、西端屋顶高度、构架开口、架空入口地面、植物净空及两条路线连续往返；浏览器检查单独记录。
