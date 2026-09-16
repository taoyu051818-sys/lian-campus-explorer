from pathlib import Path
import json,math
root=Path('outputs/campus-explorer');pf=root/'public/refined-plans.json';plans=json.loads(pf.read_text());df=root/'public/overall/data.json';data=json.loads(df.read_text())
# Original attached image1 planning roof plan, 1227x1076. Actual image2 provides parcel area and north orientation.
boundaryPx=[[225,116],[1030,116],[1105,197],[1126,894],[1008,862],[855,812],[699,826],[535,883],[335,978],[147,934],[162,570],[179,224]]
area=abs(sum(p[0]*boundaryPx[(i+1)%len(boundaryPx)][1]-boundaryPx[(i+1)%len(boundaryPx)][0]*p[1] for i,p in enumerate(boundaryPx)))/2
scale=math.sqrt(54477.7/area);c=math.sqrt(.5)
def point(x,y):return [(x+y-1205)*scale*c,(x-y-95)*scale*c]
def rect(x1,y1,x2,y2):return [point(x1,y1),point(x2,y1),point(x2,y2),point(x1,y2)]
blocks=[]
def block(number,label,box,floors):blocks.append(dict(name=f'生活一区{number}号楼 · {label}',footprint=rect(*box),height=4.2+(floors-1)*3.4,floors=floors,kind='dorm56' if number!=11 else 'dorm56-service'))
# Disjoint exterior volumes approximate the original stepped roof plan. No room geometry.
for num,x1,x2,y1,ys,fs in [(4,275,367,160,[252,278,305,343],[8,7,6,5]),(2,721,791,161,[252,278,307,343],[9,7,6,5]),(7,493,558,508,[645,675,722],[10,6,5]),(5,923,996,508,[645,677,722],[10,6,5])]:
 for i,(y2,f) in enumerate(zip(ys,fs)):block(num,f'退台段{i+1}',[x1,y1,x2,y2],f);y1=y2
block(3,'北楼翼',[456,208,600,270],11);block(3,'东楼翼',[558,270,600,382],9);block(3,'南楼翼',[496,320,558,382],8)
block(1,'北楼翼',[902,208,1027,272],11);block(1,'西楼翼',[902,272,976,382],9);block(1,'东侧退台',[976,272,1027,325],7);block(1,'东南退台',[976,325,1027,382],5)
block(8,'北楼翼',[218,560,367,623],10);block(8,'西楼翼',[218,623,279,723],9);block(8,'南楼翼',[279,671,367,723],7)
block(6,'北楼翼',[659,558,791,620],9);block(6,'西楼翼',[659,620,705,723],10);block(6,'南楼翼',[705,673,791,723],7)
block(10,'西低区',[218,422,263,486],4);block(10,'主楼翼',[263,422,367,486],9)
block(9,'西低区',[651,422,687,486],4);block(9,'主楼翼',[687,422,791,486],9)
block(11,'配套主楼',[192,790,334,906],3);block(11,'配套东翼',[334,790,411,866],3)
source='https://wap.study-hn.cn/upload/file/2025/08/04/25debde2816b4d37a9c0f72000a7847c.docx'
previousAccess={k:plans.get('dorm56',{}).get(k) for k in ['walkways','walkwayMethod'] if k in plans.get('dorm56',{})}
plans['dorm56']={'source':source,'traced':False,'method':'生活一区核实DOCX实建图S=54477.7平方米，与2025控规A-56面积54478平方米及建二路/南湾路、地块形状交叉对应，属于有依据的对应推断。实建小图不够清晰，轮廓与退台主要描绘image1报建屋顶图，照片参考水平阳台带。按实建地块面积校准图上红线近似比例，北向约45度；层数简化、层高估算，全园仍为地块级定位，不是实建测绘模型。','calibration':{'planningReferenceSize':[1227,1076],'planningBoundaryPixels':boundaryPx,'actualParcelArea':54477.7,'controlPlanA56Area':54478,'metresPerPixel':scale,'northDirection':'upper-left in planning reference','sourcePrecision':'planning silhouettes informed by as-built photos; floor heights estimated'},'courtyardProbes':[point(313,647),point(745,646),point(520,294)],'blocks':blocks}
plans['dorm56'].update(previousAccess)
p=next(p for p in data['places'] if p['id']=='dorm56');p['name']='学生生活一区';p['status']='面积/道路对应 · 退台外形';p['note']='实建核实图面积54477.7平方米与A-56控规54478平方米吻合，结合建二路/南湾路及形状作对应推断。按报建屋顶图补1—11号楼的简化退台和阳台带，照片参考外观；高度估算，仅建外部。';p['source']=source
pf.write_text(json.dumps(plans,ensure_ascii=False,indent=2)+'\n');df.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');print('volumes',len(blocks),'scale',scale)
