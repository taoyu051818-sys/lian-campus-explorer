"""Photo-informed student living two; four courtyard groups, open ring and tapered pavilion."""
import bpy,json,math,random,sys
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'common'))
from geometry import Part,mat,MATS,xyz,wall,cap,area,inset,strip
ROOT=Path(__file__).resolve().parents[2];HERE=Path(__file__).parent;OUT=ROOT/'public/models/dorm52';OUT.mkdir(parents=True,exist_ok=True)
D=json.loads((HERE/'design.json').read_text());bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.unit_settings.system='METRIC'
materials=[('ivory metal',(.61,.64,.61),.68,.03,'paint'),('room plaster',(.40,.45,.43),.9,0,'plaster'),('brick',(.32,.095,.045),.88,0,'ceramic'),('brick light',(.40,.14,.075),.9,0,'ceramic'),('window',(.035,.09,.105),.22,.18,'glass'),('glass rail',(.24,.38,.42),.2,.1,'glass'),('gallery rail',(.65,.71,.71),.38,.6,'metal'),('bronze louver',(.25,.17,.105),.63,.22,'metal'),('cyan',(.025,.43,.61),.51,.15,'paint'),('rose',(.66,.18,.24),.6,.05,'paint'),('lime',(.43,.60,.095),.6,.05,'paint'),('roof',(.40,.43,.40),.98,0,'roofMetal'),('pipe',(.52,.11,.025),.7,.1,'metal'),('stone base',(.18,.205,.20),.96,0,'stone'),('pale paving',(.52,.56,.54),.98,0,'paving'),('lawn',(.17,.27,.045),.99,0,'foliage'),('bark',(.23,.17,.09),.93,0,'bark'),('leaf shadow',(.05,.16,.025),.92,0,'foliage'),('leaf light',(.17,.29,.04),.9,0,'foliage'),('hedge',(.095,.23,.035),.97,0,'foliage'),('timber',(.30,.19,.075),.9,0,'wood')]
for a in materials:mat('DORM52 / '+a[0],*a[1:])
rail=MATS['DORM52 / glass rail'];rail.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value=.52;rail.diffuse_color=(*rail.diffuse_color[:3],.52);rail.surface_render_method='DITHERED'
for key in ['leaf shadow','leaf light','glass rail']:MATS['DORM52 / '+key].use_backface_culling=False
manifest={k:D[k] for k in ['asset','name','anchor','base','fixedTerrainBase','yaw','sources','evidence','views','review','landscape','height']};manifest.update(lods=[],collisionVolumes=[],collisionMeshes=[],canopyBounds=[])
def volume(p,fp,lo,hi):
 if area(fp)<0:fp=list(reversed(fp))
 wall(p,fp,lo,hi);cap(p,fp,hi);cap(p,list(reversed(fp)),lo)
def collider(name,fp,lo,hi):manifest['collisionVolumes'].append({'name':name,'footprint':fp,'base':lo,'height':hi-lo})
def rect(x,z,w,d):return [(x-w/2,z-d/2),(x+w/2,z-d/2),(x+w/2,z+d/2),(x-w/2,z+d/2)]
def circle(c,r,n=48):return [(c[0]+r*math.cos(i*math.tau/n),c[1]+r*math.sin(i*math.tau/n)) for i in range(n)]
def tube(part,a,b,r0,r1,n=8):
 a,b=Vector(a),Vector(b);dv=(b-a).normalized();ref=Vector((0,0,1)) if abs(dv.z)<.92 else Vector((1,0,0));u=dv.cross(ref).normalized();v=dv.cross(u).normalized()
 ra=[a+r0*(u*math.cos(i*math.tau/n)+v*math.sin(i*math.tau/n)) for i in range(n)];rb=[b+r1*(u*math.cos(i*math.tau/n)+v*math.sin(i*math.tau/n)) for i in range(n)]
 for i in range(n):j=(i+1)%n;part.face([ra[i],ra[j],rb[j],rb[i]])
 part.face(list(reversed(ra)));part.face(rb)
def ellipsoid(part,c,size,n=10,rings=6):
 for j in range(rings):
  a=-math.pi/2+math.pi*j/rings;b=-math.pi/2+math.pi*(j+1)/rings
  def p(t,ang):return(c[0]+size[0]*math.cos(t)*math.cos(ang),c[1]+size[1]*math.cos(t)*math.sin(ang),c[2]+size[2]*math.sin(t))
  for i in range(n):
   t=i*math.tau/n;q=(i+1)*math.tau/n
   if j==0:part.face([p(a,t),p(b,q),p(b,t)])
   elif j==rings-1:part.face([p(a,t),p(a,q),p(b,t)])
   else:part.face([p(a,t),p(a,q),p(b,q),p(b,t)])
