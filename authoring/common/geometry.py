"""Shared metre-scale Blender mesh helpers. Architecture axes: X/depth/elevation."""
import bpy,bmesh,math
from mathutils import Vector
from mathutils.geometry import tessellate_polygon

MATS={}
def mat(name, color, rough=.6, metal=0, family='paint'):
    m=bpy.data.materials.new(name); m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Roughness'].default_value=rough
    bs.inputs['Metallic'].default_value=metal
    m.diffuse_color=(*color,1); m['campusFamily']=family
    if family=='glass':
        bs.inputs['IOR'].default_value=1.5
        bs.inputs['Coat Weight'].default_value=.25
        bs.inputs['Coat Roughness'].default_value=.1
    MATS[name]=m
    return m

# Architecture coordinates are X / depth / elevation; convert once to Blender Z-up.
def xyz(p): return (p[0],-p[1],p[2])
class Part:
    def __init__(self,name,material,coll):
        self.name=name; self.material=material; self.coll=coll
        self.v=[]; self.f=[]; self.uv=[]
    def face(self,pts,uv=None):
        start=len(self.v); self.v.extend([xyz(p) for p in pts])
        # X/depth/elevation -> X/-Y/Z reverses handedness; reverse each face.
        self.f.append(tuple(reversed(range(start,start+len(pts)))))
        self.uv.append(list(reversed(uv or [(p[0]*.25,p[2]*.25+p[1]*.13) for p in pts])))
    def box(self,c,size):
        x,y,z=c; a,b,h=[v/2 for v in size]
        vs=[(x-a,y-b,z-h),(x+a,y-b,z-h),(x+a,y+b,z-h),(x-a,y+b,z-h),
            (x-a,y-b,z+h),(x+a,y-b,z+h),(x+a,y+b,z+h),(x-a,y+b,z+h)]
        for face in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:
            self.face([vs[i] for i in face])
    def beam(self,a,b,width,depth=None,closed=True):
        a=Vector(a); b=Vector(b); d=(b-a).normalized()
        ref=Vector((0,0,1)) if abs(d.z)<.95 else Vector((0,1,0))
        u=d.cross(ref).normalized()*width/2
        v=d.cross(u).normalized()*(depth or width)/2
        vs=[a-u-v,a+u-v,a+u+v,a-u+v,b-u-v,b+u-v,b+u+v,b-u+v]
        faces=[(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
        if closed:faces += [(0,3,2,1),(4,5,6,7)]
        for face in faces:
            self.face([vs[i] for i in face])
    def finish(self,parent):
        if not self.f:return None
        mesh=bpy.data.meshes.new(self.name);mesh.from_pydata(self.v,[],self.f);mesh.update()
        if self.material.endswith('distant baked screen'):
            uv=mesh.uv_layers.new(name='UVMap')
            for poly,coords in zip(mesh.polygons,self.uv):
                for loop,co in zip(poly.loop_indices,coords): uv.data[loop].uv=co
        if self.material.endswith(('ivory metal','silver shell','warm ceramic','champagne fins')):
            # Weld profile rings before smoothing; retain sharp slab corners and fin edges.
            bm=bmesh.new();bm.from_mesh(mesh)
            bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
            for f in bm.faces:f.smooth=True
            for e in bm.edges:e.smooth=len(e.link_faces)==2 and e.calc_face_angle(0)<math.radians(30)
            bm.to_mesh(mesh);bm.free();mesh.update()
        obj=bpy.data.objects.new(self.name,mesh);self.coll.objects.link(obj)
        obj.parent=parent;obj.data.materials.append(MATS[self.material]);obj['placeId']='library'
        return obj


def area(poly):return sum(p[0]*q[1]-q[0]*p[1] for p,q in zip(poly,poly[1:]+poly[:1]))/2

def outline(cx,cy,w,d,angle=0,n=96,tower=False):
    # Rounded asymmetric triangular petals, reconstructed from multiple exterior views.
    p=[(-.53,-.45),(.56,-.32),(.11,.59)] if not tower else [(-.54,-.43),(.55,-.36),(.08,.6)]
    for _ in range(5):
        q=[]
        for a,b in zip(p,p[1:]+p[:1]):
            q += [(a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25),(a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75)]
        p=q
    mn=[min(a[k] for a in p) for k in [0,1]]; mx=[max(a[k] for a in p) for k in [0,1]]
    p=[((a[0]-(mx[0]+mn[0])/2)/(mx[0]-mn[0])*w,(a[1]-(mx[1]+mn[1])/2)/(mx[1]-mn[1])*d) for a in p]
    lengths=[0]
    for a,b in zip(p,p[1:]+p[:1]):lengths.append(lengths[-1]+math.dist(a,b))
    result=[]; k=0; an=math.radians(angle)
    for j in range(n):
        s=lengths[-1]*j/n
        while lengths[k+1]<s:k+=1
        t=(s-lengths[k])/(lengths[k+1]-lengths[k]); a=p[k];b=p[(k+1)%len(p)]
        x=a[0]*(1-t)+b[0]*t;y=a[1]*(1-t)+b[1]*t
        result.append((cx+x*math.cos(an)-y*math.sin(an),cy+x*math.sin(an)+y*math.cos(an)))
    return result

def profile_curve(points, heights=None, n=160):
    # Interpolating closed Catmull-Rom curve follows the photo control points.
    # Resample by plan arc length so all LODs retain the same footprint and crest.
    heights=heights or [0]*len(points)
    source=[(*p,h) for p,h in zip(points,heights)]
    if area(points)<0:source.reverse()
    dense=[]
    for i,p1 in enumerate(source):
        p0=source[i-1];p2=source[(i+1)%len(source)];p3=source[(i+2)%len(source)]
        for j in range(16):
            t=j/16
            dense.append(tuple(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-e)*t*t+(-a+3*b-3*c+e)*t*t*t) for a,b,c,e in zip(p0,p1,p2,p3)))
    lengths=[0]
    for a,b in zip(dense,dense[1:]+dense[:1]):lengths.append(lengths[-1]+math.dist(a[:2],b[:2]))
    result=[];k=0
    for i in range(n):
        dist=lengths[-1]*i/n
        while lengths[k+1]<dist:k+=1
        t=(dist-lengths[k])/(lengths[k+1]-lengths[k]);a=dense[k];b=dense[(k+1)%len(dense)]
        result.append(tuple(a[q]*(1-t)+b[q]*t for q in range(3)))
    return [p[:2] for p in result],[p[2] for p in result]

