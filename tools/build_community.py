from pathlib import Path
import json,math
root=Path('outputs/campus-explorer');pf=root/'public/refined-plans.json';plans=json.loads(pf.read_text());df=root/'public/overall/data.json';data=json.loads(df.read_text())
# Manual simplified outlines in the 1400 x 1050 planning verification scope illustration.
# The bold red line marks six buildings under review, not the full parcel boundary.
boundary=[[490,235],[969,273],[1067,810],[910,870],[736,903],[550,902],[326,860]]
area=abs(sum(p[0]*boundary[(i+1)%len(boundary)][1]-boundary[(i+1)%len(boundary)][0]*p[1] for i,p in enumerate(boundary)))/2
scale=math.sqrt(78746/area)
def point(x,y):return [(x-700)*scale,(570-y)*scale]
blocks=[]
def add(name,fp,floors,scope='图中背景范围'):
 blocks.append(dict(name='龙光社区 · '+name,footprint=[point(*p) for p in fp],height=floors*3.1+0.7,floors=floors,kind='community-high' if floors>4 else 'community-low',evidenceScope=scope))
high=[('北侧折角住宅',[[470,408],[505,290],[567,274],[574,299],[522,315],[491,414]]),('北侧住宅二',[[602,318],[665,287],[680,314],[617,344]]),('北侧住宅三',[[701,327],[776,292],[791,320],[716,353]]),('东北住宅',[[820,350],[935,307],[947,335],[834,381]]),('北庭院住宅一',[[568,382],[588,364],[650,426],[632,444]]),('北庭院住宅二',[[691,399],[711,383],[766,451],[746,470]]),('北庭院住宅三',[[811,439],[830,420],[882,483],[863,501]]),('8号楼',[[923,495],[948,482],[991,584],[967,595]]),('9号楼',[[928,632],[951,621],[989,713],[968,725]]),('10号楼',[[966,726],[987,741],[940,806],[918,791]]),('11号楼',[[915,800],[929,821],[826,865],[812,842]])]
for name,fp in high:add(name,fp,11,'本次申请核实范围' if name=='8号楼' else '图注已交付范围' if name in ['9号楼','10号楼','11号楼'] else '图中背景范围')
# Low-rise rows: each quad preserves a separate visible roof strip and open passages.
rows=[('西侧北一',[[455,434],[490,443],[477,502],[437,491]]),('西侧北二',[[432,510],[470,520],[455,575],[416,565]]),('西侧中一',[[407,602],[443,611],[432,669],[393,659]]),('西侧中二',[[389,677],[426,687],[411,738],[376,727]]),('西侧南部联排',[[366,751],[405,763],[378,850],[341,839]]),('西二列北一',[[518,443],[556,451],[544,506],[505,495]]),('西二列北二',[[500,507],[537,518],[518,590],[479,579]]),('西二列中一',[[461,640],[500,651],[480,723],[443,712]]),('西二列南一',[[431,733],[469,744],[453,797],[415,786]]),('西二列南二',[[410,803],[450,815],[435,867],[395,854]]),('北排联排',[[579,457],[691,487],[681,517],[570,488]]),('中排西一',[[558,520],[618,536],[608,567],[548,551]]),('中排东一',[[635,539],[687,553],[678,584],[625,569]]),('中排西二',[[541,571],[600,587],[590,617],[531,601]]),('中排东二',[[617,590],[671,605],[662,635],[608,620]]),('南排一',[[507,646],[643,682],[633,714],[498,678]]),('南排二',[[489,708],[625,744],[615,777],[480,741]]),('南排三',[[484,769],[608,802],[598,832],[475,800]]),('南排四',[[466,826],[590,860],[581,884],[457,855]]),('24号楼',[[728,504],[874,543],[864,573],[719,536]]),('27号楼',[[710,558],[769,574],[761,602],[702,586]]),('28号楼',[[789,579],[865,600],[856,631],[780,610]]),('31号楼',[[695,610],[752,625],[744,654],[687,639]]),('32号楼',[[774,635],[851,656],[842,688],[765,667]]),('34号楼',[[655,692],[775,724],[764,754],[647,725]]),('36号楼',[[635,750],[726,775],[717,807],[627,782]]),('38号楼',[[617,810],[742,844],[733,876],[608,842]])]
for name,fp in rows:add(name,fp,3,'本次申请核实范围' if name in ['24号楼','27号楼','28号楼','31号楼','34号楼'] else '图注已交付范围' if name in ['32号楼','36号楼','38号楼'] else '图中背景范围')
source='https://wap.study-hn.cn/upload/file/2025/08/04/17b821afeeec4048bbf4b3e0a79eb447.pdf'
previousAccess={k:plans.get('community',{}).get(k) for k in ['walkways','walkwayMethod'] if k in plans.get('community',{})}
plans['community']={'source':source,'traced':False,'method':'A06分期规划核实区域示意图支持地块和楼群排列。人工简化1400×1050图中的可见屋顶，按整地块轮廓与2025控规78746平方米作面积比例估算；不能把印刷1:500套用到重采样图。北向依建一路/文黎大道/规二路/规三路对应近似，未全园测绘配准。高低住宅按11层/3层作游戏体量假设，立面通用估算；仅红线圈定六栋为本次核实范围，背景楼群不作竣工证明。','calibration':{'referenceSize':[1400,1050],'parcelArea':78746,'boundaryPixels':boundary,'metresPerPixel':scale,'heightSource':'estimated 11/3 storeys; not surveyed','scope':'six highlighted buildings vs delivered-area labels vs unverified background'},'courtyardProbes':[point(650,375),point(875,423),point(602,650),point(775,703)],'blocks':blocks}
plans['community'].update(previousAccess)
p=next(p for p in data['places'] if p['id']=='community');p['status']='范围图参考 · 楼群外形';p['note']='A06范围图明确地块与六栋核实范围，按可见屋顶排列补住宅群外观。背景楼群不代表全部已验收，楼高、立面和尺寸有估算，仅建外部。';p['source']=source
pf.write_text(json.dumps(plans,ensure_ascii=False,indent=2)+'\n');df.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');print(len(blocks),scale)
