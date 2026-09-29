"""Hall exterior from as-built outline and photograph; estimated modules documented in design.json."""
import bpy, json, math, random, sys
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'common'))
from geometry import Part,mat,MATS,xyz,wall,cap,area,profile_curve,inset
ROOT=Path(__file__).resolve().parents[2];HERE=Path(__file__).parent;OUT=ROOT/'public/models/hall';OUT.mkdir(parents=True,exist_ok=True)
D=json.loads((HERE/'design.json').read_text());BASE=D['buildingBase'];HEIGHT=D['height'];POD=D['podiumHeight']
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
    if c.name!='Collection':bpy.data.collections.remove(c)
scene=bpy.context.scene;scene.unit_settings.system='METRIC'
materials=[('limestone',(.72,.64,.46),.78,0,'stone'),('limestone light',(.78,.70,.53),.8,0,'stone'),('recess stone',(.55,.48,.34),.83,0,'stone'),('blue glazing',(.045,.10,.14),.2,.04,'glass'),('glazing light',(.08,.16,.20),.23,.04,'glass'),('window frames',(.09,.11,.11),.37,.65,'metal'),('gold soffit',(.64,.39,.09),.36,.48,'metal'),('rail',(.34,.36,.32),.4,.65,'metal'),('roof',(.63,.60,.48),.9,0,'roofMetal'),('timber',(.28,.16,.065),.86,0,'wood'),('pale paving',(.57,.56,.50),.9,0,'stone'),('dark paving',(.42,.43,.39),.92,0,'paving'),('lawn',(.18,.26,.075),.98,0,'foliage'),('bark',(.31,.25,.18),.97,0,'bark'),('leaf shadow',(.09,.20,.045),.86,0,'foliage'),('leaf light',(.22,.33,.075),.88,0,'foliage'),('hedge',(.12,.24,.052),.94,0,'foliage'),('lamp',(.045,.05,.045),.45,.45,'metal'),('light strip',(.95,.87,.61),.38,0,'paint')]
for args in materials:mat('Hall / '+args[0],*args[1:])
for key in ['leaf shadow','leaf light']:MATS['Hall / '+key].use_backface_culling=False
MATS['Hall / light strip'].node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value=(.95,.78,.43,1)
MATS['Hall / light strip'].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value=.55

def volume(part,fp,z0,z1):
    if len(fp)<3:return
    if area(fp)<0:fp=list(reversed(fp))
    wall(part,fp,z0,z1);cap(part,fp,z1);cap(part,list(reversed(fp)),z0)

def clip(fp,axis,value,lower):
    out=[]
    for a,b in zip(fp,fp[1:]+fp[:1]):
        ia=(a[axis]>=value) if lower else (a[axis]<=value);ib=(b[axis]>=value) if lower else (b[axis]<=value)
        if ia:out.append(a)
        if ia!=ib:
            t=(value-a[axis])/(b[axis]-a[axis]);out.append([a[k]+(b[k]-a[k])*t for k in [0,1]])
    return out

def rectclip(fp,x0=-100,x1=100,z0=-100,z1=100):
    for axis,value,lower in [(0,x0,True),(0,x1,False),(1,z0,True),(1,z1,False)]:fp=clip(fp,axis,value,lower)
    return fp

smooth,_=profile_curve(D['hallOutline'],n=512)
polar=sorted([(math.atan2(p[1],p[0])%math.tau,math.hypot(*p)) for p in smooth]);polar=[(polar[-1][0]-math.tau,polar[-1][1])]+polar+[(polar[0][0]+math.tau,polar[0][1])]
def pt(a,depth=0,h=0):
    angle=a%math.tau;i=next(i for i in range(1,len(polar)) if polar[i][0]>=angle);p,q=polar[i-1],polar[i];t=(angle-p[0])/(q[0]-p[0]);r=p[1]*(1-t)+q[1]*t-depth
    return (r*math.cos(a),r*math.sin(a),BASE+h)

