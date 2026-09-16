"""Photo-reference candidate for A-52; dimensions and parcel correspondence are not surveyed."""
from pathlib import Path
import json,math
R=Path(__file__).resolve().parents[1];p=R/'public/refined-plans.json';d=json.loads(p.read_text());a=math.radians(32)
def pt(x,z):return [round(x*math.cos(a)-z*math.sin(a),3),round(x*math.sin(a)+z*math.cos(a),3)]
def rect(x,z,w,h):return [pt(x-w/2,z-h/2),pt(x+w/2,z-h/2),pt(x+w/2,z+h/2),pt(x-w/2,z+h/2)]
blocks=[];paths=[]
for n,(x,z) in enumerate([(-42,-43),(42,-43),(-42,43),(42,43)],1):
 # Four open courtyards visible in the aerial; labels are modelling indices, not real doorplates.
 # A central gap in the inward-facing wall permits exterior courtyard access.
 sx=1 if x>0 else -1
 parts=[(x,z-25,58,10),(x,z+25,58,10),(x+sx*24,z,10,40),(x-sx*24,z-12,10,16),(x-sx*24,z+12,10,16)]
 for k,(u,v,w,h) in enumerate(parts):blocks.append({'name':f'生活二区照片参考合院{n}外翼{k+1}','kind':'dorm52-photo','height':21.6,'floors':6,'footprint':rect(u,v,w,h)})
 paths.append({'name':f'候选合院{n}室外入口','points':[pt(0,z),pt(x,z)]})
# The photo's circular shared low-rise is represented by separated arc volumes, leaving four access gaps.
for k in range(4):
 angles=[math.radians(k*90+14+i*62/12) for i in range(13)]
 fp=[pt(16*math.cos(t),16*math.sin(t)) for t in angles]+[pt(11*math.cos(t),11*math.sin(t)) for t in reversed(angles)]
 blocks.append({'name':f'照片参考中央环形共享外廊{k+1}','kind':'dorm52-shared','height':10.8,'floors':3,'footprint':fp})
paths += [{'name':'生活二区候选中央南北步道','points':[pt(0,z) for z in [-81,-43,0,43,81]]},{'name':'生活二区候选中央东西步道','points':[pt(x,0) for x in [-82,0,82]]}]
for path in paths:path['width']=2.8
d['dorm52']={'source':'https://admission.blcu.edu.cn/en/2024/0819/c1643a2810/page.htm','traced':False,'method':'Four courtyards from published aerials, refined with official 2024-06-17 close photographs. Visible main dormitory facade has six floors; shared gallery photograph has three levels. Candidate masses updated to six floors/21.6m and three floors/10.8m using estimated 3.6m floor spacing. White balcony grid, privacy louvers, blue frames and brick stair accents are photo references; exact room bays, dimensions and A52 cadastral correspondence remain unverified. Existing ground paths retained; no interiors.','additionalSources':['https://www.study-hn.cn/NewsDetail/e4bc9a4e58b741a9bfb0a0e942ed8f4c/MjAyNC0wNi0xNw==/1?nav=%5B%5D', 'https://www.study-hn.cn/NewsDetail/f6f67cd625de4c89807c2b4b304fd739/MjAyNC0wNi0xNw==/1?nav=%5B%5D'],'blocks':blocks,'walkways':paths}
p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');print('photo candidate body volumes',len(blocks),'paths',len(paths))
