# 图书馆 Blender 建模资产

这是一版根据建成照片重建的外景模型。十九层塔楼、五瓣体量组织、几何格栅、斜切顶部及阅读庭院有参考依据；尺寸、各瓣位置、退台和格栅模数仍为估算。没有单体施工图、点云或 BIM，因此不称为精确复原。院内暂用低矮种植池示意绿化，不含室内或虚构房间。

## 编辑与导出

使用 Blender **4.5 LTS**（本次 4.5.9）。`design.json` 是位置、米制尺寸及来源的参数源；`build.py` 构建分组网格、倒角檐口、玻璃与外置格栅、庭院开口，并保存可继续手工编辑的源文件。

```sh
blender --background --factory-startup --python authoring/library/build.py
node authoring/library/compress.mjs
npm run build
npm run test:library
npm run test:physics
```

压缩脚本用 npx 获取固定版本 `@gltf-transform/cli@4.2.1`；pnpm 环境可加 `--pnpm`。首轮需要联网。常规网页构建直接读取已提交的 GLB，不运行 Blender 或压缩器。

可加 `-- --render` 输出 `authoring/library/preview.png`。中文招牌读取 macOS 的苹方；其他系统先把 `LIBRARY_FONT` 环境变量设为本机 CJK 字体路径。文字在源文件保存前转换为可编辑网格，模型不嵌入字体文件。没有中文字体时会提示并省略中文文字，保留英文标识。

生成的 `library.blend` 保留三档集合、按体量／材质分组的网格、PBR 材质、已打包的远景纹样、相机和工作灯光。打开时只显示 LOD0；可在 Outliner 中启用其他集合。`.blend` 和预览图不进入 Git，避免每次重新生成使仓库膨胀；本次交付另外提供源文件包。源脚本及参数均在 Git 中。

若在 Blender 中手工编辑，从指定 LOD 集合选择对象导出 glTF Binary，保持米制单位、原点和 Y-up；不要导出工作灯光及相机。三个文件分别覆盖 `public/models/library/library-lod0.glb`、`library-lod1.glb`、`library-lod2.glb`，再运行压缩脚本刷新三角面数、大小及 SHA-256。修改轮廓后还需同步清单中的碰撞轮廓，并重新 bake/test。

## 运行时约定

- Blender 为 Z-up；GLB 转为 Y-up，局部 +Z 朝建筑后方。校园配准只在 `src/library-registration.ts` 和 GLB 根节点施加一次。
- LOD0 保留近景格栅、门头文字及塔楼构件；LOD1 减少曲线采样和格栅层数；LOD2 用烘焙纹样面代替细格栅。当前约 61.4 / 30.7 / 4.4 万三角面，0 / 240 / 650 米切换，12% 滞回。
- 三档 GLB 采用 Meshopt，Three.js GLTFLoader 通过同版本内置 MeshoptDecoder 读取。累计约 11 MB。近景较密，帧率仍取决于设备和全园画质，不保证移动端 60 FPS。
- 幕墙是带介电反射和 clearcoat 的不透明玻璃，代表背后的遮阴室内；不构建透视室内。外置格栅有 60 cm 估算空腔。
- 39 个独立简化碰撞体覆盖塔楼、五瓣裙楼、庭院环廊与庭院地面，不使用几十万三角面的装饰网格计算碰撞。碰撞随细节档位保持不变。
- 原有校园简化图书馆和通用门窗生成器已停用，防止重复立面和穿插。

## 照片及资料

- [中建：已建成图书馆航拍](https://www.cscec.com/xwzx_new/zqydt_new/202405/3787332.html)
- [TJAD：French Design Awards 项目申报与多角度建成照片](https://frenchdesignawards.com/winner-info.php?id=3205)
- [人民网：开馆、层数等报道](https://hi.people.com.cn/n2/2024/0423/c228872-40821145.html)

参考照片的权利属于原发布方，仅用于观察与溯源，未嵌入 GLB、源文件或贴图；远景纹样由脚本自行生成。未通过照片判断的隐藏部分采用克制的外景补全，具体估算项保存在 `design.json`。
