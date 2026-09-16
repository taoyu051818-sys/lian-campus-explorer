"""Planning-image traces. Pixel coordinates refer to the preview sizes documented below."""
from pathlib import Path
import json, math
import numpy as np
root=Path('outputs/campus-explorer')
plans=json.loads((root/'public/refined-plans.json').read_text())
sources=json.loads(Path('outputs/其他学校与校园设施资料/来源索引.json').read_text())
def source(name): return next(s['attachment'] for s in sources if s['file']==name)
def smooth(p,n=2):
 for _ in range(n): p=[[a[0]*t+b[0]*(1-t),a[1]*t+b[1]*(1-t)] for a,b in zip(p,p[1:]+p[:1]) for t in [.75,.25]]
 return p
def block(name,fp,h,f,kind): return dict(name=name,footprint=np.round(fp,3).tolist(),height=h,floors=f,kind=kind)
def scaled(fp,origin,scale):return [[(x-origin[0])*scale,(origin[1]-y)*scale] for x,y in fp]
def arc(cx,cy,rx,ry,start,end,n=22):return [[cx+rx*math.cos(t),cy+ry*math.sin(t)] for t in np.linspace(start,end,n)]
def cshape(cx,cy,rx,ry,width,start,end):return arc(cx,cy,rx,ry,start,end)+arc(cx,cy,rx-width,ry-width,end,start)

# The two phase drawings share one background. Each numbered wing is emitted only once.
dorm=[
 ('1-1 北侧短板楼',[[408,288],[493,223],[527,269],[442,335]],25.15,6),
 ('1-2 北侧弧形楼',cshape(622,251,104,99,44,-2.30,1.0),21.55,5),
 ('1-3 北侧高板楼',[[493,381],[605,300],[648,362],[537,443]],43.45,11),
 ('2-1 东侧高板楼',[[676,430],[810,331],[850,384],[716,483]],42.90,10),
 ('2-2 东侧弧形楼',cshape(850,519,103,108,45,-.95,3.75),25.15,6),
 ('4-1 南侧高板楼',[[529,644],[640,563],[681,617],[570,698]],40.60,10),
 ('4-2 南侧弧形楼',cshape(554,776,107,92,42,.68,4.18),25.10,5),
 ('4-3 南侧短高楼',[[659,738],[748,674],[784,724],[694,789]],42.90,11),
 ('5 西侧高板楼',[[342,636],[474,539],[510,584],[378,681]],44.90,11),
 ('6 食堂开放庭院',[[279,397],[342,351],[390,417],[367,436],[414,488],[285,571],[220,481],[205,451],[213,424],[236,414],[269,436],[299,479],[356,438],[332,405],[302,426]],24.10,4),
 ('3 门卫',[[769,262],[779,274],[765,284],[756,272]],4.70,1),
]
plans['dorm62']=dict(source=source('2026-01-22_高校学生宿舍（四区）项目.pdf'),additionalSources=[source('2026-01-22_高校学生宿舍（五区）项目.pdf')],traced=True,method='2026四区/五区批前总平面，共用底图去重。按1400×990预览图50米比例尺（117像素）量取，北向按图；分离1-1至6号等11个主体，弧线为轮廓近似，保留三组开放庭院。高度/最高层数依据图注与指标表，局部台阶退层、连廊、地下室和门洞未还原。食堂只提取本项目6号，不代表A-38-02配套食堂。立面和蓝色屋顶构件参考效果图，非实建测量。',calibration=dict(imageSize=[1400,990],scaleBarPixels=117,scaleBarMeters=50),blocks=[block('四五区宿舍 · '+name,scaled(fp,[587,505],50/117),h,f,'dorm62') for name,fp,h,f in dorm])

