import numpy as np,json
from pathlib import Path
# Digitized red-line points on the actual-built panel, PDF page 4, image 1601x1126.
px=np.array([[545,983,1],[292,494,1],[332,384,1],[864,108,1],[1285,887,1],[1342,865,1]],float)
en=np.array([[395000.941,2034820.139],[394947.112,2034929.487],[394954.105,2034952.644],[395071.906,2035014.389],[395164.709,2034834.606],[395175.240,2034846.391]])
fit=np.linalg.lstsq(px,en,rcond=None)[0];err=np.linalg.norm(px@fit-en,axis=1);print('BUPT residual',err.tolist())
centre=en.mean(axis=0)
def conv(points):return [[round(v,3) for v in np.array([*p,1])@fit-centre] for p in points]
blocks=[('学院楼一 · 五层合院',5,[[354,493],[434,453],[464,509],[454,524],[541,682],[711,600],[698,575],[741,552],[795,658],[511,783],[476,719],[507,702],[429,547],[388,566]]),('学院楼二 · 北翼',6,[[702,315],[781,273],[813,332],[740,381]]),('学院楼二 · 东翼',6,[[798,263],[865,231],[966,425],[944,437],[1020,516],[944,553],[811,309]])]
data={'bupt':{'source':'https://wap.study-hn.cn/upload/file/2025/08/04/502f538dc40e40ea9b18acc0508914af.pdf','page':4,'method':'Manual trace of actual-built image; affine fit to six red-line coordinates; heights estimated 3.9m/storey. Smaller low-rise links omitted.','residualMaxMetres':float(max(err)),'controlPixels':px[:,:2].tolist(),'controlEN':en.tolist(),'imageSize':[1601,1126],'blocks':[{'name':n,'floors':f,'height':f*3.9,'footprint':conv(p)}for n,f,p in blocks]}}
# CUC: schematic digitization in the rendered plan coordinate frame, scaled by its 50m bar.
# Placement remains an approximate fit to the existing parcel map.
cp=[686,643];scale=50/159
cuc=[('学院楼一',5,[[325,680],[395,626],[420,654],[371,693],[400,733],[443,786],[489,753],[522,795],[456,847],[422,855],[370,793],[334,743],[305,700]]),('学院楼二',6,[[445,577],[482,548],[585,612],[615,573],[635,535],[623,476],[613,437],[670,415],[681,459],[689,500],[710,567],[729,612],[644,669],[585,707]]),('学院楼三',5,[[714,388],[773,343],[827,399],[853,439],[884,479],[906,528],[930,580],[869,608],[850,552],[829,496],[797,459],[763,411]]),('学院楼四',6,[[760,822],[805,786],[848,760],[892,730],[917,678],[1026,669],[1051,783],[928,859],[833,928]])]
data['cuc']={'source':'https://wap.study-hn.cn/upload/file/2025/08/04/21b98b42b54d42ad9621d3f424b945ec.pdf','page':1,'method':'Manual simplified roof-outline trace from planning total plan, 1888x1335 review frame. Approximate scale from 50m bar; planning geometry, not as-built. Heights estimated 3.9m/storey pending per-wing verification.','blocks':[{'name':n,'floors':f,'height':f*3.9,'footprint':[[round((x-cp[0])*scale,3),round((cp[1]-y)*scale,3)] for x,y in p]}for n,f,p in cuc]}
Path('outputs/campus-explorer/public/refined-plans.json').write_text(json.dumps(data,ensure_ascii=False,indent=2))
