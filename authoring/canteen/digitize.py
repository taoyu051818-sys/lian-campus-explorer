"""Preserve the OSM outline in metres; add photograph-informed facade and site elements."""
import json,math
from pathlib import Path
import numpy as np
HERE=Path(__file__).parent;ROOT=HERE.parents[1]
s=json.loads((ROOT/'public/reference-data/canteen-osm.json').read_text());ll=np.array(s['feature']['points'][:-1]);centre=ll.mean(axis=0)
xy=(ll-centre)*[111319.490793*math.cos(math.radians(centre[1])),-111319.490793]
u=xy[4]-xy[2];u/=np.linalg.norm(u);v=np.array([-u[1],u[0]]);origin=xy[2]
uv=np.c_[(xy-origin)@u,(xy-origin)@v];frame={'origin':origin.tolist(),'u':u.tolist(),'v':v.tolist()}
def pt(x,y):return [round(float(t),5) for t in origin+u*x+v*y]
def poly(points):return [pt(*p) for p in points]
def rect(r):
 x,y,X,Y=r;return poly([[x,y],[X,y],[X,Y],[x,Y]])
# Simplify nearly collinear OSM vertices without scaling the footprint.
outline=[[0,0],[70.63,0],[70.63,16.87],[65.39,16.88],[52.17,29.75],[52.16,35.67],[6.20,35.68],[6.20,45.71],[0,45.71]]
a=np.array(outline[3]);b=np.array(outline[4]);edge=(b-a)/np.linalg.norm(b-a);normal=np.array([edge[1],-edge[0]]);mid=(a+b)/2
side=lambda t,o:(a+edge*t+normal*o).tolist();sidepoly=lambda t0,t1,o0,o1:poly([side(t0,o0),side(t1,o0),side(t1,o1),side(t0,o1)])
platforms=[{'id':'front','outline':rect([25.5,35.2,34.5,40.2]),'local':[[25.5,35.2],[34.5,35.2],[34.5,40.2],[25.5,40.2]]},{'id':'side','outline':sidepoly(0,18.45,-.15,4.3),'local':[side(0,-.15),side(18.45,-.15),side(18.45,4.3),side(0,4.3)]}]
stairs=[{'name':'front entrance','a':[30,44.5],'b':[30,40.2],'width':5.6},{'name':'side entrance','a':side(9.2,8.5),'b':side(9.2,4.3),'width':10}]
for st in stairs:
 aa=np.array(st['a']);bb=np.array(st['b']);dd=(bb-aa)/np.linalg.norm(bb-aa);nn=np.array([-dd[1],dd[0]])*st['width']/2;st['outline']=poly([(aa-nn).tolist(),(bb-nn).tolist(),(bb+nn).tolist(),(aa+nn).tolist()])
seeds=[pt(x,y) for x,y in [(11,44),(19,44),(41,44),(48,40),(-8,7),(-8,20),(-8,34),(-5,53),(7,57),(18,57),(40,57),(49,55),(12,-10),(25,-10),(41,-10),(56,-10),(77,0),(84,8),(86,18),(85,29),(80,39)]]
roads=[]
# Real photo parking apron and narrow asphalt access strip; exact extents remain estimates.
courts=[rect([2,48,52,54]),sidepoly(-4,26,9,23)]
d={'schema':1,'source':'https://www.openstreetmap.org/way/1223487854','sourceCoordinates':s['feature']['points'],'centreLonLat':centre.tolist(),'projectedVertices':xy.tolist(),'outlineUV':outline,'originalUV':uv.tolist(),'frame':frame,'blocks':[{'id':'main','outline':poly(outline)}]+[{'id':x['id']+'-platform','outline':x['outline']} for x in platforms]+[{'id':x['name'],'outline':x['outline']} for x in stairs],'envelopes':[{'id':'main','outline':poly(outline)}],'platforms':platforms,'stairs':stairs,'sideFrame':{'a':a.tolist(),'b':b.tolist(),'normal':normal.tolist(),'tangent':edge.tolist(),'length':float(np.linalg.norm(b-a))},'landscapeSeeds':seeds,'roads':roads,'courtPaving':courts,'limits':['OSM geographic outline is a candidate footprint, not an as-built survey; simplified collinear vertices without rescaling','Two storeys and 11.2 m roof height estimated from photographs; plinth, stairs, facade modules and roof equipment dimensions approximate','Dark solar collector array observed with blue tank and pipes; exact technology and count unverified, not labelled photovoltaic','Front and angled white wing checked in scene 27335706; rear facade and unseen interior simplified','Tree species, count, planting positions and plaza dimensions inferred from photographs; campus anchor is schematic']}
(HERE/'digitization.json').write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');print(frame,uv.tolist())
