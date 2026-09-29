"""Student activity center: as-built bent plan, open arcades and planted court.
Blender 4.5 LTS; source axes X/depth/elevation in metres. No interior reconstruction.
"""
import bpy, json, math, random, sys
from pathlib import Path
from mathutils import Vector
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'common'))
from geometry import Part, mat, MATS, xyz, wall, cap, strip, area

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).parent
OUT = ROOT / 'public/models/activity'
OUT.mkdir(parents=True, exist_ok=True)
D = json.loads((HERE / 'design.json').read_text())
ST = D['stations']; LENGTH = D['length']; HALF = D['halfWidth']; BASE = D['buildingBase']
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
    if c.name != 'Collection': bpy.data.collections.remove(c)
scene = bpy.context.scene; scene.unit_settings.system = 'METRIC'
materials = [
    ('white warm ceramic', (.79,.80,.76), .64, .03, 'plaster'),
    ('reveal shadow', (.28,.32,.31), .88, 0, 'paint'),
    ('blue glazing', (.07,.18,.24), .19, .05, 'glass'),
    ('blue glazing light', (.13,.27,.33), .21, .03, 'glass'),
    ('frosted diamonds', (.45,.59,.64), .46, .08, 'glass'),
    ('window metal', (.47,.53,.52), .34, .55, 'metal'),
    ('pale paving', (.56,.57,.53), .91, 0, 'stone'),
    ('brick', (.37,.18,.115), .93, 0, 'ceramic'),
    ('brick mortar', (.48,.40,.31), .95, 0, 'stone'),
    ('roof', (.34,.38,.37), .90, 0, 'roofMetal'),
    ('roof joints', (.25,.29,.29), .86, 0, 'paint'),
    ('rail', (.24,.28,.26), .36, .5, 'metal'),
    ('lawn', (.18,.26,.075), .98, 0, 'foliage'),
    ('bark', (.31,.25,.18), .97, 0, 'bark'),
    ('leaf shadow', (.09,.20,.045), .86, 0, 'foliage'),
    ('leaf light', (.22,.33,.075), .88, 0, 'foliage'),
    ('hedge', (.12,.24,.052), .94, 0, 'foliage'),
    ('walkway', (.50,.37,.24), .91, 0, 'paving'),
]
for args in materials: mat('Activity / ' + args[0], *args[1:])
for key in ['leaf shadow','leaf light']: MATS['Activity / '+key].use_backface_culling = False

def at(s, t=0, h=0):
    i = next((i for i,p in enumerate(ST) if p['s'] >= s),len(ST)-1)
    i = max(1,i); a,b=ST[i-1],ST[i]; f=(s-a['s'])/(b['s']-a['s'])
    return tuple(a['point'][k]+(b['point'][k]-a['point'][k])*f+t*(a['right'][k]+(b['right'][k]-a['right'][k])*f) for k in [0,1])+(BASE+h,)

def outline(s0=0,s1=LENGTH,front=HALF,back=-HALF,step=1):
    count=max(1,math.ceil((s1-s0)/step)); ss=[s0+(s1-s0)*i/count for i in range(count+1)]
    p=[at(s,front(s) if callable(front) else front)[:2] for s in ss]
    p += [at(s,back(s) if callable(back) else back)[:2] for s in reversed(ss)]
    return p if area(p)>0 else list(reversed(p))

def volume(part, fp, z0, z1):
    if area(fp)<0: fp=list(reversed(fp))
    wall(part,fp,z0,z1); cap(part,fp,z1); cap(part,list(reversed(fp)),z0)

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

manifest={k:D[k] for k in ['asset','name','anchor','base','yaw','sources','evidence','views','review','landscape','throughRoute']}
manifest.update(lods=[],collisionVolumes=[],collisionMeshes=[],canopyBounds=[],floorHeights=D['floors'],height=D['height'])
def collider(name,fp,z0,z1):
    manifest['collisionVolumes'].append({'name':name,'footprint':fp,'base':z0,'height':z1-z0})