def nearest_height(point,poly,heights):
    best=float('inf');height=0
    for i,a in enumerate(poly):
        j=(i+1)%len(poly);b=poly[j];dx=b[0]-a[0];dy=b[1]-a[1]
        t=max(0,min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy)))
        dist=(point[0]-a[0]-t*dx)**2+(point[1]-a[1]-t*dy)**2
        if dist<best:best=dist;height=heights[i]*(1-t)+heights[j]*t
    return height


def inset(poly,amount):
    # Parallel offset from adjacent edge normals, with a miter limited at acute tips.
    out=[]
    for i,p in enumerate(poly):
        a=Vector(poly[i-1]);b=Vector(p);c=Vector(poly[(i+1)%len(poly)])
        v=(b-a).normalized();w=(c-b).normalized()
        n1=Vector((-v.y,v.x));n2=Vector((-w.y,w.x)); n=(n1+n2).normalized()
        out.append(tuple(b+n*amount/max(.5,n.dot(n1))))
    return out

def strip(part,outer,inner,z0,z1):
    n=len(outer)
    for i in range(n):
        j=(i+1)%n;a=outer[i];b=outer[j];c=inner[j];d=inner[i]
        h0=z0(i) if callable(z0) else z0; h1=z1(i) if callable(z1) else z1
        k0=z0(j) if callable(z0) else z0; k1=z1(j) if callable(z1) else z1
        for pts in [[(*a,h0),(*b,k0),(*b,k1),(*a,h1)],
                    [(*d,h1),(*c,k1),(*c,k0),(*d,h0)],
                    [(*a,h1),(*b,k1),(*c,k1),(*d,h1)],
                    [(*d,h0),(*c,k0),(*b,k0),(*a,h0)]]:part.face(pts)

def band(part,poly,z,thickness=.3,projection=.3):
    # Four profile rings form a real small chamfer on the top/bottom outer edges.
    rings=[(inset(poly,-projection+.035),z),(inset(poly,-projection),z+.035),
           (inset(poly,-projection),z+thickness-.035),(inset(poly,-projection+.035),z+thickness)]
    for (p,h),(q,k) in zip(rings,rings[1:]):
        for i in range(len(poly)):
            j=(i+1)%len(poly);part.face([(*p[i],h),(*p[j],h),(*q[j],k),(*q[i],k)])
    strip(part,rings[0][0],inset(poly,.6),z,z+.015)
    strip(part,rings[-1][0],inset(poly,.6),z+thickness-.015,z+thickness)

def cap(part,poly,z):
    vectors=[Vector((x,y,z)) for x,y in poly]
    for tri in tessellate_polygon([vectors]):part.face([vectors[i] if isinstance(i,int) else i for i in tri])

def wall(part,poly,z0,z1,tile=3.0):
    arclen=0
    for a,b in zip(poly,poly[1:]+poly[:1]):
        length=math.dist(a,b)
        part.face([(*a,z0),(*b,z0),(*b,z1),(*a,z1)],[(arclen/tile,0),((arclen+length)/tile,0),((arclen+length)/tile,(z1-z0)/3.4),(arclen/tile,(z1-z0)/3.4)])
        arclen+=length
