"""Blender 4.5 LTS library asset authoring. All geometry is original and editable.
Run: blender -b --factory-startup --python authoring/library/build.py
No reference photograph is embedded in the distributable assets.
"""
import bpy, json, math, random, sys, os
from pathlib import Path
from mathutils import Vector
from mathutils.geometry import tessellate_polygon

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/models/library'
OUT.mkdir(parents=True,exist_ok=True)
DESIGN = json.loads((Path(__file__).parent / 'design.json').read_text())
BLEND = ROOT / 'authoring/library/library.blend'
random.seed(8819)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
    if c.name != 'Collection': bpy.data.collections.remove(c)
scene=bpy.context.scene
scene.unit_settings.system='METRIC'; scene.unit_settings.scale_length=1
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
mat('Library / pearl aluminium',(.82,.84,.81),.35,.08,'metal')
mat('Library / warm ceramic',(.80,.79,.74),.62,0,'ceramic')
mat('Library / white concrete',(.7,.71,.68),.8,0,'concrete')
mat('Library / frame shadow',(.043,.062,.069),.4,.55,'metal')
mat('Library / blue grey glass',(.11,.23,.3),.15,0,'glass')
mat('Library / blue grey glass light',(.12,.24,.31),.18,0,'glass')
mat('Library / blue grey glass dark',(.10,.21,.28),.2,0,'glass')
mat('Library / warm limestone',(.53,.51,.45),.84,0,'stone')
mat('Library / roof gravel',(.21,.24,.23),.96,0,'stone')
mat('Library / planted roof',(.12,.19,.072),.96,0,'foliage')
mat('Library / bronze lettering',(.34,.23,.09),.3,.8,'metal')
mat('Library / interior recess',(.016,.025,.031),.92,0,'paint')

# Bake a repeatable screen colour tile for the far LOD. Near/mid screens are geometry.
size=256
img=bpy.data.images.new('Li geometric screen - distant baked tile',width=size,height=size,alpha=False)
pixels=[]
for j in range(size):
    for i in range(size):
        u=(i+.5)/size-.5; v=(j+.5)/size-.5
        d=abs(u)+abs(v)
        corner=abs(abs(u)-.5)+abs(abs(v)-.5)
        line=min(abs(d-.46),abs(d-.30),abs(d-.14)) < .021 or min(abs(corner-.46),abs(corner-.24)) < .017
        c=(.82,.83,.8) if line else (.07,.17,.22)
        pixels.extend((*c,1))
img.pixels.foreach_set(pixels)
img.filepath_raw=str(OUT/'screen-baked.png'); img.file_format='PNG'; img.save(); img.pack()
m=mat('Library / distant baked screen',(.8,.8,.8),.5,.15,'metal')
t=m.node_tree.nodes.new('ShaderNodeTexImage'); t.image=img; t.extension='REPEAT'
m.node_tree.links.new(t.outputs['Color'],m.node_tree.nodes['Principled BSDF'].inputs['Base Color'])

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

