"""Package a verified Blender asset and the current campus build for handoff."""
from pathlib import Path
import argparse, hashlib, json, re, shutil, zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--asset', required=True)
parser.add_argument('--out', required=True, type=Path)
args = parser.parse_args()
assert re.fullmatch(r'[a-z0-9-]+', args.asset), 'Invalid asset identifier'
root = Path(__file__).resolve().parents[1]
asset = args.asset
version = json.loads((root/'package.json').read_text())['version']
manifest = json.loads((root/f'public/models/{asset}/{asset}.json').read_text())
name = manifest['name']
source_dir = root/f'authoring/{asset}'
verification = root/f'验证记录/{asset}-blender.json'
assert json.loads(verification.read_text())['version'] == version
assert (source_dir/f'{asset}.blend').is_file()
out = args.out.resolve(); out.mkdir(parents=True, exist_ok=True)
files = []
previews = sorted(source_dir.glob('*.png'))
for source in previews:
    target = out/f'{asset}-v{version}-{source.name}'
    shutil.copy2(source, target); files.append(target)
for source, suffix in [(source_dir/f'{asset}.blend', 'Blender源文件.blend'), (verification, '验证记录.json')]:
    target = out/f'{name}-v{version}-{suffix}'
    shutil.copy2(source, target); files.append(target)

source_zip = out/f'{name}-v{version}-建筑与绿化源文件包.zip'
with zipfile.ZipFile(source_zip, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for file in sorted(source_dir.iterdir()):
        if file.suffix in ['.py', '.json', '.md', '.blend']:
            z.write(file, str(file.relative_to(root)))
    for file in sorted((root/'authoring/common').glob('*.py')):
        z.write(file, str(file.relative_to(root)))
    for file in [root/'authoring/library/compress.mjs', root/f'tools/prepare-{asset}.mjs']:
        if file.exists(): z.write(file, str(file.relative_to(root)))
    if asset == 'sports':
        z.write(root/'public/models/library/screen-baked.png', 'public/models/library/screen-baked.png')
    for file in sorted((root/f'public/models/{asset}').iterdir()):
        if file.is_file(): z.write(file, str(file.relative_to(root)))
    for file in previews: z.write(file, '预览/'+file.name)
    z.write(verification, '验证记录.json')
    z.writestr('打开说明.txt', f'使用 Blender 4.5 LTS 打开 authoring/{asset}/{asset}.blend。三档模型各自位于独立集合。\n建筑与植物参考官方资料和照片制作，具体估算及复现步骤见 authoring/{asset}/README.md。校园接入与地形准备需完整 Git 仓库。\n本包预览为 Blender 渲染；浏览器验证范围见验证记录，不将离线构建当作网页画面检查。\n')
files.append(source_zip)

runtime_zip = out/f'黎安校园-v{version}-{name}运行版.zip'
review = 'library.html' if asset == 'library' else f'building.html?asset={asset}'
with zipfile.ZipFile(runtime_zip, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for file in sorted((root/'dist').rglob('*')):
        if file.is_file(): z.write(file, str(file.relative_to(root)))
    z.write(verification, '验证记录.json')
    for file in root.glob('*NOTICE*'):
        if file.is_file(): z.write(file, file.name)
    launcher = zipfile.ZipInfo('启动漫游.command'); launcher.create_system = 3; launcher.external_attr = 0o100755 << 16
    z.writestr(launcher, '#!/bin/zsh\ncd -- "$(dirname -- "$0")"\npython3 -m http.server 5175 --bind 127.0.0.1 --directory dist\n')
    z.writestr('打开说明.txt', f'安装 Python 3 后运行「启动漫游.command」，或在解压目录执行：\npython3 -m http.server 5175 --bind 127.0.0.1 --directory dist\n\n校园：http://127.0.0.1:5175/world.html?place={asset}&view=orbit\n模型：http://127.0.0.1:5175/{review}\n使用支持 WebGPU 的浏览器，通过 localhost 打开。不能直接双击 HTML。实际验证范围见验证记录。\n')
files.append(runtime_zip)

for file, prefix in [(source_zip, f'public/models/{asset}/'), (runtime_zip, f'dist/models/{asset}/')]:
    with zipfile.ZipFile(file) as z:
        assert z.testzip() is None
        for level in manifest['lods']:
            assert hashlib.sha256(z.read(prefix+level['file'])).hexdigest() == level['sha256']
with zipfile.ZipFile(source_zip) as z:
    assert z.read(f'authoring/{asset}/{asset}.blend') == (source_dir/f'{asset}.blend').read_bytes()
(out/f'{name}-v{version}-SHA256SUMS.txt').write_text(''.join(hashlib.sha256(f.read_bytes()).hexdigest()+'  '+f.name+'\n' for f in files))
print(json.dumps({'status': 'passed', 'asset': asset, 'version': version, 'files': [{'name':f.name, 'bytes':f.stat().st_size} for f in files]}, ensure_ascii=False, indent=2))
