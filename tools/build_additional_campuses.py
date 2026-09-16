from pathlib import Path
import json,math,numpy as np
root=Path('outputs/campus-explorer');plans=json.loads((root/'public/refined-plans.json').read_text());sources=json.loads(Path('outputs/其他学校与校园设施资料/来源索引.json').read_text())
def source(name):return next(s['attachment'] for s in sources if s['file']==name)
def block(name,fp,h,f,kind):return dict(name=name,footprint=np.round(fp,3).tolist(),height=h,floors=f,kind=kind)
def rotate(fp,a=.8):return [[x*math.cos(a)-z*math.sin(a),x*math.sin(a)+z*math.cos(a)] for x,z in fp]
def soften(fp):
 return [[p[0]*.94+q[0]*.06,p[1]*.94+q[1]*.06] for i,p in enumerate(fp) for q in [fp[(i-1)%len(fp)],fp[(i+1)%len(fp)]]]
def rect(x,z,w,d):return [[x-w/2,z-d/2],[x+w/2,z-d/2],[x+w/2,z+d/2],[x-w/2,z+d/2]]
pixels=[[280,590],[372,719],[445,731],[1056,285],[1097,251],[961,94]]
coords=[[395573.192,2034921.551],[395599.579,2034882.970],[395621.898,2034878.850],[395803.134,2035012.108],[395815.261,2035021.613],[395775.150,2035068.188]]
a=np.c_[pixels,np.ones(len(pixels))];m=np.linalg.lstsq(a,coords,rcond=None)[0];res=np.linalg.norm(a@m-coords,axis=1).max()
fp=np.array([[434,512],[811,235],[880,331],[504,607]]);metric=np.c_[fp,np.ones(len(fp))]@m;metric-=metric.mean(axis=0)
plans['incubator']=dict(source=source('2025-09-22_创新创业与产业孵化中心_规划核实.docx'),traced=True,method='2025实建测量图image2，六个界址点仿射拟合并描绘主体外包轮廓。按实建分层图五层，层高暂估4.5 m（总高22.5 m）。采用image20实建照片的深色玻璃、上部铜色表皮与白色屋顶构架，不沿用image19绿色报建外观；立面分格、局部退让和屋顶构架尺寸为近似。',calibration=dict(image='image2.png 1223x863',pixels=pixels,eastingNorthing=coords,maxControlResidualMeters=round(float(res),3)),blocks=[block('创新创业孵化中心 · 五层长条主楼',metric,22.5,5,'incubator')])
minzu=[('北侧折翼教学楼',[[-62,18],[-62,63],[38,63],[38,45],[-39,45],[-39,18]],23.4,6),('开放合院楼',[[-65,8],[-6,8],[-6,-47],[-24,-47],[-24,-9],[-47,-9],[-47,-47],[-65,-47]],15.6,4),('南侧折翼楼',[[13,-8],[66,-8],[66,-67],[49,-67],[49,-26],[13,-26]],15.6,4)]
plans['minzu']=dict(source=source('2024-07-17_中央民族大学教学实践中心.pdf'),traced=False,method='仅有2024滨海方向鸟瞰效果图。根据三组可见体量搭建开放合院与两组折翼楼，深灰缓坡屋顶、浅色墙面及红色局部构件为图像参考。全部平面尺寸、朝向、楼层及楼高为原型估算；未取得可量取总平面，不代表实建。画面半透明的相邻建筑不重复建入本地块。',blocks=[block('中央民族大学 · '+n,rotate(soften(fp)),h,f,'minzu') for n,fp,h,f in minzu])
def strip(path,width):
 normals=[]
 for a,b in zip(path,path[1:]):
  dx,dz=b[0]-a[0],b[1]-a[1];d=math.hypot(dx,dz);normals.append([-dz/d,dx/d])
 sides=[]
 for sign in [1,-1]:
  side=[]
  for i,p in enumerate(path):
   if i==0:n=normals[0];factor=width/2
   elif i==len(path)-1:n=normals[-1];factor=width/2
   else:
    n=np.array(normals[i-1])+np.array(normals[i]);n=n/np.linalg.norm(n);factor=width/2/np.dot(n,normals[i])
   side.append([p[0]+sign*n[0]*factor,p[1]+sign*n[1]*factor])
  sides.append(side)
 return sides[0]+sides[1][::-1]
main=strip([[-53,-60],[-53,-15],[38,-15],[38,28],[-35,28],[-35,62]],16)
plans['blcu']=dict(source=source('2024-07-09_北京语言大学教学实践中心.pdf'),traced=False,method='仅有2024鸟瞰效果图。S形连贯楼翼、圆角独立楼及小型方形配楼，白色水平带、绿色立面条和屋顶绿化据图简化。所有平面尺寸、朝向、楼层及楼高为估算，尚无可量取总平面，不代表实建。',blocks=[block('北京语言大学 · 连续折翼主楼',rotate(soften(main)),23.4,6,'blcu'),block('北京语言大学 · 圆角配楼',rotate(soften(rect(73,31,30,32))),17.6,4,'blcu'),block('北京语言大学 · 方形配楼',rotate(rect(-3,-57,26,24)),13.2,3,'blcu')])
(root/'public/refined-plans.json').write_text(json.dumps(plans,ensure_ascii=False,indent=2)+'\n');print('incubator control residual',round(float(res),3))