# Three separate ring sectors preserve the open triangular courtyard. Millimetric seams avoid coincident faces.
outer=smooth([[386,177],[751,393],[377,589]],3)
inner=smooth([[447,283],[628,394],[442,491]],3)
N=len(outer); workshop=[]
for sector in range(3):
 ids=[i%N for i in range(sector*N//3,(sector+1)*N//3+1)]
 fp=[outer[i] for i in ids]+[inner[i] for i in ids[::-1]]
 center=np.mean(fp,axis=0); fp=center+(np.array(fp)-center)*.9998
 workshop.append(block('产教协同工坊 · '+['北东翼','南翼','西翼'][sector],scaled(fp,[524,386],50/238),28.1,5,'workshop'))
plans['workshop']=dict(source=source('2026-01-22_产教协同创新工坊项目.pdf'),traced=True,method='2026批前A-70总平面，1400×990预览图50米比例尺（238像素），北向按图。圆角三角外包轮廓及中庭按图近似描绘，拆为三翼保留露天中庭；5层、规划高度28.10米。效果图参考浅色竖向窗格和蓝灰屋面；三角中庭台阶、局部架空入口及地下室尚未还原，不代表实建。',calibration=dict(imageSize=[1400,990],scaleBarPixels=238,scaleBarMeters=50),blocks=workshop)

# Geology sheet north is oblique: fit labeled red-line coordinates, not screen-up.
pixels=np.array([[217,179],[1431,179],[255,877]])
en=np.array([[396662.035,2036851.306],[396914.875,2036721.135],[396595.053,2036704.483]])
affine=np.linalg.solve(np.c_[pixels,np.ones(3)],en)
origin=np.array([860,500,1])@affine
def geology_metric(fp):return np.c_[fp,np.ones(len(fp))]@affine-origin
geo=[
 ('北侧西端三层翼',smooth([[355,256],[415,256],[433,357],[370,357]]),17.2,3),
 ('北侧西段四层翼',[[418,256],[615,256],[635,357],[436,357]],22.4,4),
 ('北侧五层教学长翼',[[618,256],[1235,256],[1209,357],[638,357]],28.4,5),
 ('北侧东端四层翼',smooth([[1238,256],[1367,256],[1346,357],[1212,357]]),22.4,4),
 ('西侧弧形实践翼',[[483,360],[532,368],[567,393],[587,430],[590,480],[590,571],[579,619],[551,659],[511,687],[460,699],[400,705],[386,726],[395,777],[414,796],[526,772],[658,772],[680,756],[683,464],[697,412],[724,379],[753,360]],22.4,4),
 ('东侧弧形实践翼',[[881,360],[923,377],[955,407],[974,451],[977,539],[966,584],[945,615],[910,638],[852,643],[835,663],[835,717],[852,739],[1245,739],[1262,721],[1248,662],[1227,643],[1178,640],[1134,620],[1100,591],[1078,551],[1073,453],[1086,410],[1115,379],[1156,360]],28.4,5),
]
plans['geology']=dict(source=source('2026-06-12_地质资源工程与材料科学教学实践中心项目.pdf'),traced=True,method='2026 A-20批前总平面第4页，1800×1273栅格按三个红线坐标控制点作仿射换算（原图X为北坐标、Y为东坐标），保留图中斜北方向。按主体轮廓拆为北侧长翼及两组弧形实践翼，庭院留空。规划最大高度28.4米；3/4层段暂估17.2/22.4米，局部2层退台、屋面三角采光井与曲面渐变待补。白色窗带、低矮屋顶花池参考效果图。相邻北语建筑不重复纳入。',calibration=dict(imageSize=[1800,1273],pixels=pixels.tolist(),eastingNorthing=en.tolist(),controlPoints=3,independentCheck=False),blocks=[block('地质资源中心 · '+name,geology_metric(fp),h,f,'geology') for name,fp,h,f in geo])
previous=plans['blcu'].get('a20SpacingCorrection',[0,0])
if previous is True: previous=[-24,0]
target=[22,-30]
for b in plans['blcu']['blocks']:
 if '圆角配楼' in b['name']: b['footprint']=[[round(x+target[0]-previous[0],3),round(z+target[1]-previous[1],3)] for x,z in b['footprint']]
plans['blcu']['a20SpacingCorrection']=target
plans['blcu']['method']=plans['blcu']['method'].split(' v0.8：')[0]+' v0.8：圆角配楼向东22米、向南30米平移，避让新接入A-20图纸轮廓及本校楼翼；该配楼仍为位置估算。'
(root/'public/refined-plans.json').write_text(json.dumps(plans,ensure_ascii=False,indent=2)+'\n')
print({k:len(plans[k]['blocks']) for k in ['dorm62','workshop','geology']})
