"""Reproduce the BUPT site transform and measured rectangular wing layout."""
import json,math
from pathlib import Path
import numpy as np
HERE=Path(__file__).parent
px=np.array([[547.5,978],[306,489.5],[336.5,387],[864,109],[1279.75,886.75],[1326.75,861.5]])
en=np.array([[395000.941,2034820.139],[394947.112,2034929.487],[394954.105,2034952.644],[395071.906,2035014.389],[395164.709,2034840.606],[395175.240,2034846.391]])
fit=np.linalg.lstsq(np.c_[px,np.ones(6)],en,rcond=None)[0];centre=np.array([690,520,1])@fit
point=lambda p:((np.array([*p,1])@fit-centre)*[1,-1]).tolist()
u=np.array([.884,-.467]);u/=np.linalg.norm(u);v=np.array([-u[1],u[0]])
frames={k:{'originPixel':p,'origin':point(p),'u':a.tolist(),'v':b.tolist()} for k,p,a,b in [('A',[354,493],u,v),('B',[865,231],v,-u)]}
def p(g,x,y):
 f=frames[g];return [round(f['origin'][i]+f['u'][i]*x+f['v'][i]*y,5) for i in [0,1]]
def poly(g,r):
 x,y,X,Y=r;return [p(g,x,y),p(g,X,y),p(g,X,Y),p(g,x,Y)]
blocks=[]
def block(id,rect,floors,style,start=0):blocks.append(dict(id=id,rect=rect,outline=poly(id[0],rect),floors=floors,style=style,startFloor=start,cornerCut=0))
block('A_west',[0,8.1,16.6,49],5,'white')
block('A_south',[23.3,56.4,56.4,73],5,'white')
block('A_southwest',[0,56.4,16.6,73],5,'red-louvres')
block('A_north',[23.3,0,40,16.6],5,'gray-louvres')
block('A_east',[56.4,33,73,49.6],5,'red-louvres')
# The fifth-floor plan extends over the recessed northwest terrace.
block('A_northwest_top',[0,0,16.6,8.1],5,'white',4)
block('B_back',[5.5,0,49,16.6],6,'white')
block('B_north',[0,23.3,16.6,40],6,'red-louvres')
block('B_south',[55.6,0,72.8,16.6],6,'gray-louvres')
block('B_four_storey',[0,0,5.5,16.6],4,'white')
links=[]
for name,r,levels in [('A_northlink',[16.6,8.1,23.3,16.6],range(1,5)),('A_westlink',[8.1,49,16.6,56.4],range(1,5)),('A_southlink',[16.6,56.4,23.3,73],range(1,5)),('A_eastlink',[56.4,49.6,73,56.4],range(1,5)),('B_northlink',[8.1,16.6,16.6,23.3],range(1,6)),('B_southlink',[49,0,55.6,16.6],range(1,6))]:
 links.append({'name':name,'rect':r,'outline':poly(name[0],r),'levels':list(levels)})
terraces=[]
for id,r,height in [('A_rear',[16.6,16.6,40,33],3.9),('A_southwest_garden',[16.6,33,38,56.4],3.9),('A_southeast_garden',[42,33,56.4,56.4],3.9),('A_eastwalk',[38,38,42,56.4],3.9),('B_upper',[16.6,16.6,31,40],6.5),('B_middle',[31,16.6,45.5,40],5.2),('B_lower',[45.5,16.6,58.5,40],3.9)]:
 terraces.append({'id':id,'rect':r,'outline':poly(id[0],r),'height':height})
# Small stair flights and landings are photograph-informed, not survey elevations.
stairs=[{'name':'A court access','group':'A','a':[49,19],'b':[49,32.5],'width':3.2,'h0':0,'h1':3.9},
{'name':'B upper terrace','group':'B','a':[36,28],'b':[31,28],'width':3.2,'h0':5.2,'h1':6.5},
{'name':'B middle terrace','group':'B','a':[50.5,28],'b':[45.5,28],'width':3.2,'h0':3.9,'h1':5.2}]
# Three small approach terraces lead from the plaza to the lowest main garden.
for j in range(3):
 hi=3.9-j*1.3;x=58.5+j*5.2
 terraces.append({'id':f'B_approach_{j}','rect':[x,16.6,x+5.2,40],'outline':poly('B',[x,16.6,x+5.2,40]),'height':hi-1.3})
 stairs.append({'name':f'B entry flight {j+1}','group':'B','a':[x+4.6,28],'b':[x,28],'width':3.2,'h0':hi-1.3,'h1':hi})
# The full ground envelope includes podiums and open wing connectors.
envelopes=[{'id':'A','outline':poly('A',[-.5,-.5,73.5,73.5])},{'id':'B','outline':poly('B',[-.5,-.5,75,40.5])}]
seeds=[p('A',x,y) for x,y in [(-8,3),(-8,20),(-8,38),(-8,62),(0,84),(15,86),(31,84),(47,85),(64,85),(81,68),(82,51),(44,-10),(22,-11),(0,-10),(80,28),(64,21)]]
seeds +=[p('B',x,y) for x,y in [(-10,8),(-10,26),(6,-9),(25,-9),(44,-9),(62,-9),(84,9),(87,31),(10,49),(30,49),(47,50),(63,50)]]
roads=[poly('A',[-12,-14,88,91]),poly('B',[-14,-14,91,55])]
roads=[ps+[ps[0]] for ps in roads]
d={'schema':1,'source':'https://wap.study-hn.cn/upload/file/2025/08/04/502f538dc40e40ea9b18acc0508914af.pdf','imageSize':[1601,1126],'controlNames':['J3','J4','J5','J6','J1','J7'],'controlPixels':px.tolist(),'controlEN':en.tolist(),'pixelToEN':fit.tolist(),'centreEN':centre.tolist(),'maxControlResidualMetres':float(np.linalg.norm(np.c_[px,np.ones(6)]@fit-en,axis=1).max()),'frames':frames,'blocks':blocks,'connectors':links,'terraces':terraces,'stairs':stairs,'envelopes':envelopes,'landscapeSeeds':seeds,'roads':roads,'courtPaving':[poly('A',[40,16.6,56.4,33]),poly('A',[16.6,-5,56.4,16.6])],'courtyards':[p('A',48,24),p('A',40,35.4),p('B',42,30)],'evidenceImages':[4,8,10,12,14,16,18,22,24,28,32,34,38,39,40],'limits':['Manual digitization, floor-plan rectangular decomposition and photo-informed details are not survey geometry','Main storey height 3.9 m, terrace elevations and stair dimensions estimated from photographs','Vegetation types and planting positions are photo-informed estimates','Basement rooms and full interiors excluded; sunken court represented relative to raised gardens','BUPT source page 26 says college1 but lies in the college2 plan sequence']}
(HERE/'digitization.json').write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
print(d['maxControlResidualMetres'],frames)
