from pathlib import Path
import math,json
root=Path('outputs/campus-explorer');file=root/'public/refined-plans.json';plans=json.loads(file.read_text());df=root/'public/overall/data.json';data=json.loads(df.read_text());place=next(p for p in data['places'] if p['id']=='hospital')
# Report p6: X is northing, Y is easting. Keep metre dimensions, translate only into atlas.
xy=[[2036348.931,396749.319],[2036385.543,396768.775],[2036317.061,396897.915],[2036298.427,396888.660],[2036292.548,396854.436]]
pts=[[y,x] for x,y in xy];origin=[sum(p[i] for p in pts)/5 for i in range(2)]
boundary=[[round(p[i]-origin[i],3) for i in range(2)] for p in pts]
area=abs(sum(p[0]*boundary[(i+1)%5][1]-boundary[(i+1)%5][0]*p[1] for i,p in enumerate(boundary)))/2
# Estimate the building's long axis from the J2-J3 parcel edge. No building dimension drawing exists.
a=math.atan2(xy[2][0]-xy[1][0],xy[2][1]-xy[1][1]);co=math.cos(a);si=math.sin(a)
def rot(x,z):return [round(x*co-z*si,4),round(x*si+z*co,4)]
def rect(x,z,w,d):return [rot(x-w/2,z-d/2),rot(x+w/2,z-d/2),rot(x+w/2,z+d/2),rot(x-w/2,z+d/2)]
blocks=[]
for name,x,z,w,d,h,f,k in [('医院主楼',18,4,56,14,21.2,5,'hospital-main'),('临街低区与屋顶花园',18,-6,56,6,4.2,1,'hospital-garden'),('入口附楼',-14,1,8,20,8.4,2,'hospital-entry'),('西侧前排配套房',-35,-5.5,9,9,4.8,1,'hospital-annex'),('西侧后排配套房',-35,8.5,9,9,4.8,1,'hospital-annex')]:blocks.append(dict(name=name,footprint=rect(x,z,w,d),height=h,floors=f,kind=k))
plans['hospital']={'source':'https://wap.study-hn.cn/upload/file/2025/08/04/dd3bdbb92da74593aaaf2793b5b6ef5a.pdf','traced':False,'method':'2025.06 A21/A22技术修正报告第3页明确A-22为已建校医院，第6页界址坐标用于地块形状；全园只做锚点平移，未经投影坐标配准。建筑参考2023单页效果图，主楼、临街低区、入口附楼及两座配套房均为估算轮廓，5层/21.2米主楼为外观估算，不将45米控规限高当楼高。','boundarySource':'https://wap.study-hn.cn/upload/file/2025/08/04/e218efef9ee8476cabd0814284e051d9.pdf','boundary':boundary,'boundarySurvey':{'pointsXY':xy,'localOriginEN':origin,'computedArea':area,'documentArea':5836,'globalRegistration':'translated to existing atlas anchor; CRS not registered'},'blocks':blocks}
place['name']='校区医院';place['status']='地块界址核对 · 外形参考';place['note']='2025技术修正报告明确A-22为已建校医院，A-21为北侧未建教育/科研用地。地块按5个界址点恢复形状，面积约5836平方米；全园位置仍为锚点配准。建筑外形参考2023效果图，楼高及层数估算。';place['source']=plans['hospital']['boundarySource'];place['polygon']=[[round(place['point'][0]+p[0]*.19,5),round(place['point'][1]-p[1]*.19,5)] for p in boundary]
file.write_text(json.dumps(plans,ensure_ascii=False,indent=2)+'\n');df.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print('Survey boundary area',area,'edge lengths',[round(math.dist(p,boundary[(i+1)%5]),3) for i,p in enumerate(boundary)])
print('angle',a,'boundary in building frame',[[round(x*co+z*si,1),round(-x*si+z*co,1)] for x,z in boundary])
