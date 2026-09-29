# 8号食堂（原一号食堂）：红砖遮阳与入口绿化

用户已确认本栋位于综合体育中心蓝色跑道隔路一侧、靠大墩方向；它与生活一区、二区、三区食堂分别记录。依据 720 实景与用户航拍建立 Blender 可编辑模型，替换此前程序体块。

- 两层红砖立面采用有厚度的竖向遮阳片、错缝砖面和内退玻璃；中央二层阳台带细栏杆。
- 斜向侧翼使用白色深框、内退墙板、端窗和通风孔；地面入口补柱廊、平台、可通行台阶和栏杆。
- 屋顶以倾斜板、铝框和支架表达密集太阳能板阵列，另有蓝色横置水箱、青绿色管线、设备风口、风管和两座服务塔。
- 周边设置阔叶树与后侧棕榈、连续草坪和低绿篱，并补停车黄色分格、灰白铺地、入口灯柱和树木支架。树冠与道路、建筑、步道、出生点保持净空。

## 参考和限制

[720 全景](https://www.720yun.com/vr/5dejtgefzu6) 的场景 **27335706「一号食堂」**已于 2026-09-29 在普通 Chrome 浏览器中打开并检查整体、立面、屋顶与前场。`public/reference-data/canteen/user-confirmed-aerial.png` 是用户确认名称和位置的航拍；`identity.json` 保留确认记录。

[OSM way 1223487854](https://www.openstreetmap.org/way/1223487854) 来自此前保存的 `public/reference-data/canteen-osm.json`（2026-09-16），保留米制轮廓与方向，简化近共线点。© OpenStreetMap contributors，ODbL。OSM 外包轮廓不是实建测量图，校园锚点也是示意配准。

关联的[官方控规 PDF](https://wap.study-hn.cn/upload/file/2025/08/04/c79e22845456490194e173abbcfa8c9f.pdf)已下载并检查封面：它是园区一期控制性详细规划修编，不能提供本栋实测层高。两层由照片可见；11.2 m 主体高度、抬高基座、分格、楼梯、设备数量和后立面继续按照片估算。模型的 224 块屋顶板只表达密集阵列，不是实测数量；蓝色水箱与管道可见，系统技术规格未核实，不标为光伏组件。

植物品种、数量、位置和前场尺度为实景参考估算；为避让现有校园道路，部分种植位置与实景有偏移。完整室内、地下、屋顶通行未复原。三档 LOD 保留主体轮廓、关键遮阳构件及平台，远景降低砖缝、植物与设备细节。

## 复现

```sh
python3 authoring/canteen/digitize.py # 需要 NumPy
node tools/prepare-canteen.mjs
blender --background --python authoring/canteen/build.py
node authoring/library/compress.mjs --pnpm --asset=canteen
node tools/bake-campus.mjs
node tools/test-canteen.mjs
node tools/test-physics.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
```

压缩仅对新导出的 GLB 执行一次。建模脚本的中文招牌使用 macOS STHeiti Medium，生成时转网格；源文件不依赖外部字体。在其他系统重新生成时需替换字体路径。增加 `-- --render` 输出四个 Cycles 视角。

网页 `building.html?asset=canteen`；校园 `world.html?place=canteen&view=orbit`。模型、绿化、独立碰撞共用坐标。测试包含三档压缩模型解码、倾斜板高差、屋面和台阶射线、白框凹入深度、植物净空，以及两条楼梯连续往返；浏览器验证单独记录。
