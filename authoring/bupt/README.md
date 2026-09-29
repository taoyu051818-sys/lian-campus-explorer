# 北京邮电大学：双学院楼与阶梯花园

依据官方实建资料及 720 全景「北京邮电大学」重建两栋学院楼。十个几何楼翼／层段属于两栋建筑，不能当作十栋楼统计。

- 学院楼一：五层折角合院、三个砖红／深灰端部、白色窗格、开放连廊、首层柱廊、屋顶廊架、抬高花园和相对下沉的入口庭院。
- 学院楼二：六层主楼翼、局部四层翼、红灰端楼、三处主要退台及三处入口小平台；五跑楼梯串联阶梯花园。
- 立面：与玻璃分离的实体横向遮阳条、白色深窗框、金属窗梃、红色陶板及深灰墙面、板缝、屋顶百叶围护和设备间。
- 环境：六处连续种植岛、17 株棕榈／支撑乔木、低绿篱、建筑周边铺地、内部车行环路及屋顶种植面板。植物数量、位置和部分细节是照片参考估算。

## 参考与校准

[官方实建核实 PDF](https://wap.study-hn.cn/upload/file/2025/08/04/502f538dc40e40ea9b18acc0508914af.pdf) 共 40 页：第 4 页右侧是实建总平面，第 8–18 页的偶数页为学院楼一地上实建分层图，第 22–34 页的偶数页为学院楼二地上实建分层图，第 38–40 页为实建照片。第 35–37 页是报建效果图，不作为建成外观证据。第 26 页标题误写学院楼一，位置处在学院楼二分层图序列。

[校园全景](https://www.720yun.com/vr/5dejtgefzu6)：2026-09-29 正常浏览器进入场景 27335716「北京邮电大学」，确认顶部场景名称、高亮缩略图和两栋实景楼体；检查砖红／深灰端楼、横向百叶、屋顶廊架、庭院和外围乔木。

`digitize.py` / `digitization.json` 保留六个界址圆点、像素到平面坐标拟合与正交楼翼拆分。旧记录错用了部分标注文字位置，并误读 J1 北坐标；本次按圆点修正，J1 为 2034840.606。最大拟合残差约 0.243 m。该数字只说明控制点拟合，不代表手工轮廓、构件或校园整体配准具有测绘精度。

建筑使用东向 X、南向 depth、上向 elevation，保留总图手性。主体楼层数由实建图确认；3.9 m 层高、退台高度、栏杆、窗洞、楼梯、设备间和植物布置为实拍参考近似。局部矩形拆分简化了凹口和小构件。地下室、室内房间及全部连廊出入口未作室内复原；庭院的下沉关系通过周围抬高平台表达。全园落位沿用示意地图坐标，不是地籍坐标。

## 复现与检查

```sh
python3 authoring/bupt/digitize.py # Python + NumPy
node tools/prepare-bupt.mjs
blender --background --python authoring/bupt/build.py
node authoring/library/compress.mjs --pnpm --asset=bupt
node tools/bake-campus.mjs
node tools/test-bupt.mjs
node tools/test-physics.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
```

Blender 4.5 LTS 源文件 `bupt.blend` 分三档集合保存；独立预览地面不导出。建模命令增加 `-- --render` 可生成四张 Cycles 预览。压缩脚本仅对刚生成的原始 GLB 执行一次。

网页入口：`building.html?asset=bupt`；校园入口：`world.html?place=bupt&view=orbit`。可见 GLB、草地和隐藏碰撞使用同一变换。验证覆盖三档几何、真实踏步射线、分级平台高度、庭院开口、植物净空、六跑楼梯双向通行，以及学院楼二五跑串联步行；浏览器实测范围单独记录。