def ring(a,b,outer,inner,n):
    p=[pt(a+(b-a)*i/n,outer)[:2] for i in range(n+1)]+[pt(a+(b-a)*i/n,inner)[:2] for i in reversed(range(n+1))]
    return p

manifest={k:D[k] for k in ['asset','name','anchor','base','yaw','sources','evidence','views','review','landscape']}
manifest.update(lods=[],collisionVolumes=[],collisionMeshes=[],canopyBounds=[],height=HEIGHT,stairRoutes=[])
def collider(name,fp,z0,z1):manifest['collisionVolumes'].append({'name':name,'footprint':fp,'base':z0,'height':z1-z0})
def tube(part,a,b,r0,r1,n=8):
    a,b=Vector(a),Vector(b); d=(b-a).normalized()
    ref=Vector((0,0,1)) if abs(d.z)<.92 else Vector((1,0,0))
    u=d.cross(ref).normalized(); v=d.cross(u).normalized()
    ra=[a+r0*(u*math.cos(i*math.tau/n)+v*math.sin(i*math.tau/n)) for i in range(n)]
    rb=[b+r1*(u*math.cos(i*math.tau/n)+v*math.sin(i*math.tau/n)) for i in range(n)]
    for i in range(n): j=(i+1)%n; part.face([ra[i],ra[j],rb[j],rb[i]])
    part.face(list(reversed(ra))); part.face(rb)

def ellipsoid(part,c,size,n=10,rings=6):
    for j in range(rings):
        a=-math.pi/2+math.pi*j/rings; b=-math.pi/2+math.pi*(j+1)/rings
        def pt(t,angle):return(c[0]+size[0]*math.cos(t)*math.cos(angle),c[1]+size[1]*math.cos(t)*math.sin(angle),c[2]+size[2]*math.sin(t))
        for i in range(n):
            t=i*math.tau/n; q=(i+1)*math.tau/n
            if j==0: part.face([pt(a,t),pt(b,q),pt(b,t)])
            elif j==rings-1:part.face([pt(a,t),pt(a,q),pt(b,t)])
            else:part.face([pt(a,t),pt(a,q),pt(b,q),pt(b,t)])

