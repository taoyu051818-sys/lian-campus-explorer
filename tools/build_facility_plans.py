import json,math
import numpy as np
from pathlib import Path
root=Path('outputs/campus-explorer')
plans=json.loads((root/'public/refined-plans.json').read_text())
sources=dict(json.loads(Path('work/new-plans/sources.json').read_text()))
def block(name,fp,h,f,kind,offset=0): return dict(name=name,footprint=[[round(x,3),round(z,3)] for x,z in fp],height=h,floors=f,kind=kind,baseOffset=offset)
def fit(pixels,coords):
 a=np.c_[pixels,np.ones(len(pixels))];m=np.linalg.lstsq(a,coords,rcond=None)[0]
 return m,float(np.linalg.norm(a@m-coords,axis=1).max())
def mapped(points,m,origin): return (np.c_[points,np.ones(len(points))]@m-np.array(origin)).tolist()
# Coordinates transcribed from the red-line schedules; X is northing, Y is easting.
ap=[[493,138],[598,126],[758,251],[477,660],[254,531]]
ac=[[396564.175,2036134.684],[396584.153,2036137.251],[396618.277,2036113.749],[396558.295,2036026.659],[396512.061,2036054.421]]
am,ar=fit(ap,ac)
afp=[[375,390],[418,311],[466,269],[583,239],[633,248],[663,326],[517,363],[503,375],[499,391],[514,542],[420,546],[411,391]]
aorigin=(np.c_[afp,np.ones(len(afp))]@am).mean(axis=0)
plans['activity']=dict(source=sources['大学生活动中心_规划核实.docx'],method='实建测量图 image2；5 个红线控制点仿射拟合，人工描绘简化外轮廓。H=21.8 m、四层来自实建图；立面依据实建照片简化。',traced=True,calibration=dict(image='image2.png',pixels=ap,eastingNorthing=ac,maxControlResidualMeters=round(ar,3)),blocks=[block('大学生活动中心 · 弯折四层主楼',mapped(afp,am,aorigin),21.8,4,'activity')])
hp=[[169,376],[523,108],[723,378],[713,470],[573,581],[436,690]]
hc=[[395752.554,2035094.425],[395834.714,2035156.705],[395881.634,2035094.809],[395879.092,2035073.343],[395847.355,2035047.259],[395815.261,2035021.613]]
hm,hr=fit(hp,hc)
houtline=[[391,290],[421,285],[454,289],[484,303],[512,327],[535,357],[551,391],[555,421],[551,447],[538,471],[516,490],[489,501],[458,505],[428,499],[400,485],[375,462],[356,434],[344,405],[339,376],[344,350],[354,326],[371,303]]
hpodium=[[314,371],[321,333],[342,302],[373,282],[412,274],[455,280],[492,297],[633,429],[435,578],[339,459],[321,419]]
horigin=(np.c_[houtline,np.ones(len(houtline))]@hm).mean(axis=0)
plans['hall']=dict(source=sources['会堂_规划核实.docx'],method='实建测量图 image2 顺时针旋转 90°至北向上；6 个红线控制点仿射拟合，椭圆主厅与低区外轮廓人工描绘。总高19.70 m来自实建图；低区高5.2 m为照片比例估算。',traced=True,calibration=dict(image='image2.png rotated clockwise 90 degrees',pixels=hp,eastingNorthing=hc,maxControlResidualMeters=round(hr,3)),blocks=[block('会堂 · 入口及低区',mapped(hpodium,hm,horigin),5.2,1,'hall-base'),block('会堂 · 椭圆主厅',mapped(houtline,hm,horigin),14.5,1,'hall',5.2)])
def rounded(cx,cz,w,d,angle,r=8):
 pts=[]
 for x,z,start in [(w/2-r,d/2-r,0),(-w/2+r,d/2-r,90),(-w/2+r,-d/2+r,180),(w/2-r,-d/2+r,270)]:
  for j in range(5):
   a=math.radians(start+j*90/4);u=x+r*math.cos(a);v=z+r*math.sin(a)
   pts.append([cx+u*math.cos(angle)-v*math.sin(angle),cz+u*math.sin(angle)+v*math.cos(angle)])
 return pts
angle=math.radians(-34)
plans['sports']=dict(source=sources['综合体育中心_规划核实.pdf'],method='第1–2页实建图尺寸约束的简化圆角体块：游泳馆85.31×96.78 m，体育馆79.00×121.40 m；游泳馆高23.9 m，体育馆实建图高29.9 m，附馆17.4 m。双馆相对位置及转角按图近似，未完成共同坐标配准；表皮纹样依据第15页照片抽象表达。',traced=False,blocks=[block('综合体育中心 · 游泳馆',rounded(-42,82,85.31,96.78,angle,13),23.9,1,'pool'),block('综合体育中心 · 体育馆',rounded(34,-38,79,121.4,angle,8),29.9,1,'gym'),block('综合体育中心 · 附馆',rounded(-10,-104,65,19,angle,7),17.4,3,'sports-annex')])
dorms=[('A栋2号楼',[[402,342],[532,263],[574,329],[446,411]],22,5),('A栋3号楼',[[480,470],[595,401],[633,466],[518,535]],39.1,9),('B栋5号楼',[[173,474],[321,384],[352,438],[205,531]],23.4,5),('B栋6号楼',[[366,553],[412,526],[478,637],[433,665]],39.5,9),('C栋8号楼',[[227,561],[269,538],[362,693],[319,719]],20.6,5),('C栋9号楼',[[733,681],[897,583],[931,635],[766,735]],44,11),('D栋4号楼',[[589,238],[641,207],[737,366],[685,398]],44,11),('D栋7号楼',[[742,432],[783,407],[879,569],[837,595]],45,11),('D栋10号楼',[[617,515],[658,490],[730,610],[688,637]],42.2,11)]
plans['dorm3']=dict(source=sources['学生生活三区_总平面及A栋平面变更.pdf'],method='2026年公示附件第2页变更后总平面，按图示50 m比例尺约125 px换算；人工描绘9个住宅主体外轮廓。楼层数和高度来自右侧表。A栋首两层变更不据此推定室内；立面采用通用宿舍窗格。邻接A65食堂不归入本地块。',traced=False,calibration=dict(image='page-2.png 1500x1062',metersPerPixel=.4,originPixel=[555,480]),blocks=[block('学生生活三区 · '+name,[[(x-555)*.4,(480-y)*.4] for x,y in p],h,f,'dorm3') for name,p,h,f in dorms])
(root/'public/refined-plans.json').write_text(json.dumps(plans,ensure_ascii=False,indent=2)+'\n')
print('activity residual',ar,'hall residual',hr)