MANIFEST={'schema':1,'asset':'library','authoring':'Blender 4.5 LTS','anchor':DESIGN['campusAnchor'],'yaw':DESIGN['campusYaw'],'lods':[],'collisionVolumes':[]}
ROOTS=[]
for lod in range(3):
    coll=bpy.data.collections.new(f'Library LOD{lod}');scene.collection.children.link(coll)
    parent=bpy.data.objects.new(f'Library_LOD{lod}',None);coll.objects.link(parent);ROOTS.append(parent)
    buckets={}
    def part(section,material):
        key=(section,material)
        if key not in buckets:buckets[key]=Part(f'{section} | {material.split(" / ")[-1]}',material,coll)
        return buckets[key]
    def pmat(section,key):return part(section,'Library / '+key)
    res=[96,48,20][lod]
    tower=DESIGN['tower']; tx,ty=tower['center']
    tp=outline(tx,ty,tower['width'],tower['depth'],tower['angle'],res,True)
    frame=pmat('Tower','pearl aluminium'); shadow=pmat('Tower','frame shadow')
    glasses=[pmat('Tower',n) for n in ['blue grey glass','blue grey glass light','blue grey glass dark']]
    fh=DESIGN['floorHeight']; top=tower['height']-4.2
    # Nineteen readable floors, including the sloping lantern crown at floor nineteen.
    for floor in range(18):
        lo=floor*fh; hi=lo+fh
        for i,(a,b) in enumerate(zip(tp,tp[1:]+tp[:1])):
            glass=glasses[(i*17+floor*7)%13//5]
            glass.face([(*a,lo+.18),(*b,lo+.18),(*b,hi-.18),(*a,hi-.18)])
            if lod<2:
                frame.beam((*a,lo+.08),(*a,hi-.06),.075,.13)
        band(frame,tp,lo,.22,.24)
        for h in ([.92,2.92,3.43] if lod==0 else [1.05,3.35] if lod==1 else [3.2]):
            band(frame,tp,lo+h,.075 if h!=3.43 else .12,.3)
        # Recessed opening lights interrupt the otherwise continuous curtain wall.
        if lod==0:
            for i in range((floor*3)%7,len(tp),9):
                a=tp[i];b=tp[(i+1)%len(tp)]
                shadow.beam((*a,lo+2.4),(*b,lo+2.4),.09,.11)
    def tower_top(i):
        x,y=tp[i]; return 79.4+4.2*(.5+.5*math.cos(math.atan2(y-ty,x-tx)-.7))
    for i,(a,b) in enumerate(zip(tp,tp[1:]+tp[:1])):
        j=(i+1)%len(tp)
        glasses[1].face([(*a,79.2),(*b,79.2),(*b,tower_top(j)),(*a,tower_top(i))])
        frame.beam((*a,79.2),(*a,tower_top(i)),.09,.12)
    strip(frame,inset(tp,-.23),inset(tp,.08),tower_top,lambda i:tower_top(i)+.13)
    cap(pmat('Tower roof','roof gravel'),inset(tp,.4),79.35)
    roof=pmat('Tower roof','white concrete')
    for x,y,w,d,h in [(-4,24,12,10,3.1),(7,24,5,8,2),(-4,34,6,3,1.6)]:roof.box((x,y,79.4+h/2),(w,d,h))
    if lod==0:
        MANIFEST['collisionVolumes'].append({'name':'library tower','footprint':outline(tx,ty,tower['width'],tower['depth'],tower['angle'],48,True),'height':83.8,'base':0})
    for k,petal in enumerate(DESIGN['petals']):
        sec='Petal '+petal['name']; cx,cy=petal['center']; floors=petal['floors']; floorH=5.0
        shape=outline(cx,cy,petal['width'],petal['depth'],petal['angle'],res)
        white=pmat(sec,'warm ceramic'); aluminium=pmat(sec,'pearl aluminium'); rails=pmat(sec,'frame shadow')
        glass=pmat(sec,'blue grey glass'); grid=pmat(sec,'distant baked screen')
        for floor in range(floors):
            poly=inset(shape,floor*.68)
            y0=floor*floorH; y1=y0+floorH
            wall(glass,inset(poly,.62),y0+.28,y1-.3)
            band(white,poly,y0,.56,.35)
            band(aluminium,poly,y0+.57,.08,.38)
            # A 60 cm cavity separates the glass from the external lattice screen.
            if lod<2:
                for i in range(0,len(poly),2 if lod==0 else 4):
                    a=inset(poly,.56)[i];aluminium.beam((*a,y0+.5),(*a,y1-.3),.065,.095)
            lengths=[0]
            for a,b in zip(poly,poly[1:]+poly[:1]):lengths.append(lengths[-1]+math.dist(a,b))
            bays=max(8,round(lengths[-1]/2.1)); bay=lengths[-1]/bays
            def perimeter(s):
                s%=lengths[-1]; ix=next((q for q in range(len(poly)) if lengths[q+1]>=s),len(poly)-1)
                t=(s-lengths[ix])/(lengths[ix+1]-lengths[ix]);a=poly[ix];b=poly[(ix+1)%len(poly)]
                return (a[0]*(1-t)+b[0]*t,a[1]*(1-t)+b[1]*t)
            for j in range(bays):
                # Leave deliberate clear horizontal glazing openings, as in completed photos.
                clear = floor>0 and (j+9*k+floor*11)%bays < max(4,bays//7)
                s=(j+.5)*bay
                pt=perimeter(s)
                entrance = k==4 and floor==0 and pt[1] < min(p[1] for p in poly)+2.5
                if clear or entrance:continue
                if lod==2:
                    a=perimeter(j*bay); b=perimeter((j+1)*bay)
                    grid.face([(*a,y0+.72),(*b,y0+.72),(*b,y1-.3),(*a,y1-.3)],[(0,0),(1,0),(1,2),(0,2)])
                    continue
                # Two rows of interlocking stepped diamonds. The open inner corners
                # echo the woven Li motif; dimensions are reconstructed, not surveyed.
                for row in range(2):
                    z=y0+1.7+row*1.98
                    for ring,factor in enumerate([1,.70,.39] if lod==0 else [1,.55]):
                        w=bay*.5*factor; h=.99*factor
                        coords=[(s-w,z),(s,z+h),(s+w,z),(s,z-h)]
                        for edge,(a,b) in enumerate(zip(coords,coords[1:]+coords[:1])):
                            if ring==1 and edge==(j+row)%4: continue
                            pa=perimeter(a[0]);pb=perimeter(b[0]);aluminium.beam((*pa,a[1]),(*pb,b[1]),.085,.12,False)
                # Bridge the empty corners of neighbouring modules into a woven field.
                for factor in ([1,.52] if lod==0 else [.8]):
                    mid=s+bay*.5; z=y0+2.69
                    coords=[(mid-bay*.5*factor,z),(mid,z+.99*factor),(mid+bay*.5*factor,z),(mid,z-.99*factor)]
                    for a,b in zip(coords,coords[1:]+coords[:1]):
                        pa=perimeter(a[0]);pb=perimeter(b[0]);aluminium.beam((*pa,a[1]),(*pb,b[1]),.075,.12,False)
                if lod==0 and j%2==0:
                    pt=perimeter(j*bay); rails.beam((*pt,y0+.65),(*pt,y1-.3),.045,.085)
        roofY=floors*floorH
        roofpoly=inset(shape,(floors-1)*.68)
        band(white,roofpoly,roofY,.48,.36)
        roofdeck=inset(roofpoly,.48)
        cap(pmat(sec+' roof','roof gravel'),roofdeck,roofY+.05)
        # A translucent, rising parapet reads as a petal lip, rather than a solid dome.
        crest=math.radians(petal['crest'])
        def lip(i):
            x,y=roofpoly[i]; t=.5+.5*math.cos(math.atan2(y-cy,x-cx)-crest)
            return roofY+1.15+petal['crown']*t*t
        strip(aluminium,inset(roofpoly,-.06),inset(roofpoly,.06),lip,lambda i:lip(i)+.11)
        for i,(a,b) in enumerate(zip(roofpoly,roofpoly[1:]+roofpoly[:1])):
            j=(i+1)%len(roofpoly);h=min(lip(i),lip(j))-roofY-.42
            if lod<2:
                aluminium.beam((*a,roofY+.4),(*a,lip(i)),.075,.11)
                # Roof-lip diamonds are clipped to each locally varying height.
                count=max(1,int(h/1.8))
                for row in range(count):
                    z=roofY+.55+(row+.5)*h/count
                    mid=((a[0]+b[0])/2,(a[1]+b[1])/2)
                    left=(*a,z); right=(*b,z)
                    high=(*mid,z+h/count*.43); low=(*mid,z-h/count*.43)
                    for p,q in [(left,high),(high,right),(right,low),(low,left)]:aluminium.beam(p,q,.065,.1)
            else:
                grid.face([(*a,roofY+.4),(*b,roofY+.4),(*b,lip(j)),(*a,lip(i))],[(i*.5,0),(j*.5,0),(j*.5,h/2),(i*.5,h/2)])
        planter=pmat(sec+' roof','white concrete'); green=pmat(sec+' roof','planted roof')
        for q in range(3 if lod<2 else 2):
            px=cx+(q-1)*5.1;py=cy+1.5*math.sin(q*3)
            ring=outline(px,py,3.1,2.8,q*30,16)
            strip(planter,ring,inset(ring,.18),roofY+.1,roofY+.55)
            cap(green,inset(ring,.2),roofY+.5)
        if lod<2:
            # Recessed clerestory / roof access, deliberately below the high petal rim.
            roofaccess=outline(cx+1,cy+5,9,5,petal['angle'],24)
            wall(glass,roofaccess,roofY+.12,roofY+1.15)
            cap(aluminium,roofaccess,roofY+1.22)
        if lod==0:
            # Collision follows the actual outer shell, excluding the thin decorative screen.
            MANIFEST['collisionVolumes'].append({'name':'library '+petal['name'],'footprint':outline(cx,cy,petal['width'],petal['depth'],petal['angle'],48),'height':roofY+.5,'base':0})
    # Low connector with an external arrival canopy; no fictional traversable interiors.
    con=pmat('Atrium','blue grey glass'); concrete=pmat('Atrium','warm ceramic'); metal=pmat('Atrium','pearl aluminium')
    atrium=outline(0,-12,57,57,18,64 if lod<2 else 32)
    garden=outline(0,-8,31,32,18,len(atrium))
    wall(con,atrium,.25,9.8)
    strip(concrete,atrium,garden,9.72,9.98)
    band(concrete,atrium,9.8,.4,.45)
    # Open-air reading courtyard: the connecting roof has a real hole, not a cap.
    wall(con,list(reversed(garden)),2.8,9.72)
    cap(pmat('Reading garden','warm limestone'),garden,2.82)
    strip(concrete,garden,inset(garden,.16),9.98,10.45)
    for i in range(0,len(atrium),2):
        p=atrium[i];metal.beam((*p,.25),(*p,9.8),.085,.15)
    canopy=[(-21,-47),(-9,-53),(17,-51),(24,-44),(9,-38),(-14,-39)]
    cap(concrete,canopy,5.2);strip(concrete,canopy,inset(canopy,.28),4.9,5.2)
    for x,y in [(-18,-45),(20,-45),(-8,-49),(11,-48)]:metal.beam((x,y,0),(x,y,4.95),.24)
    if lod==0:
        outer=outline(0,-12,57,57,18,32);inner=outline(0,-8,31,32,18,32)
        for i in range(32):
            j=(i+1)%32
            MANIFEST['collisionVolumes'].append({'name':f'library atrium rim {i}','footprint':[outer[i],outer[j],inner[j],inner[i]],'height':10.2,'base':0})
        MANIFEST['collisionVolumes'].append({'name':'library garden floor','footprint':inner,'height':2.82,'base':0})
    # Five small reading-garden canopies, matching the triangular pavilion vocabulary.
    for j,(x,y) in enumerate([(-7,-15),(3,-16),(8,-6),(-5,-5),(1,4)]):
        sh=outline(x,y,7.2,5.4,18+j*32,24 if lod<2 else 12)
        height=7.5+(j%3)*.9
        cap(pmat('Reading garden','warm limestone'),sh,height+.25)
        strip(concrete,sh,inset(sh,.18),height,height+.25)
        if lod<2:
            for i in [2,10,18]:
                a=inset(sh,.8)[i%len(sh)];metal.beam((*a,2.82),(*a,height),.18)
        planting=outline(x+2.5,y+1,2.3,1.8,j*23,12)
        strip(concrete,planting,inset(planting,.12),2.82,3.15)
        cap(pmat('Reading garden','planted roof'),inset(planting,.13),3.12)
    # Modest entrance frames at accessible facade bays, modelled with real reveals.
    entry=pmat('Entrance','frame shadow')
    for x in [-6,-3,0,3,6]:
        entry.box((x,-77.2,1.65),(2.7,.18,3.1))
        metal.box((x-1.42,-77.35,1.7),(.08,.15,3.3))
    metal.box((0,-77.35,3.42),(15,.16,.1))
    metal.box((0,-78.1,4.85),(18,3.2,.25))
    metal.box((0,-79.6,4.38),(18,.2,1.05))
    # The sign is original vector geometry, not raster text on a facade.
    if lod==0:
        fontpath=Path(os.environ.get('LIBRARY_FONT','/System/Library/Fonts/PingFang.ttc'))
        font=bpy.data.fonts.load(str(fontpath)) if fontpath.exists() else None
        for text,z,size in [('图书馆',4.35,.72),('LIBRARY',3.8,.26)]:
            if text=='图书馆' and font is None:
                print('Set LIBRARY_FONT to a CJK font path to include Chinese lettering.');continue
            curve=bpy.data.curves.new('Library lettering','FONT');curve.body=text;curve.size=size;curve.align_x='CENTER';curve.extrude=.014;curve.bevel_depth=.004
            if font:curve.font=font
            obj=bpy.data.objects.new('Entrance sign '+text,curve);coll.objects.link(obj);obj.parent=parent
            obj.location=xyz((0,-79.72,z));obj.rotation_euler=(math.pi/2,0,math.pi);obj.data.materials.append(MATS['Library / bronze lettering'])
            # Ship vector outlines, without embedding or depending on a system font.
            bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
            bpy.context.view_layer.objects.active=obj;bpy.ops.object.convert(target='MESH')
    objects=[p.finish(parent) for p in buckets.values()];objects=[o for o in objects if o]
    # Export this LOD only. Other source collections stay editable in the blend.
    bpy.ops.object.select_all(action='DESELECT')
    for o in list(coll.objects):o.hide_set(False);o.select_set(True)
    bpy.context.view_layer.objects.active=parent
    file=OUT/f'library-lod{lod}.glb'
    bpy.ops.export_scene.gltf(filepath=str(file),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_cameras=False,export_lights=False,export_yup=True)
    tris=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects)
    MANIFEST['lods'].append({'file':file.name,'distance':[0,240,650][lod],'triangles':tris,'meshObjects':len(objects),'bytes':file.stat().st_size})
    coll.hide_render=lod!=0
    for o in coll.objects:o.hide_set(lod!=0)
# Studio lighting and cameras are saved for editing; they are excluded from GLBs.
world=bpy.data.worlds.new('Library studio daylight');scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.28,.36,.45,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.7
light=bpy.data.lights.new('Studio sun','SUN');light.energy=2.4;light.angle=.12
ob=bpy.data.objects.new('Studio sun',light);scene.collection.objects.link(ob);ob.rotation_euler=(.6,-.45,-.65)
camdata=bpy.data.cameras.new('Library review camera');cam=bpy.data.objects.new('Library review camera',camdata);scene.collection.objects.link(cam)
cam.location=xyz((150,-210,125));target=Vector(xyz((0,0,32)))
cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();camdata.lens=47
scene.camera=cam;scene.render.engine='CYCLES';scene.cycles.samples=32
scene.render.resolution_x=1500;scene.render.resolution_y=1050;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
scene['sourceNotes']=json.dumps(DESIGN['evidence'],ensure_ascii=False)
scene['referenceURLs']='\n'.join(x['url'] for x in DESIGN['sources'])
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND),compress=True)
MANIFEST['evidence']=DESIGN['evidence'];MANIFEST['sources']=DESIGN['sources']
(OUT/'library.json').write_text(json.dumps(MANIFEST,ensure_ascii=False,indent=2)+'\n')
print('LIBRARY_ASSET_COMPLETE',json.dumps(MANIFEST['lods']))
if '--render' in sys.argv:
    scene.render.filepath=str(BLEND.with_name('preview.png'))
    bpy.ops.render.render(write_still=True)