for lod in range(3):
    random.seed(119);coll=bpy.data.collections.new(f'Hall LOD{lod}');scene.collection.children.link(coll)
    root=bpy.data.objects.new(f'Hall {lod}',None);coll.objects.link(root);root['placeId']='hall';buckets={}
    def part(name,material):
        key=(name,material)
        if key not in buckets:buckets[key]=Part(name+' | '+material,'Hall / '+material,coll)
        return buckets[key]
    stone=part('jointed pale stone facade','limestone');stone2=part('jointed pale stone facade','limestone light');recess=part('window reveals','recess stone')
    glass=part('deep recessed glazing','blue glazing');glass2=part('deep recessed glazing','glazing light');frames=part('window transoms and mullions','window frames')
    roof=part('oval roof membrane','roof');rail=part('terrace rails','rail')
    # Small physical joints persist at near/middle levels; distant silhouette uses continuous patches.
    def patch(a,b,h0,h1,depth=0,thick=.7,target=None):
        nr=max(1,math.ceil((h1-h0)/[1.2,2.4,20][lod]));nc=max(1,math.ceil((b-a)*26/[1.2,2.4,3.8][lod]));gap=[.012,.017,0][lod]
        for row in range(nr):
            z0=h0+(h1-h0)*row/nr+gap/2;z1=h0+(h1-h0)*(row+1)/nr-gap/2
            for col in range(nc):
                a0=a+(b-a)*col/nc+gap/48;a1=a+(b-a)*(col+1)/nc-gap/48
                volume(target or (stone2 if (row+col)%7==0 else stone),ring(a0,a1,depth,depth+thick,max(1,math.ceil((a1-a0)*26/[.55,1,2.3][lod]))),BASE+z0,BASE+z1)
    # The portal interrupts the otherwise regular slit-window rhythm.
    portal=-math.pi/2;start=portal+.14;end=portal+math.tau-.14;count=40
    for j in range(count):
        a=start+(end-start)*j/count;b=start+(end-start)*(j+1)/count;left=a+(b-a)*.24;right=b-(b-a)*.24
        patch(a,b,15.5,HEIGHT)
        patch(a,left,POD,15.5);patch(right,b,POD,15.5);patch(left,right,POD,POD+.25)
        # Three stepped stone heads, each set progressively deeper into the opening.
        for k in range(3):patch(left,right,13+k*.83,13+(k+1)*.83,.14+k*.17,.22,target=part('stepped window heads','limestone'))
        verts=[pt(left,.68,POD+.25),pt(right,.68,POD+.25),pt(right,.68,13),pt(left,.68,13)]
        (glass2 if j%5==0 else glass).face(verts)
        for x,y in zip(verts,verts[1:]+verts[:1]):frames.beam(x,y,.07,.09)
        for h in [POD+1.15,POD+2.45,POD+3.8,POD+5.1,POD+6.4]:frames.beam(pt(left,.65,h),pt(right,.65,h),.075,.08)
        if lod==0:
            mid=(left+right)/2
            for h in [POD+1.15,POD+3.8]:
                frames.beam(pt(left+.008,.62,h-.06),pt(right-.008,.62,h-.06),.025,.035)
        if j==12:
            vent=part('upper service grille','window frames');a0=(a+b)/2-.035;a1=(a+b)/2+.035
            # Surface-mounted dark grille with individual slats, visible in the built photograph.
            vent.face([pt(a0,-.025,17),pt(a1,-.025,17),pt(a1,-.025,18.05),pt(a0,-.025,18.05)])
            if lod<2:
                for h in [17+.12*k for k in range(9)]:recess.beam(pt(a0,-.045,h),pt(a1,-.045,h),.035,.05)
    pa,pb=portal-.14,portal+.14
    patch(pa,pb,15.5,HEIGHT);patch(pa,pb,10.6,15.5,.22,.45)
    # Portal deep jambs and sheltered door at the back of the recess.
    for a in [pa,pb]:
        recess.face([pt(a,0,POD),pt(a,1.65,POD),pt(a,1.65,10.6),pt(a,0,10.6)])
    gold=part('portal gold soffit','gold soffit');cap(gold,list(reversed(ring(pa,pb,0,1.65,10))),BASE+10.6)
    doors=part('portal entrance doors','blue glazing')
    for j in range(6):
        a=pa+(pb-pa)*j/6;b=pa+(pb-pa)*(j+1)/6
        q=[pt(a,1.65,POD),pt(b,1.65,POD),pt(b,1.65,10.52),pt(a,1.65,10.52)];doors.face(q)
        for p,q in zip(q,q[1:]+q[:1]):frames.beam(p,q,.085,.1)
        frames.beam(pt(a,1.62,POD+2.4),pt(b,1.62,POD+2.4),.085,.1)
        if lod==0:
            frames.beam(pt(a+.012,1.59,POD+.85),pt(a+.012,1.59,POD+1.45),.026,.04)
    full=[pt(i*math.tau/[192,112,64][lod],.68)[:2] for i in range([192,112,64][lod])]
    volume(roof,full,BASE+19.38,BASE+19.46)
    # Main mass collider stays behind the deepest portal; no invented interior access.
    if lod==0:collider('hall main auditorium', [pt(i*math.tau/128,1.70)[:2] for i in range(128)],BASE+POD,BASE+19.46)
    for x,z in [(-7,-9),(7,6)]:
        roofpart=part('low roof service hatches','limestone');roofpart.box((x,z,BASE+19.56),(2.8,1.3,.22))
    if lod<2:
        joints=part('roof seams','recess stone')
        for z in range(-23,24,4):
            xs=[p[0] for p in full if abs(p[1]-z)<1.2]
            if len(xs)>1:joints.beam((min(xs),z,BASE+19.48),(max(xs),z,BASE+19.48),.015,.015,False)

    # Podium is divided around actual stair voids; a solid box would block both flights.
    fp=D['footprint'];podium=part('curved podium and terrace','limestone');deck=part('podium terrace paving','pale paving')
    solids=[rectclip(fp,z1=8),rectclip(fp,x0=-23.6,x1=24.2,z0=8,z1=29),rectclip(fp,z0=29)]
    for index,p in enumerate(solids):
        volume(podium,p,BASE,BASE+POD-.16);volume(deck,p,BASE+POD-.16,BASE+POD)
        if lod==0:collider(f'hall podium {index}',p,BASE,BASE+POD)
    # Panel joints on the low curved retaining wall; side stair openings remain clear.
    seam=part('podium panel seams','recess stone')
    for a,b in zip(fp,fp[1:]+fp[:1]):
        if 8<(a[1]+b[1])/2<29:continue
        length=math.dist(a,b);n=max(1,math.ceil(length/1.25))
        dx,dz=b[0]-a[0],b[1]-a[1];normal=(dz/length,-dx/length) if area(fp)>0 else (-dz/length,dx/length)
        for i in range(n):
            t=i/n;p=(a[0]+dx*t+normal[0]*.01,a[1]+dz*t+normal[1]*.01)
            if lod<2:seam.beam((*p,BASE+.06),(*p,BASE+POD-.17),.014,.014,False)
        if lod<2:
            for h in [1.3,2.6,3.9]:seam.beam((a[0]+normal[0]*.012,a[1]+normal[1]*.012,BASE+h),(b[0]+normal[0]*.012,b[1]+normal[1]*.012,BASE+h),.014,.014,False)
        # Railing inset from terrace edge, enough height to function as a guard.
        p0=(a[0]-normal[0]*.16,a[1]-normal[1]*.16,BASE+POD+1.03);p1=(b[0]-normal[0]*.16,b[1]-normal[1]*.16,BASE+POD+1.03)
        rail.beam(p0,p1,.055,.055)
        for j in range(max(1,math.ceil(length/[1.25,1.8,2.8][lod]))):
            t=j/max(1,math.ceil(length/[1.25,1.8,2.8][lod]));q=tuple(p0[k]+(p1[k]-p0[k])*t for k in range(3));rail.beam((q[0],q[1],BASE+POD),q,.038,.038)
        if lod==0:
            edge=[a,b,[b[0]-normal[0]*.15,b[1]-normal[1]*.15],[a[0]-normal[0]*.15,a[1]-normal[1]*.15]];collider('hall terrace guard '+str(len(manifest['collisionVolumes'])),edge,BASE+POD,BASE+POD+1.03)
    # Twin two-flight exterior stairs, open side approach and intermediate landing.
    stairs=part('twin exterior stone stairs','limestone light');hand=part('stair handrails','rail')
    def ramp(name,pts):
        if lod==0:manifest['collisionMeshes'].append({'name':name,'position':[v for p in pts for v in [p[0],p[2],p[1]]],'index':[0,2,1,0,3,2]})
    for side,(x,g) in enumerate(zip([-25.4,26],D['stairGround'])):
        start=max(BASE+.02,g+.075);top=BASE+POD;middle=(start+top)/2;left=x-1.5;right=x+1.5
        for j,(v0,v1,h0,h1) in enumerate([(10,18,start,middle),(20,28,middle,top)]):
            n=18
            for i in range(n):
                z0=v0+(v1-v0)*i/n;z1=v0+(v1-v0)*(i+1)/n;h=h0+(h1-h0)*(i+1)/n
                volume(stairs,[[left,z0],[right,z0],[right,z1],[left,z1]],h-.20,h)
            ramp(f'hall stair ramp {side}-{j}',[(left,v0,h0),(right,v0,h0),(right,v1,h1),(left,v1,h1)])
            for sx in [left+.04,right-.04]:
                a=(sx,v0,h0);b=(sx,v1,h1);hand.beam((sx,v0,h0+1.02),(sx,v1,h1+1.02),.055,.055)
                ramp(f'hall stair guard {side}-{j}-{sx}',[a,b,(sx,v1,h1+1.02),(sx,v0,h0+1.02)])
                for k in range(9):
                    t=k/8;h=h0+(h1-h0)*t;z=v0+(v1-v0)*t;hand.beam((sx,z,h),(sx,z,h+1.02),.035,.035)
        for i,(z0,z1,h) in enumerate([(8,10,start),(18,20,middle),(28,30,top)]):
            p=[[left,z0],[right,z0],[right,z1],[left,z1]];volume(stairs,p,h-.18,h)
            if lod==0:collider(f'hall stair landing {side}-{i}',p,h-.18,h)
        for sx in [left+.04,right-.04]:
            hand.beam((sx,18,middle+1.02),(sx,20,middle+1.02),.055,.055)
            ramp(f'hall stair guard landing {side}-{sx}',[(sx,18,middle),(sx,20,middle),(sx,20,middle+1.02),(sx,18,middle+1.02)])
        if lod==0:manifest['stairRoutes'].append([[(-31 if side==0 else 32),9,g],[x,9,start],[x,10,start],[x,14,(start+middle)/2],[x,18,middle],[x,19,middle],[x,20,middle],[x,24,(middle+top)/2],[x,28,top],[x,29.5,top]])
    # Rear supporting rooms and an open timber pergola, based on equipment plan / design rendering.
    rear=part('rear support wing','limestone');pergola=part('rear open pergola','timber')
    rearfp=rectclip(fp,z0=30.25)
    volume(rear,rearfp,BASE+POD,BASE+10.4)
    if lod==0:collider('hall rear support wing',rearfp,BASE+POD,BASE+10.4)
    for x in range(-25,29,4):
        pergola.box((x,31.15,BASE+11.05),(.20,2.25,.28));pergola.box((x,31.6,BASE+10.7),(.18,.18,1.05))
    for z in [30.45,31.85]:pergola.box((1,z,BASE+10.92),(53,.18,.20))
    for x in range(-24,27,4):
        q=[(x,32.62,BASE+6.1),(x+1.8,32.62,BASE+6.1),(x+1.8,32.62,BASE+8.7),(x,32.62,BASE+8.7)];glass.face(list(reversed(q)))
        for a,b in zip(q,q[1:]+q[:1]):frames.beam(a,b,.065,.065)
    # Terrain-following paving, continuous lawns, hedges and branch/leaf canopies.
    paving=part('site perimeter paving','pale paving');lawn=part('connected planted lawns','lawn');curb=part('planting curbs','limestone')
    for apron in D['landscape']['aprons']:
        a,b=apron['inner'],apron['outer'];ah,bh=apron['innerHeights'],apron['outerHeights']
        for i in range(len(a)):
            j=(i+1)%len(a);p=[(*a[i],ah[i]),(*a[j],ah[j]),(*b[j],bh[j]),(*b[i],bh[i])];paving.face(p if area([q[:2] for q in p])>0 else list(reversed(p)))
    for path in D['landscape']['paths']:
        q=[(*p,h) for p,h in zip(path['footprint'],path['heights'])];part('fan plaza paving','dark paving' if path['tone'] else 'pale paving').face(q if area(path['footprint'])>0 else list(reversed(q)))
    for bed in D['landscape']['beds']:
        fp=bed['footprint'];ys=bed['heights'];c=tuple(sum(p[k] for p in fp)/len(fp) for k in [0,1])+(sum(ys)/len(ys),)
        for i in range(len(fp)):
            j=(i+1)%len(fp);lawn.face([c,(*fp[i],ys[i]),(*fp[j],ys[j])]);curb.beam((*fp[i],ys[i]+.035),(*fp[j],ys[j]+.035),.13,.13)
    hedge=part('continuous low hedges','hedge')
    for shrub in D['landscape']['shrubs']:
        x,z=shrub['point'];ellipsoid(hedge,(x,z,shrub['y']),(shrub['radius'],shrub['radius']*.7,.5),[10,8,6][lod],[6,5,4][lod])
    bark=part('branching tree trunks','bark');dark=part('layered leaf canopy','leaf shadow');light=part('layered leaf canopy','leaf light')
    for index,tree in enumerate(D['landscape']['plants']):
        x,z=tree['point'];y=tree['y'];h=tree['height'];radius=tree['crownRadius']
        leafStart=[len(dark.v),len(light.v)]
        if tree['type'].startswith('palm'):
            for k in range(1 if tree['type']=='palm-single' else 3):
                spread=0 if tree['type']=='palm-single' else .48;ox=spread*math.cos(k*2.1);oz=spread*math.sin(k*2.1);top=Vector((x+ox,z+oz,y+h-k*.7));tube(bark,(x+ox,z+oz,y),top,.17,.095,8)
                for j in range([10,7,5][lod]):
                    angle=j*math.tau/[10,7,5][lod]+k;direction=Vector((math.cos(angle),math.sin(angle),0));side=Vector((-direction.y,direction.x,0))
                    def stem(t):return top+direction*(radius-(.4 if tree['type']=='palm-single' else .9))*t+Vector((0,0,math.sin(math.pi*t)*.8-.9*t))
                    for q in range(5):bark.beam(stem(q/5),stem((q+1)/5),.018,.018,False)
                    for q in range([11,7,4][lod]):
                        t=(q+1)/([11,7,4][lod]+1);p=stem(t)
                        for sign in [-1,1]:light.face([p-direction*.08,p+side*sign*.5*math.sin(math.pi*t)+direction*.25+Vector((0,0,-.16)),p+direction*.09])
        else:
            tube(bark,(x,z,y),(x+.18,z,y+h*.83),.19,.055,[10,8,6][lod])
            for level in range(3):
                for k in range([8,6,4][lod]):
                    angle=k*2.399+level*.9;reach=radius*(.57-level*.10);end=Vector((x+math.cos(angle)*reach,z+math.sin(angle)*reach,y+h*(.58+.13*level+.06*math.sin(k*2.23+index))))
                    start=Vector((x,z,y+h*(.43+.15*level)));tube(bark,start,end,.047,.014,5)
                    for j in range([9,5,2][lod]):
                        a=j*2.399+index;rr=radius*.19*math.sqrt((j+1)/[9,5,2][lod]);c=end+Vector((math.cos(a)*rr,math.sin(a)*rr,.35*math.sin(j)))
                        target=light if (j+k+level)%4==0 else dark
                        if lod==2:
                            for leaf in range(6):
                                a=leaf*math.tau/6;b=(leaf+1)*math.tau/6
                                target.face([c+Vector((0,0,.14)),c+Vector((.55*math.cos(a),.48*math.sin(a),0)),c+Vector((.55*math.cos(b),.48*math.sin(b),0))])
                        else:
                            for leaf in range([7,5][lod]):
                                theta=leaf*math.tau/[7,5][lod]+a;u=Vector((math.cos(theta),math.sin(theta),.30*math.sin(theta)));v=Vector((-u.y,u.x,.15));tip=c+u*.45
                                target.face([c,c+u*.31-v*.14,tip,c+u*.31+v*.14])
        leafVertices=dark.v[leafStart[0]:]+light.v[leafStart[1]:]
        actualRadius=max(math.hypot(p[0]-x,-p[1]-z) for p in leafVertices)
        assert actualRadius<=radius+.01, f'{tree["id"]}: actual leaves exceed clearance radius'
        manifest['canopyBounds'].append({'tree':tree['id'],'lod':lod,'measuredRadius':actualRadius,'clearanceRadius':radius})
        if lod==0:
            trunkRadius=.8 if tree['type']=='palm-cluster' else .25
            fp=[(x+trunkRadius*math.cos(i*math.tau/8),z+trunkRadius*math.sin(i*math.tau/8)) for i in range(8)];collider(tree['id']+' trunk',fp,y,y+2.6)
    # Young tree stakes and slender light poles are visible in the as-built photograph.
    if lod<2:
        stakes=part('young tree support stakes','timber')
        for tree in D['landscape']['plants']:
            if tree['type'].startswith('palm'):continue
            x,z=tree['point'];y=tree['y']
            for k in range(3):
                a=k*math.tau/3;stakes.beam((x+.8*math.cos(a),z+.8*math.sin(a),y),(x+.16*math.cos(a),z+.16*math.sin(a),y+2.1),.07,.07)
    poles=part('slender plaza lights','lamp');strips=part('plaza light strips','light strip')
    for light in D['landscape']['lights']:
        x,z=light['point'];y=light['y'];h=light['height'];tube(poles,(x,z,y),(x,z,y+h),.065,.065,8)
        strips.box((x,z-.066,y+h-.32),(.032,.009,.53))
        if lod==0:collider('hall lamp '+str(x)+','+str(z),[[x-.10,z-.10],[x+.10,z-.10],[x+.10,z+.10],[x-.10,z+.10]],y,y+h)
    objects=[o for p in buckets.values() if (o:=p.finish(root))]
    for obj in objects:obj['placeId']='hall'
    bpy.ops.object.select_all(action='DESELECT')
    for o in coll.objects:o.hide_set(False);o.select_set(True)
    bpy.context.view_layer.objects.active=root;file=OUT/f'hall-lod{lod}.glb'
    bpy.ops.export_scene.gltf(filepath=str(file),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_cameras=False,export_lights=False,export_yup=True)
    manifest['lods'].append({'file':file.name,'distance':[0,180,450][lod],'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects),'meshObjects':len(objects),'bytes':file.stat().st_size})
    coll.hide_render=lod!=0
    for o in coll.objects:o.hide_set(lod!=0)

preview=bpy.data.collections.new('Preview only');scene.collection.children.link(preview)
mat('Hall / studio ground',(.40,.45,.39),.95,0,'terrain');floor=Part('Studio floor','Hall / studio ground',preview)
floor.face([(-300,-300,BASE-.18),(300,-300,BASE-.18),(300,300,BASE-.18),(-300,300,BASE-.18)])
pr=bpy.data.objects.new('Preview only root',None);preview.objects.link(pr);floor.finish(pr)
world=bpy.data.worlds.new('Hall daylight');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.38,.46,.53,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65
light=bpy.data.lights.new('Sun','SUN');light.energy=3;light.angle=.12;sun=bpy.data.objects.new('Sun',light);scene.collection.objects.link(sun);sun.rotation_euler=(.6,-.4,-.8)
camdata=bpy.data.cameras.new('Hall review camera');cam=bpy.data.objects.new('Hall review camera',camdata);scene.collection.objects.link(cam);scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=40;scene.cycles.use_denoising=True;scene.render.resolution_x=1500;scene.render.resolution_y=1050;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
def camera(name):
    view=D['views'][name];p=view['position'];t=view['target'];cam.location=xyz((p[0],p[2],p[1]));target=Vector(xyz((t[0],t[2],t[1])));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();camdata.lens=36/(2*math.tan(math.radians(view['fov'])/2))*1050/1500
camera('overall');scene['sources']=json.dumps(D['sources']);scene['evidence']=json.dumps(D['evidence'])
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'hall.blend'),compress=True)
(OUT/'hall.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print('HALL_COMPLETE',json.dumps(manifest['lods']))
if '--render' in sys.argv:
    for name in ['overall','front','entrance','landscape']:
        camera(name);scene.render.filepath=str(HERE/(name+'.png'));bpy.ops.render.render(write_still=True)
