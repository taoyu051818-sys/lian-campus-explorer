from pathlib import Path
import json,math
root=Path('outputs/campus-explorer');df=root/'public/overall/data.json';data=json.loads(df.read_text());pf=root/'public/refined-plans.json';plans=json.loads(pf.read_text())
# Actual construction location image2.jpeg, J1-J13 from its coordinate table (X northing, Y easting).
xy=[[2035174.472,396434.188],[2035181.612,396446.864],[2035187.482,396458.602],[2035192.437,396469.736],[2035197.229,396481.953],[2035201.112,396493.326],[2035204.348,396504.276],[2035206.318,396511.892],[2035164.996,396536.079],[2035158.504,396505.092],[2035141.192,396484.632],[2035120.732,396475.190],[2035118.249,396475.195]]
origin=[sum(p[1] for p in xy)/len(xy),sum(p[0] for p in xy)/len(xy)]
boundary=[[round(y-origin[0],3),round(x-origin[1],3)] for x,y in xy]
# Pixel affine calibration using J1/J8/J13. The tracing is approximate at this image resolution.
px=[[292,448],[657,290],[482,699]];world=[[xy[i][1]-origin[0],xy[i][0]-origin[1]] for i in [0,7,12]]
a,b,c=px;det=(b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1])
def trace(x,y):
 u=((x-a[0])*(c[1]-a[1])-(c[0]-a[0])*(y-a[1]))/det;v=((b[0]-a[0])*(y-a[1])-(x-a[0])*(b[1]-a[1]))/det
 return [world[0][i]+u*(world[1][i]-world[0][i])+v*(world[2][i]-world[0][i]) for i in range(2)]
center=trace(515,506);a1=trace(407,519);a2=trace(565,390);angle=math.atan2(a2[1]-a1[1],a2[0]-a1[0]);co=math.cos(angle);si=math.sin(angle)
def point(x,z):return [center[0]+x*co-z*si,center[1]+x*si+z*co]
def rect(x,z,w,d):return [point(x-w/2,z-d/2),point(x+w/2,z-d/2),point(x+w/2,z+d/2),point(x-w/2,z+d/2)]
blocks=[]
for name,x,z,w,d,h,f,k in [('消防站车库及二层主体',0,4.5,45.95,15.5,8.9,2,'fire-main'),('消防站后部三层楼翼',0,-7.75,34,9,11.9,3,'fire-rear'),('消防站西侧露台楼翼',-19.9875,-7.75,5.975,9,7.5,2,'fire-side'),('消防站东侧露台楼翼',19.9875,-7.75,5.975,9,7.2,2,'fire-side')]:blocks.append(dict(name=name,footprint=rect(x,z,w,d),height=h,floors=f,kind=k))
tower=trace(355,510);tw=[[round(tower[0]+x*co-z*si,4),round(tower[1]+x*si+z*co,4)] for x,z in [[-2.4,-2.8],[2.4,-2.8],[2.4,2.8],[-2.4,2.8]]];blocks.append(dict(name='消防训练塔',footprint=tw,height=20,floors=6,kind='fire-tower'))
source='https://wap.study-hn.cn/upload/file/2025/08/04/2468752f3a444613b6baf09f235265f1.docx'
plans['fire']={'source':source,'traced':True,'method':'2025消防站规划核实附件：image2实建位置图、image4/6/8/10实建楼层及屋顶图、image13/14实建照片。按J1/J8/J13界址点近似配准图内轮廓，主体总宽45.95米；8.9/11.9/7.5/7.2米采用屋顶图注，局部阶梯轮廓简化，训练塔20米为照片估算。全园在A-85与A-87之间地块级定位，不代表CRS配准。','boundary':boundary,'calibration':{'coordinateTableXY':xy,'pixelControls':px,'localOriginEN':origin,'angle':angle,'buildingCenter':center},'blocks':blocks,'forecourt':{'footprint':rect(0,21,43,17),'entry':point(0,29.5)}}
place={'id':'fire','name':'消防站','parcel':'A-86','point':[575,855],'category':'公共设施','status':'实建图参考 · 地块级定位','note':'2025核实图明确A-86，北临南湾路、东北邻A-87、西南邻A-85-01。主体按实建图宽度及屋顶标高分翼，细节简化；训练塔高度估算。全园坐标仅地块级定位。','source':source,'color':'#4f7ea6','number':32}
place['polygon']=[[round(place['point'][0]+e*.19,5),round(place['point'][1]-n*.19,5)] for e,n in boundary]
data['places']=[p for p in data['places'] if p['id']!='fire']+[place]
if isinstance(data.get('unplaced'),list):data['unplaced']=[s for s in data['unplaced'] if '消防' not in s]
df.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');pf.write_text(json.dumps(plans,ensure_ascii=False,indent=2)+'\n')
print('building center',center,'angle',angle,'tower',tower)
