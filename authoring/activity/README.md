# 大学生活动中心：弧形楼翼、架空外廊与庭院

v0.31.0 以 Blender 4.5 LTS 重建活动中心外景，替换旧的单块挤出模型。四层弯折楼翼、弧形转角、首层通廊、交错外廊、端部开洞墙及外楼梯都有独立几何。校园中选择大学生活动中心可打开 `building.html?asset=activity`。

## 依据与复核

本轮重新下载管理局的[规划核实附件](https://wap.study-hn.cn/upload/file/2025/08/04/0ab6120f7fe041eab515bee73ddf7ab0.docx)，按文档正文与图片关系核对：

| 嵌入图片 | 内容及用途 |
| --- | --- |
| image2.png | 实建测量图：4 层、总高 21.8 m、红线坐标、弯折轮廓及圆形庭院绿地 |
| image6.png | 一层实建图：两翼房间退后、中央及端部架空空间 |
| image8.png、image10.png、image12.png | 二至四层实建图：弧面轮廓、共享平台、外廊、端部中空与不同层退让关系 |
| image14.png | 实建屋顶平面：楼梯间、设备间及屋面范围 |
| image17.jpeg、image18.jpeg | 2025-01-07 建成照片：白色连续横带、蓝灰幕墙及浅色长菱形构件、砖饰首层、外廊、乔木和灌木 |
| image15.png、image16.png | 报建设计效果图，仅辅助观察端部开洞及楼梯；不当作建成照片 |

720 云入口本轮再次超时，未据此宣称检查了全部全景。原始 DOCX 和参考照片用于观察溯源，不嵌入运行包。

`digitization.json` 保存旧红线控制点、拟合矩阵、原点和此次手工描取的弯曲中心线。沿用的约 1.2 m 控制点残差只说明人工拟合误差，不是测绘精度。局部坐标采用 X 向东、深度向南，再转换为 Blender `(x,-depth,elevation)`，避免图纸北向坐标直接当深度导致左右镜像。校园仍使用旧的示意总图锚点，并为避让道路平移 `(7.5,-7.5)` m；没有声称完成全园统一测绘坐标配准。

外廓宽度、各层具体标高、外廊退距、柱网、窗格模数、玻璃图案、端墙孔尺寸、楼梯细部、设备间高度、植物种类及数量均保留估算。21.8 m 为图纸总高；主体屋面和设备间之间的标高分配是近似。原貌中部分端部差异与不可见背面仍需补充照片核对，不建室内。

## 建筑与绿化

近景使用有厚度的横带与窗框、窗扇、独立玻璃面与浅色几何图案、砖墙灰缝和 108 级外楼梯。中远景减少窗格、图案、树叶和曲面细分。首层两翼房间保留闭合体积，中间通廊开放；上部房间后退形成可行走外廊。楼梯连接三个上部楼层，另有连续斜面、平台和护栏碰撞。

圆形庭院草地与两翼长条草坪、北侧种植带一起构成四组绿地。七组乔木中含一组三干棕榈丛，其余为分枝阔叶树；配低灌木、环形步道和周边铺装。个体位置按现有地形及道路避让，不能当作景观施工图复原。树冠和草地边界、建筑全轮廓及内部采样都有通路检查。

独立碰撞不使用一个整栋实心盒子：架空层可穿行，楼梯可连续上下，外廊和楼梯护栏有物理阻挡。隐藏面检查以真实三角形为采样点并限定目标碰撞体，避免凹形楼板的包围盒中心落在庭院里，也避免只命中地面而误报成功。

## 复现

在完整仓库根目录执行，`BLENDER` 指向 Blender 4.5 LTS 可执行文件：

```sh
node tools/prepare-activity.mjs
"$BLENDER" --background --python authoring/activity/build.py -- --render
node authoring/library/compress.mjs --asset=activity
node tools/bake-campus.mjs
npm run test:activity
npm run test:physics
npm run test:sports
npm run test:library
npm run test:materials
npm run build
```

无 npx 的环境可给压缩命令加 `--pnpm`。固定使用 glTF Transform 4.2.1；压缩只在重新导出原始 GLB 后执行，避免重复量化。Blender 生成脚本依赖 `authoring/common/geometry.py`，已随源文件包附带；不依赖参考照片贴图或外部字体。

`.blend` 中三档模型分属集合，默认显示近景。`Preview only` 集合是仅供 Cycles 展示的地面，不导出进校园 GLB。普通网页构建直接使用已提交的 GLB，不需要安装 Blender。

验证记录见 `验证记录/activity-blender.json`。浏览器 WebGPU 的视觉复查单独记载，离线测试和 Blender 预览不替代浏览器检查。
