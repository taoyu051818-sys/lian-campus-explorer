# 学生生活二区 · v0.40

本版将原来的程序体块替换为三档 Blender GLB，并保留 v0.39 已建立的场地台地。模型按庭院、楼翼、共享环廊、玻璃锥体和植物分别建模；模型、碰撞与校园地形使用同一米制变换。

## 参考

- [园区全景](https://www.720yun.com/vr/5dejtgefzu6)：2026-09-30 在普通 Chrome 检查「学生生活2区」地面四向和「生活区鸟瞰」四向。公开配置对应场景 27335352、27335712；播放器没有返回运行时场景 ID，依据选中缩略图与实际画面核对。
- [官方宿舍近照](https://www.study-hn.cn/NewsDetail/e4bc9a4e58b741a9bfb0a0e942ed8f4c/MjAyNC0wNi0xNw==/1?nav=%5B%5D)：六层白色阳台网格、棕色百叶、彩色跨层框、玻璃栏板与红砖楼梯墙。
- [官方共享空间近照](https://www.study-hn.cn/NewsDetail/f6f67cd625de4c89807c2b4b304fd739/MjAyNC0wNi0xNw==/1?nav=%5B%5D)：三层环廊、金属栏杆与偏心收分的玻璃锥体。
- 原图位于 `public/reference-data/living-two/`，来源和图像校验值见该目录的 `sources.json`。

航拍确认四组庭院围绕低层共享空间；庭院编号只是几何分组。全景介绍写明五栋宿舍和一栋食堂，不能把四组庭院解释为四栋正式编号楼。生活二区独立食堂尚缺可靠米制配准，本版没有并入其他食堂。

## 尺度与地形限制

3.6 m 层高、开间、玻璃锥体尺寸、隐藏面、树种与植物位置均为照片估算。A52地块对应、32度旋转角和示意总图锚点继续保留候选状态，不代表测绘成果。树木42株是模型数量，不是现场普查。

`terrain-grading.json`保存v0.39原24个候选体量下的台地约束。替换模型时继续使用这些约束，避免旧体量被移除后地面标高随之改变。`fixedTerrainBase`以同一标高接入GLB和碰撞；该资产不加入早期九个建筑使用的旧地形保护区。院落铺地按实际20米地形三角网裁切，树木脚点也采样同一函数。

六层宿舍外立面分别表达私用阳台与院内开放外廊；房间保持封闭。三层环廊的地面通道、庭院和两条中央步道可步行。上层环廊仅表达外观，未建立从地面上楼的交通系统，不宣称复原室内。

## 复现与检查

```sh
node tools/prepare-dorm52.mjs
blender --background --python authoring/dorm52/build.py
node authoring/library/compress.mjs --pnpm --asset=dorm52
node tools/bake-campus.mjs
node tools/test-dorm52.mjs
node tools/test-terrain.mjs
node tools/test-physics.mjs
node tools/test-materials.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
```

GLB压缩仅对新导出文件执行一次。Blender 4.5.9源文件以三个集合保存LOD，另有不导出的地面和摄影机；加 `-- --render` 输出Cycles预览。网页验证使用原生WebGPU，记录与Blender离线渲染分开。

`test-dorm52`检查压缩解码、四庭院露天、六层屋面/三层环廊/锥体高度、窗玻璃真实凹入且未被墙遮挡、树冠净空、铺地三角形中点贴地与交叉口单层铺装，以及六条通道连续往返。
