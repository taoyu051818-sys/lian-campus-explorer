"""Dissolve overlapping apron/path polygons before triangulation; preserve basin holes."""
import json,sys,math
from shapely import Polygon,union_all,box
source=json.load(sys.stdin)
merged=union_all([Polygon(fp).buffer(0) for fp in source['polygons']],grid_size=.0001)
# Close thin triangular slivers between the curved apron and approach paths.
merged=merged.buffer(2.5,quad_segs=8).buffer(-2.5,quad_segs=8)
merged=merged.difference(Polygon(source['pond'])).buffer(0)
polys=[]
# Short triangles follow the sampled campus terrain instead of bridging hills.
# Clip the dissolved surface to a shared 2 m grid so neighbouring tiles agree.
x0,z0,x1,z1=merged.bounds
for x in range(math.floor(x0/2)*2,math.ceil(x1/2)*2,2):
    for z in range(math.floor(z0/2)*2,math.ceil(z1/2)*2,2):
        tile=merged.intersection(box(x,z,x+2,z+2))
        if tile.is_empty:continue
        polys.extend([tile] if tile.geom_type=='Polygon' else list(tile.geoms) if hasattr(tile,'geoms') else [])
json.dump([{'shell':list(p.exterior.coords)[:-1],'holes':[list(r.coords)[:-1] for r in p.interiors]} for p in polys if p.geom_type=='Polygon' and p.area>.001],sys.stdout)
