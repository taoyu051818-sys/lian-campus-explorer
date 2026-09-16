from pathlib import Path
import json
root=Path('outputs/campus-explorer');df=root/'public/overall/data.json';data=json.loads(df.read_text());pf=root/'public/refined-plans.json';plans=json.loads(pf.read_text())
# 1335x1888 page-3 reference: three visible building corner coordinates, X north / Y east.
px=[[485,282],[358,470],[818,524]];en=[[396782.152,2036260.848],[396760.470,2036231.584],[396834.601,2036223.340]]
a,b,c=px;det=(b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1])
def absolute(x,y):
 u=((x-a[0])*(c[1]-a[1])-(c[0]-a[0])*(y-a[1]))/det;v=((b[0]-a[0])*(y-a[1])-(x-a[0])*(b[1]-a[1]))/det
 return [en[0][i]+u*(en[1][i]-en[0][i])+v*(en[2][i]-en[0][i]) for i in range(2)]
origin=absolute(591,490)
def trace(fp):return [[v-origin[i] for i,v in enumerate(absolute(x,y))] for x,y in fp]
outer=[[619,420],[818,524],[722,689],[523,585]];inner=[[635,467],[757,530],[707,616],[585,553]]
blocks=[dict(name='派出所西北三层楼翼',footprint=trace([[485,282],[645,375],[619,420],[520,367],[433,514],[358,470]]),height=13.8,floors=3,kind='police')]
for i,label in enumerate(['东北两层楼翼','东南入口楼翼','西南两层楼翼','庭院低区楼翼']):blocks.append(dict(name='派出所'+label,footprint=trace([outer[i],outer[(i+1)%4],inner[(i+1)%4],inner[i]]),height=5.5 if i==3 else 10.2,floors=1 if i==3 else 2,kind='police'))
blocks.append(dict(name='派出所庭院连接低区',footprint=trace([[433,514],[495,541],[523,585],[460,549]]),height=5.5,floors=1,kind='police'))
source='https://wap.study-hn.cn/upload/file/2025/08/04/33b804ba6d7a4fb1bba3b8ff2d1602ea.pdf'
plans['police']={'source':source,'traced':True,'method':'2025派出所规划核实PDF第3页实际建设位置图、第9页实建照片，2025一期控规正文确认A-29-01。1335×1888参考图按三个可读建筑角点坐标仿射校准，楼翼与庭院线人工近似提取，13.8/10.2米为图注；低区5.5米暂沿报建图估算。全园仍按地块关系锚定，不表示完成投影坐标配准，室内未建。','calibration':{'referenceSize':[1335,1888],'pixelControls':px,'coordinatesEN':en,'localOriginEN':origin},'courtyardProbes':trace([[482,448],[670,541]]),'blocks':blocks}
place={'id':'police','name':'派出所','parcel':'A-29-01','point':[637,661],'category':'公共设施','status':'实建图参考 · 庭院楼翼','note':'2025一期控规明确现状派出所为A-29-01；实建图邻建三路，北侧为A-30、南侧为A-29。主体与庭院按核实图近似提取，楼高采用13.8/10.2米图注，低区高度估算。全园地块级定位，未作投影配准。','source':source,'color':'#4f7ea6','number':33}
place['polygon']=[[round(place['point'][0]+e*.19,5),round(place['point'][1]-n*.19,5)] for e,n in trace([[485,243],[930,507],[766,783],[282,505]])]
data['places']=[p for p in data['places'] if p['id']!='police']+[place]
df.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');pf.write_text(json.dumps(plans,ensure_ascii=False,indent=2)+'\n')