G=D['groundFloor'];FH=D['floorHeight'];H=FH*D['floors']
for lod in range(3):
 random.seed(520);coll=bpy.data.collections.new(f'DORM52 LOD{lod}');scene.collection.children.link(coll);root=bpy.data.objects.new(f'DORM52 {lod}',None);coll.objects.link(root);root['placeId']='dorm52';buckets={}
 def part(name,material):
  key=(name,material)
  if key not in buckets:buckets[key]=Part(name+' | '+material,'DORM52 / '+material,coll)
  return buckets[key]
 white=part('white balcony slabs and piers','ivory metal');core=part('recessed dormitory rooms','room plaster');roof=part('flat roofs and parapets','roof');glass=part('recessed windows','window');railing=part('open gallery metal balustrades','gallery rail');balcony=part('private balcony glass panels','glass rail');slats=part('brown balcony privacy louvers','bronze louver');pipes=part('gallery exposed service pipes','pipe');brick=part('red brick stair cores','brick');stone=part('dark stone ground plinth','stone base')
 for wi,b in enumerate(D['wings']):
  fp=b['footprint'];inner=inset(fp,1.65);volume(core,inner,G-.1,G+H-.22);volume(stone,fp,-.55,G)
  if lod==0:collider(b['id']+' rooms',inner,G-.1,G+H);collider(b['id']+' ground plinth',fp,-.55,G)
  for f in range(7):
   volume(white,fp,G+f*FH-.22,G+f*FH)
   if lod==0:collider(b['id']+' floor '+str(f),fp,G+f*FH-.22,G+f*FH)
  strip(white,fp,inset(fp,.17),G+H,G+H+.48)
  volume(roof,inset(fp,.2),G+H-.03,G+H+.01)
  for ei,(a,bp) in enumerate(zip(fp,fp[1:]+fp[:1])):
   a=Vector(a);end=Vector(bp);dv=end-a;length=dv.length;dv.normalize();normal=Vector((dv.y,-dv.x));face=['north','east','south','west'][ei];private=face==b['outward'];count=max(1,round(length/3.3));bay=length/count
   if length<13:
    volume(white,[tuple(a+normal*.015),tuple(end+normal*.015),tuple(end-normal*.18),tuple(a-normal*.18)],G,G+H)
    continue
   # The private balcony fronts and courtyard access galleries have different railings.
   for j in range(count+1):
    p=a+dv*j*bay;white.beam((*p,G),(*p,G+H),.19,.35)
    if lod==0:collider(b['id']+f' pier {ei}/{j}',rect(*p,.23,.39),G,G+H)
   for f in range(6):
    lo=G+f*FH;hi=lo+FH-.24
    pa=a-normal*1.625;pb=end-normal*1.625
    for j in range(count):
     left=pa+dv*(j*bay+.55);right=pa+dv*((j+1)*bay-.55);glass.face([(*left,lo+.72),(*right,lo+.72),(*right,hi-.55),(*left,hi-.55)])
     if lod<2:
      railing.beam((*left,lo+.72),(*left,hi-.55),.045,.045);railing.beam((*right,lo+.72),(*right,hi-.55),.045,.045);railing.beam((*left,lo+1.75),(*right,lo+1.75),.04,.04)
     if f>0 and private:
      p=a+dv*(j*bay+.17)+normal*.025;q=a+dv*((j+1)*bay-.17)+normal*.025;balcony.face([(*p,lo+.23),(*q,lo+.23),(*q,lo+1.04),(*p,lo+1.04)])
     if private and lod<2 and j%3==1:
      p=a+dv*(j*bay+.18)
      for n in range(7 if lod==0 else 4):
       q=p+dv*n*.115*(1 if lod==0 else 2);slats.beam((*q,lo+.15),(*q,hi-.08),.055,.15)
    if f>0:
     railing.beam((*a,lo+1.1),(*end,lo+1.1),.045,.045);railing.beam((*a,lo+.22),(*end,lo+.22),.036,.036)
     if not private:
      for j in range(math.ceil(length/(.21 if lod==0 else .48 if lod==1 else .85))+1):
       p=a+dv*min(length,j*(.21 if lod==0 else .48 if lod==1 else .85));railing.beam((*p,lo+.22),(*p,lo+1.1),.026,.026)
     if lod==0:
      guard=[tuple(a-normal*.055),tuple(end-normal*.055),tuple(end+normal*.055),tuple(a+normal*.055)];collider(b['id']+f' balcony guard {ei}/{f}',guard,lo+.15,lo+1.12)
    if not private and lod<2:pipes.beam((*(a-normal*.35),hi-.18),(*(end-normal*.35),hi-.18),.045,.045)
   if private:
    accent=part('two storey coloured balcony frames',b['color'])
    for j in range(1,count-1,5):
     lo=G+FH*(1 if j%2 else 3);p=a+dv*(j*bay+.02)+normal*.16;q=p+dv*(bay*1.9)
     accent.beam((*p,lo),(*p,lo+2*FH),.28,.32);accent.beam((*q,lo),(*q,lo+2*FH),.28,.32)
     for h in [lo,lo+2*FH]:accent.beam((*p,h),(*q,h),.30,.30)
  # Brick service/stair core is an enclosed segment, with actual mortar bands in close LOD.
  if wi%5==2:
   x,z=b['center'];w,d=b['width']+ .12,5.2;fpst=rect(x,z,w,d);volume(brick,fpst,G,G+H+.9)
   if lod==0:
    for row in range(105):
     h=G+row*.21;p=part('brick stair horizontal mortar joints','brick light');p.beam((x-w/2-.01,z-d/2,h),(x+w/2+.01,z-d/2,h),.025,.018)
   volume(white,rect(x,z,w+.22,d+.22),G+H+.9,G+H+1.06)
  # Rooftop service boxes and dark collectors visible in the aerial; their count is approximate.
  if wi%5 in [0,1]:
   x,z=b['center'];volume(core,rect(x+15,z,5,4),G+H,G+H+1.1)
   solar=part('roof collector arrays','window')
   for col in range(12 if lod<2 else 6):
    xx=x-24+col*(3.2 if lod<2 else 6.4);solar.face([(xx,z-2,G+H+.15),(xx+2.7,z-2,G+H+.15),(xx+2.7,z+1,G+H+.85),(xx,z+1,G+H+.85)])
 # A low open ring connects the courtyards; the lawn and pavilion remain open to the sky.
 ring=part('three level open shared ring slabs','ivory metal');rg=D['shared'];N=[128,96,64][lod];outer=circle((0,0),rg['outerRadius'],N);inner=circle((0,0),rg['innerRadius'],N)
 for f in range(4):
  h=G+f*FH;strip(ring,outer,inner,h-.22,h)
  if lod==0:
   for i in range(N):j=(i+1)%N;collider(f'shared gallery floor {f}/{i}',[outer[i],outer[j],inner[j],inner[i]],h-.22,h)
  if f in [1,2]:
   for r in [rg['outerRadius']-.12,rg['innerRadius']+.12]:
    pts=circle((0,0),r,N)
    for i in range(N):
     j=(i+1)%N;railing.beam((*pts[i],h+1.05),(*pts[j],h+1.05),.04,.04);railing.beam((*pts[i],h+.18),(*pts[j],h+.18),.035,.035)
     for t in ([0,.5] if lod==0 else [0]):p=Vector(pts[i]).lerp(Vector(pts[j]),t);railing.beam((*p,h+.18),(*p,h+1.05),.027,.027)
     if lod==0:collider(f'shared gallery guard {f}/{r}/{i}',[pts[i],pts[j],tuple(Vector(pts[j])*.998),tuple(Vector(pts[i])*.998)],h+.18,h+1.05)
 for j in range(24):
  an=(j+.5)*math.tau/24
  for r in [17.4,21.6]:
   p=(r*math.cos(an),r*math.sin(an));ring.beam((*p,G),(*p,G+FH*3),.26,.30)
   if lod==0:collider(f'shared ring column {r}/{j}',rect(*p,.3,.34),G,G+FH*3)
 # The tapered pavilion is faceted glazing with mullion rings and an offset top.
 cn=D['cone'];N=[40,32,24][lod];gl=part('tapered shared glass pavilion','window');frames=part('pavilion curved mullion rings','gallery rail')
 def cp(i,t):
  a=i*math.tau/N;r=cn['radius']+(cn['topRadius']-cn['radius'])*t;c=[cn['center'][k]+(cn['topCenter'][k]-cn['center'][k])*t for k in [0,1]];return(c[0]+r*math.cos(a),c[1]+r*math.sin(a),G+cn['height']*t)
 for j in range(6):
  for i in range(N):
   p,q,r,t=cp(i,j/6),cp(i+1,j/6),cp(i+1,(j+1)/6),cp(i,(j+1)/6);gl.face([p,q,r,t]);frames.beam(p,q,.055,.06)
 for i in range(N):frames.beam(cp(i,0),cp(i,1),.07,.07);frames.beam(cp(i,1),cp(i+1,1),.06,.06)
 cap(gl,circle(cn['topCenter'],cn['topRadius'],N),G+cn['height'])
 if lod==0:collider('enclosed glazed pavilion',circle(cn['center'],cn['radius'],40),G-.1,G+cn['height'])
 # Terrain-draped paths and islands share the exact campus triangles.
 paving=part('continuous courtyard paving','pale paving');lawn=part('courtyard and perimeter planted lawns','lawn');curb=part('low planting curbs','ivory metal')
 for rec in D['landscape']['paths']+D['landscape']['beds']:
  target=lawn if 'heights' in rec else paving;pos=rec['position'];idx=rec['index']
  for j in range(0,len(idx),3):target.face([(pos[3*i],pos[3*i+2],pos[3*i+1]) for i in idx[j:j+3]])
 for bed in D['landscape']['beds']:
  fp=bed['footprint'];ys=bed['heights']
  for i in range(len(fp)):j=(i+1)%len(fp);curb.beam((*fp[i],ys[i]+.03),(*fp[j],ys[j]+.03),.10,.10)
 hedge=part('low courtyard hedges','hedge')
 for shrub in D['landscape']['shrubs']:
  x,z=shrub['point'];ellipsoid(hedge,(x,z,shrub['y']),(shrub['radius'],shrub['radius']*.8,.36),[8,6,5][lod],[5,4,3][lod])
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

 objects=[o for p in buckets.values() if (o:=p.finish(root))]
 for obj in objects:obj['placeId']='dorm52'
 bpy.ops.object.select_all(action='DESELECT')
 for o in coll.objects:o.hide_set(False);o.select_set(True)
 bpy.context.view_layer.objects.active=root;file=OUT/f'dorm52-lod{lod}.glb'
 bpy.ops.export_scene.gltf(filepath=str(file),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_cameras=False,export_lights=False,export_yup=True)
 manifest['lods'].append({'file':file.name,'distance':[0,300,750][lod],'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects),'meshObjects':len(objects),'bytes':file.stat().st_size})
 coll.hide_render=lod!=0
 for o in coll.objects:o.hide_set(lod!=0)
preview=bpy.data.collections.new('Preview only');scene.collection.children.link(preview);pr=bpy.data.objects.new('Preview root',None);preview.objects.link(pr)
mat('DORM52 / terrain',(.36,.40,.32),.95,0,'terrain');floor=Part('site terrain','DORM52 / terrain',preview)
p=D['landscape']['terrain']['position'];ind=D['landscape']['terrain']['index']
for j in range(0,len(ind),3):floor.face([(p[3*i],p[3*i+2],p[3*i+1]) for i in reversed(ind[j:j+3])])
floor.finish(pr)
world=bpy.data.worlds.new('Daylight');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.38,.46,.53,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65
light=bpy.data.lights.new('Sun','SUN');light.energy=3;light.angle=.12;sun=bpy.data.objects.new('Sun',light);scene.collection.objects.link(sun);sun.rotation_euler=(.6,-.4,-.8)
camdata=bpy.data.cameras.new('Review camera');cam=bpy.data.objects.new('Review camera',camdata);scene.collection.objects.link(cam);scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.resolution_x=1500;scene.render.resolution_y=1050;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
def camera(name):
 view=D['views'][name];p=view['position'];t=view['target'];cam.location=xyz((p[0],p[2],p[1]));target=Vector(xyz((t[0],t[2],t[1])));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();camdata.lens=36/(2*math.tan(math.radians(view['fov'])/2))*1050/1500
camera('overall');scene['sources']=json.dumps(D['sources']);scene['evidence']=json.dumps(D['evidence']);bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'dorm52.blend'),compress=True)
(OUT/'dorm52.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n');print('DORM52_COMPLETE',json.dumps(manifest['lods']))
if '--render' in sys.argv:
 for name in ['overall','front','landscape','shared']:
  camera(name);scene.render.filepath=str(HERE/(name+'.png'));bpy.ops.render.render(write_still=True)
