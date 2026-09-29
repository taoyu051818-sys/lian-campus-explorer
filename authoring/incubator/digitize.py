"""Metre-scale reconstruction from the 2025 completion survey; heights remain estimates."""
import json,math
from pathlib import Path
import numpy as np
HERE=Path(__file__).parent
px=np.array([[280,590],[372,719],[445,731],[1056,285],[1097,251],[961,94]])
en=np.array([[395573.192,2034921.551],[395599.579,2034882.970],[395621.898,2034878.850],[395803.134,2035012.108],[395815.261,2035021.613],[395775.150,2035068.188]])
fit=np.linalg.lstsq(np.c_[px,np.ones(6)],en,rcond=None)[0]
raw=np.array([[434,512],[811,235],[880,331],[504,607]])
pts=np.c_[raw,np.ones(4)]@fit;centre=pts.mean(axis=0);local=(pts-centre)*[1,-1]
u=local[1]-local[0];L=float(np.linalg.norm(u));u/=L;v=np.array([-u[1],u[0]])
W=float(np.dot(local[3]-local[0],v));origin=local[0]
frame={'origin':origin.tolist(),'u':u.tolist(),'v':v.tolist(),'length':L,'depth':W}
def point(x,y):return [round(float(t),5) for t in origin+u*x+v*y]
def outline(r):
 x,y,X,Y=r;return [point(x,y),point(X,y),point(X,Y),point(x,Y)]
# Pixel outlines are manually traced from the black as-built room edges. Courtyards are voids.
# Each drawing has a separately normalized left/right extent; this is not a CAD survey.
traces=[
 {'level':1,'image':8,'bounds':[69,374,1057,619], 'polygons':[[[107,374],[454,374],[454,619],[107,619]],[[583,377],[1057,377],[1057,619],[583,619]]], 'holes':[[[224,486],[338,486],[338,597],[282,597],[282,535],[224,535]]]},
 {'level':2,'image':10,'bounds':[77,368,1080,616], 'polygons':[[[77,368],[355,368],[355,419],[402,419],[402,368],[756,368],[756,419],[803,419],[803,368],[1080,368],[1080,616],[681,616],[681,542],[581,542],[581,586],[524,586],[524,616],[402,616],[402,570],[77,570]]], 'holes':[[[866,481],[977,481],[977,521],[901,521],[901,596],[866,596]]]},
 {'level':3,'image':12,'bounds':[75,350,1074,592], 'polygons':[[[110,401],[350,401],[350,422],[455,422],[455,401],[694,401],[694,422],[800,422],[800,401],[1039,401],[1039,592],[742,592],[742,542],[694,542],[694,592],[455,592],[455,542],[415,542],[415,592],[110,592]]], 'holes':[]},
 {'level':4,'image':14,'bounds':[79,351,1080,577], 'polygons':[[[79,351],[355,351],[355,383],[403,383],[403,351],[756,351],[756,383],[803,383],[803,351],[1080,351],[1080,577],[79,577]]], 'holes':[]},
 {'level':5,'image':16,'bounds':[50,360,1044,597], 'polygons':[[[256,407],[1009,407],[1009,597],[714,597],[714,582],[666,582],[666,597],[256,597]]], 'holes':[]}
]
levels=[]
for tr in traces:
 x,y,X,Y=tr['bounds'];conv=lambda p:[round((p[0]-x)/(X-x)*L,4),round((p[1]-y)/(Y-y)*W,4)]
 levels.append({'level':tr['level'],'image':tr['image'],'polygons':[[conv(p) for p in poly] for poly in tr['polygons']],'holes':[[conv(p) for p in poly] for poly in tr['holes']]})
# The lower west stilt portion is a separate photo-informed level, partly basement in the survey.
stilt=[{'rect':[87,0,L,W],'style':'dark'},{'rect':[11,21,24,W],'style':'dark'},{'rect':[65,24,76,W],'style':'dark'}]
seeds=[point(x,y) for x in range(5,139,11) for y in [-10,W+10]]+[point(x,y) for x in [-12,L+12] for y in range(1,36,9)]
d={'schema':1,'source':'https://wap.study-hn.cn/upload/file/2025/09/23/1758593138960022228.docx','controlPixels':px.tolist(),'controlEN':en.tolist(),'pixelToEN':fit.tolist(),'centreEN':centre.tolist(),'maxControlResidualMetres':float(np.linalg.norm(np.c_[px,np.ones(6)]@fit-en,axis=1).max()),'frame':frame,'sourceTraces':traces,'levels':levels,'stiltRooms':stilt,'blocks':[{'id':'envelope','outline':outline([0,0,L,W])}],'envelopes':[{'id':'envelope','outline':outline([0,0,L,W])}],'landscapeSeeds':seeds,'roads':[],'courtPaving':[outline([-20,-2,-3,W+2]),outline([L+3,-2,L+20,W+2])],'evidenceImages':[2,6,8,10,12,14,16,18,20],'limits':['Floor outlines manually traced and normalized from raster survey drawings; not CAD or construction dimensions','Five above-ground floors confirmed; partly open lower stilt/basement level approximated at 2.8 m; upper storeys estimated at 4.2 m','Bronze appearance is observed in photograph; actual cladding specification and reflectance unverified','Window divisions, roof framework, setbacks, plants and light positions estimated from built photograph','Basement and full interiors excluded; rooftop garden not advertised as an accessible route']}
d['blocks'] += [{'id':'west-pergola','outline':outline([-17,4,-9,12])},{'id':'east-pergola','outline':outline([L+6,4,L+14,12])}]
(HERE/'digitization.json').write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
print('INCUBATOR',frame,'residual',d['maxControlResidualMetres'])
