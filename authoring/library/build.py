"""Blender 4.5 LTS library asset authoring. All geometry is original and editable.
Run: blender -b --factory-startup --python authoring/library/build.py
No reference photograph is embedded in the distributable assets.
"""
import bpy, bmesh, json, math, random, sys, os
from pathlib import Path
from mathutils import Vector
from mathutils.geometry import tessellate_polygon

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/models/library'
OUT.mkdir(parents=True,exist_ok=True)
DESIGN = json.loads((Path(__file__).parent / 'design.json').read_text())
for petal in DESIGN['petals']:
    levels=petal['floorLevels']
    assert len(levels)==petal['floors']+1 and levels[0]==0
    assert all(b>a+3 for a,b in zip(levels,levels[1:])), 'invalid storey height'
    assert petal['roofProfile']['upperTerraceRise'] < petal['roofProfile']['rise'] or petal['roofProfile']['upperTerraceRise']==0

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
mat('Library / warm ceramic',(.86,.835,.75),.52,0,'ceramic')
mat('Library / champagne fins',(.66,.59,.40),.34,.35,'metal')
mat('Library / grey spandrel',(.33,.36,.37),.64,.18,'metal')
mat('Library / white roof',(.70,.72,.70),.89,0,'concrete')
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
        if self.material in ['Library / warm ceramic','Library / champagne fins']:
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

