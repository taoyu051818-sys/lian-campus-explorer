# 滨海体育场：双层看台与朝海开口

依据[用户提供的 720 校园全景](https://www.720yun.com/vr/5dejtgefzu6)，逐项重做旧版五圈台阶。2026-09-29 使用普通 Chrome 选择 **27335713「滨海体育场」**，检查整体、中央平台、左右看台和图书馆方向。场景编号取自公开场景配置，界面缩略图及实际画面已核对；播放器未返回当前场景编号。

三面看台围合跑道，西北朝海长边开敞；图书馆位于模型局部 +X 方向，折线观景构架在另一端。模型包含两层蓝白分块座席、径向白色台阶、中层通道、地面贯通入口、内退的中央用房与柱廊、带薄栏杆的高架折线平台、高杆灯、围栏、球门。座椅使用独立座面、靠背与支架，远景减少细节。折线平台下保留柱间空隙。

外围种植按全景中的滨海棕榈、校园道路侧阔叶树和低灌木表达；连续外围铺地与种植岛随校园地形高程生成。植物数量、品种与位置为估算，避让现有道路、步道、其他建筑和出生点。

## 精度范围

本批未取得该体育场实建测绘图。400 m 级跑道模板、8 条跑道、看台排数及高差、构架高度、座椅和灯具数量、用房轮廓、植物布置均用于表达可见建筑特征，不是实测值。全景介绍中的约 1 万人容量不等于模型座椅数量；模型不用于容量或工程校核。沿用现有校园坐标和方向，尚未完成共同测绘配准。完整室内、地下结构和高架观景平台内部交通未复原。

## 复现

```sh
node tools/prepare-stadium.mjs
blender --background --python authoring/stadium/build.py -- --render
node authoring/library/compress.mjs --pnpm --asset=stadium
node tools/bake-campus.mjs
node tools/test-stadium.mjs
node tools/test-physics.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
```

压缩只对新导出的 GLB 执行一次。地形准备需要完整仓库。Blender 4.5 LTS 源文件包含三档独立集合和仅预览地形；GLB 不导出预览地形、相机或灯光。模型与独立碰撞、植物共用米制局部坐标。看台台阶使用与踏步坡度一致的平滑行走碰撞，地面入口保留净空。

独立模型：`building.html?asset=stadium`。校园：`world.html?place=stadium&view=orbit`。实际几何、通行与浏览器验证结果单独记录在 `验证记录/stadium-blender.json` 和版本对应 WebGPU 记录中。