for lod in range(3):
    random.seed(512); coll=bpy.data.collections.new(f'Activity LOD{lod}'); scene.collection.children.link(coll)
    root=bpy.data.objects.new(f'Activity {lod}',None); coll.objects.link(root); root['placeId']='activity'
    buckets={}
    def part(name,material):
        key=(name,material)
        if key not in buckets:buckets[key]=Part(name+' | '+material,'Activity / '+material,coll)
        return buckets[key]
    white=part('continuous curved bands','white warm ceramic')
    deck=part('exterior gallery floors','pale paving')
    roof=part('roof membrane','roof'); rail=part('gallery railings','rail')
    step=[.65,1.25,2.7][lod]; full=outline(step=step)
    for h in [5.2,10.4,15.6,20.8]:
        # The return stair passes through a real well in each gallery slab.
        slabs=[full] if h==20.8 else [outline(5.7,LENGTH,step=step),outline(0,.55,step=step),outline(.55,5.7,-7.55,-HALF,step),outline(.55,5.7,HALF,1.9,step)]
        for index,fp in enumerate(slabs):
            volume(deck,fp,BASE+h-.32,BASE+h)
            if lod==0:collider(f'activity slab {h} {index}',fp,BASE+h-.32,BASE+h)
        # Deep opaque band follows both continuous facades, with open gallery behind.
        for side in [-1,1]:
            edge=outline(front=side*(HALF+.18),back=side*(HALF-.16),step=step)
            volume(white,edge,BASE+h-.46,BASE+h+.55)
            if lod==0:collider(f'activity gallery guard {h} {side}',edge,BASE+h,BASE+h+(1.08 if h<20 else .55))
    volume(roof,outline(step=step),BASE+20.80,BASE+20.86)

    # Rooms remain set back beneath the upper wings. The central link stays open.
    groundRanges=[(7.0,27.0),(49.0,LENGTH-6.0)]
    brick=part('brick ground rooms and piers','brick'); mortar=part('brick coursing','brick mortar')
    groundGlass=part('ground doors','blue glazing')
    frames=part('window frames','window metal')
    for start,end in groundRanges:
        fp=outline(start,end,6.0,-6.0,step)
        # Closed rooms, no invented interiors. Recessed door leaves are facade geometry.
        volume(brick,fp,BASE,BASE+4.88)
        if lod==0:collider(f'activity ground room {start}',fp,BASE,BASE+4.88)
        for side in [-1,1]:
            for s in range(math.ceil(start+2),int(end-1),5):
                q=[at(s-1.2,side*6.025,.1),at(s+1.2,side*6.025,.1),at(s+1.2,side*6.025,3.5),at(s-1.2,side*6.025,3.5)]
                groundGlass.face(q if side==-1 else list(reversed(q)))
                for a,b in zip(q,q[1:]+q[:1]):frames.beam(a,b,.065,.075)
                frames.beam(at(s,side*6.05,.12),at(s,side*6.05,3.5),.07,.07)
                if lod==0:
                    for h in [i*.16 for i in range(1,30)]:mortar.beam(at(start,side*6.01,h),at(end,side*6.01,h),.012,.012,False)
    columns=[2.1,9.0,16.0,23.0,30.4,47.5,55.0,62.0,69.0,LENGTH-2.1]
    for i,s in enumerate(columns):
        for side in [-1,1]:
            fp=outline(s-.26,s+.26,side*8.5-.30,side*8.5+.30,1)
            p=brick if s<27 or s>49 else white
            volume(p,fp,BASE,BASE+4.89)
            if lod==0:collider(f'activity arcade column {i} {side}',fp,BASE,BASE+4.89)
            if lod==0 and p==brick:
                for h in [i*.16 for i in range(1,30)]:
                    wall(mortar,fp,BASE+h,BASE+h+.013)
    # Upper enclosed volumes move behind alternating open balconies.
    def setbacks(f,s,side):
        if f==1:return 1.2
        if side==1:
            return (4.0 if s<48 else .7) if f==2 else (.7 if s<45 else 3.1)
        return (.8 if s<37 else 3.2) if f==2 else (3.2 if s<39 else .8)
    glassParts=[part('upper curtain walls','blue glazing'),part('upper curtain walls','blue glazing light')]
    frost=part('elongated frosted glass motifs','frosted diamonds')
    for f in [1,2,3]:
        z=5.2*f; body=outline(6.2,LENGTH-5.8,lambda s:HALF-setbacks(f,s,1),lambda s:-HALF+setbacks(f,s,-1),step)
        volume(part('enclosed floor shadow','reveal shadow'),body,BASE+z+.06,BASE+z+4.88)
        if lod==0:collider(f'activity upper rooms {f}',body,BASE+z+.06,BASE+z+4.88)
        for side in [-1,1]:
            count=math.ceil((LENGTH-12)/[1.25,1.65,2.3][lod]); bay=(LENGTH-12)/count
            for j in range(count):
                s=6.2+j*bay; e=s+bay
                t0=side*(HALF-setbacks(f,s,side)+.045);t1=side*(HALF-setbacks(f,e,side)+.045)
                p0,p1,p2,p3=at(s,t0,z+.66),at(e,t1,z+.66),at(e,t1,z+4.65),at(s,t0,z+4.65)
                glassParts[(j+f)%5==0].face([p0,p1,p2,p3] if side==-1 else [p3,p2,p1,p0])
                for a,b in [(p0,p3),(p0,p1),(p3,p2)]:frames.beam(a,b,.055,.07)
                if lod<2 and setbacks(f,(s+e)/2,side)<2:
                    t=(t0+t1)/2+side*.025
                    mid=s+bay*.5
                    frost.face([at(mid-bay*.34,t,z+.79),at(mid-.12,t,z+2.55),at(mid-bay*.34,t,z+4.53)])
                    frost.face([at(mid+bay*.34,t,z+.79),at(mid+.12,t,z+2.55),at(mid+bay*.34,t,z+4.53)])
                    # Operable lower light occupies only selected bays, as in the photos.
                    if j%3==1 and lod==0:
                        for a,b in [(at(s+.15,t,z+.82),at(e-.15,t,z+.82)),(at(s+.15,t,z+1.65),at(e-.15,t,z+1.65)),(at(s+.15,t,z+.82),at(s+.15,t,z+1.65)),(at(e-.15,t,z+.82),at(e-.15,t,z+1.65))]:frames.beam(a,b,.038,.04)
            # External guardrail: dark top rail and slender verticals above opaque edge.
            railPts=[at(i,side*(HALF-.24),z+1.08) for i in [LENGTH*j/max(1,int(LENGTH/[1.1,1.8,3][lod])) for j in range(max(1,int(LENGTH/[1.1,1.8,3][lod]))+1)]]
            for a,b in zip(railPts,railPts[1:]):rail.beam(a,b,.045,.045)
            for p in railPts:rail.beam((p[0],p[1],BASE+z+.53),p,.035,.035)
            for s in columns:
                fp=outline(s-.12,s+.12,side*(HALF-.7)-.12,side*(HALF-.7)+.12,1)
                volume(white,fp,BASE+z+.54,BASE+z+4.85)
    # Blank end wall retains a genuine square opening through the two upper levels.
    end=part('upper end wall with square opening','white warm ceramic')
    for t0,t1,z0,z1 in [(-HALF,-1.6,10.95,21.35),(1.6,HALF,10.95,21.35),(-1.6,1.6,10.95,14.15),(-1.6,1.6,17.35,21.35)]:
        fp=outline(-.1,.30,t1,t0,1);volume(end,fp,BASE+z0,BASE+z1)
        if lod==0:collider('activity square opening surround',fp,BASE+z0,BASE+z1)
    # White end parapet and modest roof service rooms from roof plan image14.
    for s0,s1,t0,t1,h in [(1.0,5.9,-5.9,2.5,1.0),(24,29,-3.8,-.5,1.0),(56,59,-2.0,.6,.8)]:
        fp=outline(s0,s1,t1,t0,1);volume(white,fp,BASE+20.86,BASE+20.8+h)
        volume(roof,fp,BASE+20.8+h,BASE+20.86+h)
        if lod==0:collider('activity roof service room',fp,BASE+20.86,BASE+20.86+h)
    if lod<2:
        seams=part('roof seams and panel joints','roof joints')
        for s in range(3,int(LENGTH),3):seams.beam(at(s,-HALF+.5,20.88),at(s,HALF-.5,20.88),.018,.015,False)
        for side in [-1,1]:
            for s in range(0,int(LENGTH),5):
                for h in [5.2,10.4,15.6,20.8]:seams.beam(at(s,side*(HALF+.185),h-.41),at(s,side*(HALF+.185),h+.51),.012,.014,False)
    # Return stair at the south end, open to the exterior; continuous ramp colliders.
    stair=part('south exterior return stairs','white warm ceramic'); hand=part('exterior stair handrails','rail')
    route=[]
    def quad_ramp(name,corners):
        if lod!=0:return
        # Physics uses Three.js X/Y/Z, unlike authoring X/depth/elevation.
        manifest['collisionMeshes'].append({'name':name,'position':[v for p in corners for v in [p[0],p[2],p[1]]],'index':[0,2,1,0,3,2]})
    for floor in range(3):
        h=floor*5.2
        for run in range(2):
            s0,s1=(1.0,2.8) if run==0 else (3.2,5.0)
            t0,t1=(-7.0,.2) if run==0 else (.2,-7.0)
            for i in range(18):
                lo=t0+(t1-t0)*i/18;hi=t0+(t1-t0)*(i+1)/18;top=h+run*2.6+(i+1)*2.6/18
                volume(stair,outline(s0,s1,max(lo,hi),min(lo,hi),1),BASE+top-.18,BASE+top)
            for s in [s0+.06,s1-.06]:
                a=at(s,t0,h+run*2.6+1);b=at(s,t1,h+(run+1)*2.6+1);hand.beam(a,b,.06,.06)
                quad_ramp(f'activity stair guard {floor}-{run}-{s}',[at(s,t0,h+run*2.6),at(s,t1,h+(run+1)*2.6),b,a])
                for j in range(7):
                    t=j/6;p=at(s,t0+(t1-t0)*t,h+run*2.6+2.6*t);hand.beam(p,(p[0],p[1],p[2]+1),.035,.035)
            quad_ramp(f'activity stair ramp {floor}-{run}',[at(s0,t0,h+run*2.6),at(s1,t0,h+run*2.6),at(s1,t1,h+(run+1)*2.6),at(s0,t1,h+(run+1)*2.6)])
        landing=outline(1.0,5.0,1.65,.2,1);volume(stair,landing,BASE+h+2.6-.22,BASE+h+2.6)
        if lod==0:
            collider(f'activity stair landing {floor}',landing,BASE+h+2.6-.22,BASE+h+2.6)
            for s,t,z in [(1.9,-7.8,h),(1.9,-7,h),(1.9,.2,h+2.6),(1.9,.85,h+2.6),(4.1,.85,h+2.6),(4.1,.2,h+2.6),(4.1,-7,h+5.2),(4.1,-7.8,h+5.2),(1.9,-7.8,h+5.2)]:route.append(at(s,t,z))
    if lod==0:manifest['stairRoute']=route

    # Terrain-following paving, continuous lawns, hedges and branch/leaf canopies.
    paving=part('site perimeter paving','pale paving');lawn=part('connected planted lawns','lawn');curb=part('planting curbs','white warm ceramic')
    for apron in D['landscape']['aprons']:
        a,b=apron['inner'],apron['outer'];ah,bh=apron['innerHeights'],apron['outerHeights']
        for i in range(len(a)):
            j=(i+1)%len(a);paving.face([(*a[i],ah[i]),(*a[j],ah[j]),(*b[j],bh[j]),(*b[i],bh[i])])
    for path in D['landscape']['paths']:part('courtyard circular path','walkway').face([(*p,h) for p,h in zip(path['footprint'],path['heights'])])
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
        if tree['type']=='palm-cluster':
            for k in range(3):
                ox=.48*math.cos(k*2.1);oz=.48*math.sin(k*2.1);top=Vector((x+ox,z+oz,y+h-k*.7));tube(bark,(x+ox,z+oz,y),top,.17,.095,8)
                for j in range([10,7,5][lod]):
                    angle=j*math.tau/[10,7,5][lod]+k;direction=Vector((math.cos(angle),math.sin(angle),0));side=Vector((-direction.y,direction.x,0))
                    def stem(t):return top+direction*(radius-.9)*t+Vector((0,0,math.sin(math.pi*t)*.8-.9*t))
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
    objects=[o for p in buckets.values() if (o:=p.finish(root))]
    for obj in objects:obj['placeId']='activity'
    bpy.ops.object.select_all(action='DESELECT')
    for o in coll.objects:o.hide_set(False);o.select_set(True)
    bpy.context.view_layer.objects.active=root
    file=OUT/f'activity-lod{lod}.glb'
    bpy.ops.export_scene.gltf(filepath=str(file),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_cameras=False,export_lights=False,export_yup=True)
    manifest['lods'].append({'file':file.name,'distance':[0,180,450][lod],'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects),'meshObjects':len(objects),'bytes':file.stat().st_size})
    coll.hide_render=lod!=0
    for o in coll.objects:o.hide_set(lod!=0)

# Studio floor is saved separately for previews and is never exported into campus assets.
preview=bpy.data.collections.new('Preview only');scene.collection.children.link(preview)
mat('Activity / studio ground',(.40,.45,.39),.95,0,'terrain')
floor=Part('Studio floor','Activity / studio ground',preview);floor.face([(-300,-300,BASE-.18),(300,-300,BASE-.18),(300,300,BASE-.18),(-300,300,BASE-.18)])
previewRoot=bpy.data.objects.new('Preview only root',None);preview.objects.link(previewRoot);floor.finish(previewRoot)
world=bpy.data.worlds.new('Activity daylight');scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.38,.46,.53,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65
light=bpy.data.lights.new('Sun','SUN');light.energy=3;light.angle=.12
sun=bpy.data.objects.new('Sun',light);scene.collection.objects.link(sun);sun.rotation_euler=(.6,-.4,-.8)
camdata=bpy.data.cameras.new('Activity review camera');cam=bpy.data.objects.new('Activity review camera',camdata);scene.collection.objects.link(cam);scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=40;scene.cycles.use_denoising=True
scene.render.resolution_x=1500;scene.render.resolution_y=1050;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
def camera(name):
    view=D['views'][name];p=view['position'];t=view['target'];cam.location=xyz((p[0],p[2],p[1]));target=Vector(xyz((t[0],t[2],t[1])));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();camdata.lens=36/(2*math.tan(math.radians(view['fov'])/2))*1050/1500
camera('overall');scene['sources']=json.dumps(D['sources']);scene['evidence']=json.dumps(D['evidence'])
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'activity.blend'),compress=True)
(OUT/'activity.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print('ACTIVITY_COMPLETE',json.dumps(manifest['lods']))
if '--render' in sys.argv:
    for name in ['overall','front','arcade','landscape']:
        camera(name);scene.render.filepath=str(HERE/(name+'.png'));bpy.ops.render.render(write_still=True)
