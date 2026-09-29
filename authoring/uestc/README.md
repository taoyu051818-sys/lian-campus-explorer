# 电子科技大学：两栋学院楼及周边绿化

本批以官方 2025 年实建资料和 720 全景的「电子科技大学」场景重建两栋学院楼。七个主体片段分别属于学院楼一、学院楼二，不能按七栋建筑统计。

- 学院楼一：五层的两条 L 形楼翼、东侧核心体、连接核心体的上层走廊、开敞庭院。西北侧庭院入口保持敞开。
- 学院楼二：六层楼翼及核心体，三层公共空间、屋顶金色廊架和露台。
- 外观：圆角白色阳台带、顶层退台、金色竖向构件和错列窗框、后退的蓝灰色玻璃、首层柱廊、五段室外楼梯及跨楼连桥。
- 环境：按实拍类型布置棕榈、支撑乔木、低矮绿篱、连续种植岛、建筑散水步道及弯曲内部道路。树冠、草地和通行区域单独校验。

## 参考与精度范围

[官方实建核实资料](https://wap.study-hn.cn/upload/file/2025/08/04/a8a440f163b84513bc2628a0b16455a7.pdf)：第 4 页右侧实建总图；第 6–16 页学院楼一实建分层图；第 20–32 页学院楼二实建分层图；第 36–38 页实际建成照片。第 33–35 页为设计效果图，未当作实拍证据。第 24 页标题误写学院楼一，但地上六层、地下一层及前后平面关系对应学院楼二。

[校园全景](https://www.720yun.com/vr/5dejtgefzu6)：2026-09-29 通过正常浏览器进入场景 27335715「电子科技大学」，查看白色阳台、外楼梯、架空连桥、庭院和外围种植。首次点击受引导层影响停留在全园鸟瞰，后续确认场景文字、照片和高亮缩略图后才计为该建筑的全景查阅。

`digitization.json` 保留原始像素、八个界址点、拟合矩阵与楼翼轮廓。0.316 m 仅为控制点拟合残差；手工描边、构件和全园简化地图配准不具备测绘精度。平面使用东向 X、南向 depth、上向 elevation，以保留实景手性。

五层、六层、三层由实建图确认。3.9 m 层高、阳台进深、窗框模数、楼梯与廊架尺寸仍为估算。树种、数量和具体位置参考照片并结合通行净空布置；没有实测绿化图。模型范围为外观及室外可见通行空间，不包含室内房间和地下室精装。

## 复现

在项目根目录运行：

```sh
node tools/prepare-uestc.mjs
blender --background --python authoring/uestc/build.py
node authoring/library/compress.mjs --pnpm --asset=uestc
node tools/bake-campus.mjs
node tools/test-uestc.mjs
node tools/test-physics.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
```

Blender 4.5 LTS 源文件 `uestc.blend` 中三档模型分集合保存；「Preview only」地面不导出。给建模命令增加 `-- --render` 可生成四个 Cycles 预览。GLB 用 Meshopt 压缩，压缩脚本只对刚导出的原始文件运行一次。

网页检查入口为 `building.html?asset=uestc`，校园入口为 `world.html?place=uestc&view=orbit`。隐藏碰撞与可见模型共享同一位置变换；旧程序体块不会再显示。验证记录单独注明几何、物理、浏览器与仍属估算的范围。
