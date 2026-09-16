from pathlib import Path
import json,math
root=Path('outputs/campus-explorer');path=root/'public/refined-plans.json';plans=json.loads(path.read_text());sources=json.loads(Path('outputs/其他学校与校园设施资料/来源索引.json').read_text())
def rect(x,z,w,d):return [[x-w/2,z-d/2],[x+w/2,z-d/2],[x+w/2,z+d/2],[x-w/2,z+d/2]]
for id,angle in [('hub30',-.32),('hub87',-.32)]:
 def rot(p):
  x,z=p;c=math.cos(angle);s=math.sin(angle);return [round(x*c-z*s,4),round(x*s+z*c,4)]
 is30=id=='hub30';center=[-7,-18] if is30 else [-5,-13]
 fp=rect(*center,28,11) if is30 else [[center[0]+13*math.cos(i*math.pi/16),center[1]+6.5*math.sin(i*math.pi/16)] for i in range(32)]
 name='接驳换乘站房' if is30 else '车辆服务站房'
 file='2024-07-17_公共交通枢纽_A30.pdf' if is30 else '2024-07-18_公共交通枢纽_A87.pdf'
 plans[id]={'source':next(s['attachment'] for s in sources if s['file']==file),'traced':False,'method':'2024公告单页鸟瞰效果图外形参考，无比例尺。场地、朝向、站房与车棚尺寸均为游戏估算；只建本交通设施，排除背景综合楼。车辆为静态场景陈设，非运营数量。','blocks':[dict(name=name,footprint=list(map(rot,fp)),height=4.2,floors=1,kind=id)],'transport':{'angle':angle,'footprint':list(map(rot,rect(0,0,60,64))),'entry':rot([24,-32 if is30 else 32]),'canopies':([{'x':x,'z':10,'width':7,'depth':29} for x in [-19,-2,15]] if is30 else [{'x':0,'z':18,'width':48,'depth':13}])}}
path.write_text(json.dumps(plans,ensure_ascii=False,indent=2)+'\n')
