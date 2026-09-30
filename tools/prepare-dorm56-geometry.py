"""Resolve touching stepped plan rectangles into exterior floor outlines (Shapely2)."""
import json
from pathlib import Path
from shapely.geometry import Polygon,box
from shapely.geometry.polygon import orient
from shapely.ops import unary_union,triangulate
ROOT=Path(__file__).resolve().parents[1];p=ROOT/'authoring/dorm56/design.json';d=json.loads(p.read_text())
def polys(g):
 if g.is_empty:return []
 return [g] if g.geom_type=='Polygon' else [p for c in g.geoms for p in polys(c)]
def pack(g):
 out=[]
 for raw in polys(g):
  if raw.area<.01:continue
  poly=orient(raw.simplify(.00001),sign=1)
  out.append({'outline':list(poly.exterior.coords)[:-1],'holes':[list(x.coords)[:-1] for x in poly.interiors],'triangles':[list(t.exterior.coords)[:3] for t in triangulate(poly) if poly.covers(t.representative_point())]})
 return out
groups=[]
for n in range(1,12):
 bs=[b for b in d['blocks'] if b['number']==n];highest=max(b['floors'] for b in bs);levels=[]
 for f in range(highest+1):
  footprint=unary_union([Polygon(b['footprint']) for b in bs if b['floors']>=max(1,f)])
  above=unary_union([Polygon(b['footprint']) for b in bs if b['floors']>f])
  lo=d['groundFloor']+(0 if f==0 else d['firstFloorHeight']+(f-1)*d['floorHeight'])
  hi=lo+(d['firstFloorHeight'] if f==0 else d['floorHeight'])
  occupied=above.buffer(-1.15,join_style='mitre')
  if f==0:
   # Ground-level cores leave a colonnade and one cross-passage in each numbered building.
   occupied=above.buffer(-2.2,join_style='mitre');mnx,mnz,mxx,mxz=above.bounds;cx=(mnx+mxx)/2;cz=(mnz+mxz)/2
   opening=box(cx-2.1,mnz-1,cx+2.1,mxz+1) if mxx-mnx>mxz-mnz else box(mnx-1,cz-2.1,mxx+1,cz+2.1)
   occupied=occupied.difference(opening)
  terraces=footprint.difference(above.buffer(.2,join_style='mitre')).buffer(-.6,join_style='mitre')
  levels.append({'floor':f,'base':lo,'top':hi,'slab':pack(footprint),'rooms':pack(occupied),'facade':pack(above),'terraces':pack(terraces)})
 groups.append({'number':n,'floors':highest,'levels':levels})
d['buildings']=groups;p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');print('resolved11buildings',sum(len(x['levels']) for x in groups),'floor outlines')
