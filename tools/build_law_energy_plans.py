"""Trace the two 2026 law phases once; energy station is explicitly image-estimated."""
from pathlib import Path
import json, math
root=Path('outputs/campus-explorer')
plans=json.loads((root/'public/refined-plans.json').read_text())
sources=json.loads(Path('outputs/其他学校与校园设施资料/来源索引.json').read_text())
def source(name):return next(s['attachment'] for s in sources if s['file']==name)
def block(name,fp,h,f,kind,**kw):return dict(name=name,footprint=[[round(x,3),round(z,3)] for x,z in fp],height=h,floors=f,kind=kind,**kw)
def metric(fp):return [[(x-740)*50/152,(595-y)*50/152] for x,y in fp]
def soften(fp,amount=.025):return [[p[0]*(1-amount)+q[0]*amount,p[1]*(1-amount)+q[1]*amount] for i,p in enumerate(fp) for q in [fp[(i-1)%len(fp)],fp[(i+1)%len(fp)]]]
# Pixel coordinates: 1800 x 1273 page 5 renders, 50 m scale bar = 152 pixels. North is up.
law=[
 ('一期 1号综合楼 · 13层',[[590,587],[639,553],[766,702],[714,746]],60,13,'law-tower-red','1'),
 ('一期 2号教学楼 · 开放庭院',[[365,591],[500,482],[541,474],[550,486],[473,550],[513,594],[530,567],[549,591],[472,726],[455,739],[376,647],[365,633],[379,622]],25.3,5,'law-white','2'),
 ('一期 3号实验楼 · 开放庭院',[[548,843],[569,824],[707,779],[724,810],[609,852],[667,917],[802,807],[817,798],[828,816],[811,850],[666,973],[650,966]],30.1,6,'law-white','3'),
 ('二期 4号综合楼 · 11层主翼',[[714,466],[765,423],[906,588],[855,631]],51.4,11,'law-tower-white','4'),
 ('二期 4号综合楼 · 北侧9层翼',[[768,420],[806,387],[842,426],[801,460]],42.2,9,'law-tower-white','4'),
 ('二期 4号综合楼 · 南侧9层翼',[[881,553],[918,521],[953,562],[914,595]],42.2,9,'law-tower-white','4'),
 ('二期 5号教学楼 · 折翼',[[645,372],[671,335],[791,224],[810,222],[919,348],[873,396],[782,292],[661,394]],20.8,4,'law-red','5'),
 ('二期 6号实验楼 · 折翼',[[960,503],[1011,455],[1115,578],[1117,604],[1084,642],[967,712],[946,723],[927,698],[1041,607]],25.3,5,'law-red','6'),
]
plans['law']=dict(source=source('2026-06-12_自贸港涉外商事法务与知识产权教学实践中心项目（一期）.pdf'),additionalSources=[source('2026-06-12_自贸港涉外商事法务与知识产权教学实践中心项目（二期）.pdf')],traced=True,method='2026一期/二期第5页总平面，各期分别1—3号及4—6号楼，共用底图只提取一次。1800×1273预览按50米/152像素比例尺、北向向上描绘六栋楼的8个分翼主体，开放庭院不填实。最高层数13/5/6/11/4/5及规划高60.00/25.30/30.10/51.40/20.80/25.30米来自图注；4号9层侧翼42.2米为按主翼层高估算，其他局部2—5层退台未完整恢复。立面参考两份效果图的红褐/白色分区、窗格及屋顶构架；非实建测量。第4页残留东北林业旧名不作为另一套建筑再建。',calibration=dict(imageSize=[1800,1273],scaleBarPixels=152,scaleBarMeters=50),blocks=[block('法务中心 · '+n,metric(soften(fp)),h,f,kind,buildingNumber=num) for n,fp,h,f,kind,num in law])
energy=[
 ('2号楼 · 高区折翼',[[-55,-22],[-55,35],[-30,52],[52,52],[52,24],[-22,24],[-30,17],[-30,-22]],23.5,5),
 ('2号楼 · 低区折翼',[[-16,-40],[43,-40],[58,-21],[58,13],[34,13],[34,-8],[-16,-8]],14.1,3),
]
plans['energy']=dict(source=source('2025-09-15_综合智慧能源项目1号能源站拟进行设计方案调整公示.pdf'),traced=False,method='采用2025外立面调整附件第7—10页“改造后”效果图；附件标注为1号能源站项目中的2号楼，不误写成2号能源站。双折翼高低分区、玻璃横窗带、白色屋顶折线格栅及屋顶设备为效果图参考。平面113×92米范围、5/3层、23.5/14.1米主体高度与屋顶屏风3—6米均为游戏原型估算，无可量取总平面或实测坐标；尚不代表整个A-44范围或能源站完整楼栋清单。未使用第2—5页改造前立面。',blocks=[block('1号能源站 · '+n,fp,h,f,'energy') for n,fp,h,f in energy])
(root/'public/refined-plans.json').write_text(json.dumps(plans,ensure_ascii=False,indent=2)+'\n')
print('law',len(law),'energy',len(energy))