MANIFEST={'schema':1,'asset':'library','authoring':'Blender 4.5 LTS','anchor':DESIGN['campusAnchor'],'yaw':DESIGN['campusYaw'],'lods':[],'collisionVolumes':[],'facadeRevision':DESIGN['version'],'roofLevels':[],'photoObservations':DESIGN['photoObservations']}
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
    res=[160,80,32][lod]
    tower=DESIGN['tower']; tx,ty=tower['center']
    tp=outline(tx,ty,tower['width'],tower['depth'],tower['angle'],[96,48,24][lod],True)
    frame=pmat('Tower horizontal fins','champagne fins'); shadow=pmat('Tower mullions','frame shadow')
    spandrel=pmat('Tower spandrel panels','grey spandrel')
    glasses=[pmat('Tower glazing',n) for n in ['blue grey glass','blue grey glass light','blue grey glass dark']]
    fh=DESIGN['floorHeight']; tf=DESIGN['facade']['tower']
    for floor in range(tower['floors']-1):
        lo=floor*fh; hi=lo+fh
        wall(spandrel,tp,lo+tf['spandrelBottom'],lo+tf['spandrelTop'])
        for i,(a,b) in enumerate(zip(tp,tp[1:]+tp[:1])):
            glass=glasses[(i*17+floor*7)%13//5]
            glass.face([(*a,lo+tf['spandrelTop']),(*b,lo+tf['spandrelTop']),(*b,hi-.06),(*a,hi-.06)])
            if lod<2:
                shadow.beam((*a,lo+.10),(*a,hi-.06),.065,.13)
        for h in tf['finLevels']:
            band(frame,tp,lo+h,.15 if h==1.34 else .10,tf['finProjection'])
        if lod==0:
            # Small opening lights sit inside the blue window band, not across the spandrel.
            for i in range((floor*3)%7,len(tp),9):
                a=Vector(tp[i]);b=Vector(tp[(i+1)%len(tp)])
                left=a.lerp(b,.13); right=a.lerp(b,.87)
                for pa,pb in [((*left,lo+1.72),(*right,lo+1.72)),((*left,lo+3.02),(*right,lo+3.02)),((*left,lo+1.72),(*left,lo+3.02)),((*right,lo+1.72),(*right,lo+3.02))]:
                    frame.beam(pa,pb,.055,.075)
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
        sec='Petal '+petal['name']; cx,cy=petal['center']; levels=petal['floorLevels']; floors=len(levels)-1
        shape=outline(cx,cy,petal['width'],petal['depth'],petal['angle'],res)
        white=pmat(sec,'warm ceramic'); aluminium=pmat(sec,'pearl aluminium'); rails=pmat(sec,'frame shadow')
        glass=pmat(sec,'blue grey glass'); grid=pmat(sec+' screen','distant baked screen'); roofgrid=pmat(sec+' roof screen','distant baked screen')
        facade=DESIGN['facade']['podium']
        lattice=pmat(sec+' screen','pearl aluminium')
        clearframe=pmat(sec+' glazing mullions','frame shadow')
        for floor in range(floors):
            poly=inset(shape,floor*.68)
            y0,y1=levels[floor:floor+2]; floorH=y1-y0
            glazing=inset(poly,facade['glassRecess'])
            wall(glass,glazing,y0+.10,y1+.06)
            band(white,poly,y0,facade['solidBandHeight'],facade['solidBandProjection'])
            # Broad opaque ribbon, then lattice, then a continuous clear shadow/glass slot.
            # Every LOD uses the same boundaries. No random missing screen modules.
            screenLo=y0+facade['screenBottom']; screenHi=y1-facade['clearGlassSlot']; screenScale=(screenHi-screenLo)/2.98
            if lod<2:
                for i in range(0,len(poly),2 if lod==0 else 4):
                    a=glazing[i];clearframe.beam((*a,y0+.15),(*a,y1),.07,.12)
            lengths=[0]
            for a,b in zip(poly,poly[1:]+poly[:1]):lengths.append(lengths[-1]+math.dist(a,b))
            bays=max(8,round(lengths[-1]/2.15)); bay=lengths[-1]/bays
            def perimeter(s):
                s%=lengths[-1]; ix=next((q for q in range(len(poly)) if lengths[q+1]>=s),len(poly)-1)
                t=(s-lengths[ix])/(lengths[ix+1]-lengths[ix]);a=poly[ix];b=poly[(ix+1)%len(poly)]
                return (a[0]*(1-t)+b[0]*t,a[1]*(1-t)+b[1]*t)
            def clear_at(s):
                x,y=perimeter(s)
                angle=(math.degrees(math.atan2(y-cy,x-cx))-petal['angle']+180)%360-180
                return any(floor in z['floors'] and z['angle'][0]<=angle<=z['angle'][1] for z in petal['clearGlazingZones'])
            def screen_beam(a,b,width):
                # Clip at the actual panel edges so diagonal bars cannot cross a plain glass slot.
                low=min(a[1],b[1]);high=max(a[1],b[1])
                if high<screenLo or low>screenHi:return
                if a[1]!=b[1]:
                    t0=max(0,min((screenLo-a[1])/(b[1]-a[1]),(screenHi-a[1])/(b[1]-a[1])))
                    t1=min(1,max((screenLo-a[1])/(b[1]-a[1]),(screenHi-a[1])/(b[1]-a[1])))
                    if t1<=t0:return
                    aa=(a[0]+(b[0]-a[0])*t0,a[1]+(b[1]-a[1])*t0)
                    bb=(a[0]+(b[0]-a[0])*t1,a[1]+(b[1]-a[1])*t1)
                else:aa,bb=a,b
                if clear_at((aa[0]+bb[0])*.5):return
                pa=perimeter(aa[0]);pb=perimeter(bb[0]);lattice.beam((*pa,aa[1]),(*pb,bb[1]),width,.12,False)
            for j in range(bays):
                s=(j+.5)*bay
                if clear_at(s):continue
                if lod==2:
                    a=perimeter(j*bay); b=perimeter((j+1)*bay)
                    grid.face([(*a,screenLo),(*b,screenLo),(*b,screenHi),(*a,screenHi)],[(0,0),(1,0),(1,1.5),(0,1.5)])
                    continue
                # Interlocking diagonal square/maze modules clipped to a finite screen panel.
                for row in range(2):
                    z=screenLo+(.50+row*1.80)*screenScale
                    for ring,factor in enumerate([1,.70,.39] if lod==0 else [1,.55]):
                        w=bay*.5*factor; h=.90*factor*screenScale
                        coords=[(s-w,z),(s,z+h),(s+w,z),(s,z-h)]
                        for edge,(a,b) in enumerate(zip(coords,coords[1:]+coords[:1])):
                            if ring==1 and edge==(j+row)%4:continue
                            screen_beam(a,b,.082)
                for factor in ([1,.52] if lod==0 else [.8]):
                    mid=s+bay*.5; z=screenLo+1.4*screenScale
                    coords=[(mid-bay*.5*factor,z),(mid,z+.90*factor*screenScale),(mid+bay*.5*factor,z),(mid,z-.90*factor*screenScale)]
                    for a,b in zip(coords,coords[1:]+coords[:1]):screen_beam(a,b,.075)
                if lod==0 and j%2==0:
                    pt=perimeter(j*bay);rails.beam((*pt,screenLo),(*pt,screenHi),.045,.085)
        roofY=levels[-1]
        roofpoly=inset(shape,(floors-1)*.68)
        profile=petal['roofProfile']; az=math.radians(profile['crestAzimuth'])
        axis=(math.cos(az),math.sin(az))
        # A plane across the whole volume defines the sloping crown. Calibrate with
        # a fixed-resolution outline so different LODs cannot move the crest.
        reference=inset(outline(cx,cy,petal['width'],petal['depth'],petal['angle'],160),(floors-1)*.68)
        dots=[(x-cx)*axis[0]+(y-cy)*axis[1] for x,y in reference]
        low,high=min(dots),max(dots)
        def fraction(p):return ((p[0]-cx)*axis[0]+(p[1]-cy)*axis[1]-low)/(high-low)
        def roof_top(p):return roofY+profile['minParapet']+profile['rise']*fraction(p)
        def lip(i):return roof_top(roofpoly[i])
        band(white,roofpoly,roofY,facade['solidBandHeight'],facade['solidBandProjection'])
        roofdeck=inset(roofpoly,.48)
        cap(pmat(sec+' lower terrace','roof gravel'),roofdeck,roofY+.05)
        upper=profile['upperTerraceRise']
        if upper:
            # Keep the raised white roof on the high side; the low side stays a
            # distinct terrace, instead of lifting the entire roof as one flat cap.
            terrace=inset(roofpoly,4.2)
            clipped=[]; cutoff=profile['upperTerraceCutoff']
            for a,b in zip(terrace,terrace[1:]+terrace[:1]):
                fa,fb=fraction(a)-cutoff,fraction(b)-cutoff
                if fa>=0:clipped.append(a)
                if (fa>=0)!=(fb>=0):
                    t=fa/(fa-fb);clipped.append((a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t))
            terrace=clipped
            wall(pmat(sec+' upper terrace wall','white concrete'),terrace,roofY+.06,roofY+upper)
            cap(pmat(sec+' upper terrace','white roof'),terrace,roofY+upper)
            band(pmat(sec+' upper terrace edge','warm ceramic'),terrace,roofY+upper-.15,.18,.08)
            if lod==0:
                MANIFEST['collisionVolumes'].append({'name':'library '+petal['name']+' upper terrace','footprint':terrace,'height':roofY+upper+.03,'base':0})
            # Low rectangular planted strips occupy the terrace below the white roof.
            for i in range(0,len(roofpoly),8 if lod<2 else 16):
                a=roofpoly[i]; b=roofpoly[(i+5)%len(roofpoly)]
                if .10 < fraction(a) < .30:
                    inner=inset(roofpoly,2.0); a2=inner[i];b2=inner[(i+5)%len(roofpoly)]
                    cap(pmat(sec+' lower terrace','planted roof'),[a,b,b2,a2],roofY+.08)
        # A substantial sloping rim and white supports tie the roof screen to the
        # architecture; the former thin, nearly level decorative railing is removed.
        strip(pmat(sec+' sloping rim','warm ceramic'),inset(roofpoly,-.10),inset(roofpoly,.24),lip,lambda i:lip(i)+.22)
        roofbars=pmat(sec+' roof screen','pearl aluminium')
        lengths=[0]
        for a,b in zip(roofpoly,roofpoly[1:]+roofpoly[:1]):lengths.append(lengths[-1]+math.dist(a,b))
        perimeterLength=lengths[-1]
        def roof_perimeter(s):
            s%=perimeterLength;ix=next((q for q in range(len(roofpoly)) if lengths[q+1]>=s),len(roofpoly)-1)
            t=(s-lengths[ix])/(lengths[ix+1]-lengths[ix]);a=roofpoly[ix];b=roofpoly[(ix+1)%len(roofpoly)]
            return (a[0]*(1-t)+b[0]*t,a[1]*(1-t)+b[1]*t)
        base=roofY+facade['solidBandHeight']+.06
        def roof_beam(a,b,width):
            # Clip bars against the same sloping plane used by the far LOD.
            aa,bb=list(a),list(b)
            for boundary in ['bottom','top']:
                def margin(p):return p[1]-base if boundary=='bottom' else roof_top(roof_perimeter(p[0]))-p[1]
                da,db=margin(aa),margin(bb)
                if da<0 and db<0:return
                if (da<0)!=(db<0):
                    t=da/(da-db);hit=[aa[0]+(bb[0]-aa[0])*t,aa[1]+(bb[1]-aa[1])*t]
                    if da<0:aa=hit
                    else:bb=hit
            if math.dist(aa,bb)<.02:return
            pa=roof_perimeter(aa[0]);pb=roof_perimeter(bb[0]);roofbars.beam((*pa,aa[1]),(*pb,bb[1]),width,.10,False)
        bays=max(12,round(perimeterLength/2.2)); bay=perimeterLength/bays
        for j in range(bays):
            a=roof_perimeter(j*bay);b=roof_perimeter((j+1)*bay)
            if j%3==0:
                p=inset(roofpoly,.25)[round(j/bays*len(roofpoly))%len(roofpoly)]
                pmat(sec+' roof supports','warm ceramic').beam((*p,roofY+.1),(*p,roof_top(p)),.18,.24)
            if lod==2:
                roofgrid.face([(*a,base),(*b,base),(*b,roof_top(b)),(*a,roof_top(a))],[(j,0),(j+1,0),(j+1,(roof_top(b)-base)/1.8),(j,(roof_top(a)-base)/1.8)])
                continue
            s=(j+.5)*bay
            for row in range(math.ceil((roofY+profile['minParapet']+profile['rise']-base)/1.8)):
                z=base+.55+row*1.8
                for ring,factor in enumerate([1,.68,.36] if lod==0 else [1,.54]):
                    coords=[(s-bay*.5*factor,z),(s,z+.9*factor),(s+bay*.5*factor,z),(s,z-.9*factor)]
                    for edge,(a,b) in enumerate(zip(coords,coords[1:]+coords[:1])):
                        if ring==1 and edge==(j+row)%4:continue
                        roof_beam(a,b,.075)
        if lod==0:
            MANIFEST['roofLevels'].append({'name':petal['name'],'role':profile['role'],'floorLevels':levels,'deck':roofY,'upperTerrace':roofY+upper if upper else None,'crownMin':roofY+profile['minParapet'],'crownMax':roofY+profile['minParapet']+profile['rise'],'crestAxis':list(axis),'projectionRange':[low,high],'center':[cx,cy]})
        planter=pmat(sec+' roof','white concrete'); green=pmat(sec+' roof','planted roof')
        for q in range((5 if lod<2 else 3) if petal['roofFinish']=='garden' else 0):
            px=cx+(q-2)*4.3;py=cy+2.5*math.sin(q*3)
            ring=outline(px,py,3.1,2.8,q*30,16)
            strip(planter,ring,inset(ring,.18),roofY+.1,roofY+.55)
            cap(green,inset(ring,.2),roofY+.5)
        if lod<2 and petal['roofFinish']=='garden':
            # Recessed clerestory / roof access, deliberately below the high petal rim.
            roofaccess=outline(cx+1,cy+5,9,5,petal['angle'],24)
            wall(glass,roofaccess,roofY+.12,roofY+1.15)
            cap(aluminium,roofaccess,roofY+1.22)
        if lod==0:
            # Collision follows the actual outer shell, excluding the thin decorative screen.
            MANIFEST['collisionVolumes'].append({'name':'library '+petal['name'],'footprint':outline(cx,cy,petal['width'],petal['depth'],petal['angle'],48),'height':roofY+.12,'base':0})
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
    # Recessed curved connector between the front petals. The whole connector is clear glass.
    ef=DESIGN['facade']['entrance']; ex,ey=ef['center']; width=ef['width']; eh=ef['height']
    entryGlass=pmat('Entrance clear glazing','blue grey glass')
    entryFrame=pmat('Entrance mullions','pearl aluminium')
    entrySolid=pmat('Entrance solid sign fascia','warm ceramic')
    def entry_point(u,offset=0):return (ex+(u-.5)*width,ey+ef['recess']*math.sin(math.pi*u)+offset)
    divisions=24 if lod<2 else 12
    for i in range(divisions):
        a=entry_point(i/divisions);b=entry_point((i+1)/divisions)
        entryGlass.face([(*a,0),(*b,0),(*b,eh-2.2),(*a,eh-2.2)])
        backA=entry_point(i/divisions,1.1);backB=entry_point((i+1)/divisions,1.1)
        solidA=(a[0],a[1]-.12);solidB=(b[0],b[1]-.12)
        for z,h in [(4.6,.60),(eh-2.2,2.2)]:
            entrySolid.face([(*solidA,z),(*solidB,z),(*solidB,z+h),(*solidA,z+h)])
            entrySolid.face([(*solidA,z+h),(*solidB,z+h),(*backB,z+h),(*backA,z+h)])
            entrySolid.face([(*backA,z),(*backB,z),(*solidB,z),(*solidA,z)])
        if lod<2 and i%2==0:entryFrame.beam((*a,.08),(*a,eh-2.2),.085,.15)
        for z in [3.1,6.5,8.55]:entryFrame.beam((*a,z),(*b,z),.10,.14)
    doorY=entry_point(.5)[1]-.08
    for x in [ex-4.8,ex-2.4,ex,ex+2.4,ex+4.8]:
        entryFrame.box((x,doorY,1.55),(.11,.17,3.1))
        if lod==0:entryFrame.box((x+.25,doorY-.18,1.38),(.04,.10,.65))
    entryFrame.box((ex,doorY,3.1),(9.7,.18,.13))
    entryGlass.box((ex,doorY-1.55,3.85),(13.5,3.2,.10))
    for x in [ex-6,ex,ex+6]:entryFrame.beam((x,doorY+.1,4.4),(x,doorY-3.1,3.8),.065,.09)
    # Central raised skylight visible in the aerial photograph, behind the entrance.
    skylightGlass=pmat('Central skylight','blue grey glass light')
    skylightFrame=pmat('Central skylight','pearl aluminium')
    skylightBase=pmat('Central skylight','white concrete')
    skylightBase.box((0,-22,10.7),(20,21,1.2))
    for i in range(10):
        x=-10+i*2;nx=x+2
        for sign in [-1,1]:
            skylightGlass.face([(x,-22,15.3),(nx,-22,15.3),(nx,-22+sign*10.5,11.35),(x,-22+sign*10.5,11.35)])
            skylightFrame.beam((x,-22,15.35),(x,-22+sign*10.5,11.40),.12,.16)
    skylightFrame.beam((-10,-22,15.35),(10,-22,15.35),.18,.2)
    if lod==0:
        # A continuous entrance collision hull, while the forecourt remains walkable.
        front=[entry_point(i/12) for i in range(13)]
        MANIFEST['collisionVolumes'].append({'name':'library curved entrance','footprint':front+[entry_point(1,2),entry_point(0,2)],'height':eh,'base':0})
    # The sign is original vector geometry, not raster text on a facade.
    if lod==0:
        fontpath=Path(os.environ.get('LIBRARY_FONT','/System/Library/Fonts/STHeiti Medium.ttc'))
        font=bpy.data.fonts.load(str(fontpath)) if fontpath.exists() else None
        for text,z,size in [('图书馆',11.76,.82),('Library',11.13,.34)]:
            if text=='图书馆' and font is None:
                print('Set LIBRARY_FONT to a CJK font path to include Chinese lettering.');continue
            curve=bpy.data.curves.new('Library lettering','FONT');curve.body=text;curve.size=size;curve.align_x='CENTER';curve.extrude=.014;curve.bevel_depth=.004
            if font:curve.font=font
            obj=bpy.data.objects.new('Entrance sign '+text,curve);coll.objects.link(obj);obj.parent=parent
            obj.location=xyz((ex,ey+ef['recess']-.24,z));obj.rotation_euler=(math.pi/2,0,math.pi);obj.data.materials.append(MATS['Library / bronze lettering'])
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
light=bpy.data.lights.new('Studio sun','SUN');light.energy=3.0;light.angle=.12
ob=bpy.data.objects.new('Studio sun',light);scene.collection.objects.link(ob);ob.rotation_euler=(.65,-.25,3.4)
camdata=bpy.data.cameras.new('Library review camera');cam=bpy.data.objects.new('Library review camera',camdata);scene.collection.objects.link(cam)
cam.location=xyz((118,-228,118));target=Vector(xyz((5,0,32)))
cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();camdata.lens=47
scene.camera=cam;scene.render.engine='CYCLES';scene.cycles.samples=40;scene.cycles.use_denoising=True
scene.render.resolution_x=1500;scene.render.resolution_y=1050;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
scene['sourceNotes']=json.dumps(DESIGN['evidence'],ensure_ascii=False)
scene['referenceURLs']='\n'.join(x['url'] for x in DESIGN['sources'])
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND),compress=True)
MANIFEST['evidence']=DESIGN['evidence'];MANIFEST['sources']=DESIGN['sources']
(OUT/'library.json').write_text(json.dumps(MANIFEST,ensure_ascii=False,indent=2)+'\n')
print('LIBRARY_ASSET_COMPLETE',json.dumps(MANIFEST['lods']))
if '--render' in sys.argv:
    for name,location,aim,lens in [
        ('preview',(118,-228,118),(5,0,32),47),
        ('roof-heights',(8,-260,100),(8,-4,24),48),
        ('entrance',(-6,-103,8),(-3,-35,9.0),43),
        ('tower-facade',(-73,-75,22),(-4,19,36),57),
    ]:
        cam.location=xyz(location);cam.rotation_euler=(Vector(xyz(aim))-cam.location).to_track_quat('-Z','Y').to_euler();camdata.lens=lens
        scene.render.filepath=str(BLEND.with_name(name+'.png'))
        bpy.ops.render.render(write_still=True)
