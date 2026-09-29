"""Photo/plan referenced sports complex, Blender 4.5 LTS. Metres; editable mesh groups."""
import bpy,json,math,sys,random
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'common'))
from geometry import Part,mat,MATS,xyz,inset,band,cap,wall,strip
ROOT=Path(__file__).resolve().parents[2];HERE=Path(__file__).parent;OUT=ROOT/'public/models/sports';OUT.mkdir(parents=True,exist_ok=True)
D=json.loads((HERE/'design.json').read_text());random.seed(431)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
 if c.name!='Collection':bpy.data.collections.remove(c)
scene=bpy.context.scene;scene.unit_settings.system='METRIC'
for args in [('ivory metal',(.84,.85,.80),.42,.12,'metal'),('silver shell',(.43,.50,.53),.30,.72,'metal'),('roof seams',(.26,.32,.34),.4,.6,'metal'),('dark glazing',(.055,.13,.16),.18,.05,'glass'),('limestone',(.53,.53,.48),.87,0,'stone'),('pale paving',(.57,.58,.55),.92,0,'stone'),('ochre path',(.58,.36,.055),.86,0,'paving'),('court green',(.085,.28,.17),.89,0,'paint'),('court lines',(.72,.75,.65),.8,0,'paint'),('dark frame',(.055,.065,.062),.42,.5,'metal'),('lawn',(.15,.23,.055),.96,0,'foliage'),('bark',(.27,.19,.10),.96,0,'bark'),('leaves',(.10,.23,.045),.84,0,'foliage'),('leaves light',(.20,.32,.065),.9,0,'foliage'),('shrubs',(.13,.20,.042),.91,0,'foliage')]:mat('Sports / '+args[0],*args[1:])
for key in ['leaves','leaves light','shrubs']:MATS['Sports / '+key].use_backface_culling=False
# Far screens use packed, original procedural tiles; near screens have actual openings.
image=bpy.data.images.load(str(ROOT/'public/models/library/screen-baked.png'));image.pack()
m=mat('Sports / distant maze',(.8,.8,.8),.5,.1,'metal');t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=image;m.node_tree.links.new(t.outputs['Color'],m.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
# Part's UV layer is enabled for both reusable baked-screen materials below.
PartBase=Part.finish
def finish_uv(self,parent):
 o=PartBase(self,parent)
 if o and ('distant maze' in self.material):
  uv=o.data.uv_layers.new(name='UVMap')
  for poly,coords in zip(o.data.polygons,self.uv):
   for loop,co in zip(poly.loop_indices,coords):uv.data[loop].uv=co
 return o
Part.finish=finish_uv

def transform(b,u,v,h):
 a=math.radians(b['angle']);c=math.cos(a);s=math.sin(a)
 return(b['center'][0]+u*c-v*s,b['center'][1]+u*s+v*c,b['base']+h)
def rounded(b,w=None,d=None,r=None,n=16):
 w=w or b['width'];d=d or b['depth'];r=r or b['radius'];poly=[]
 for x,z,start in [(w/2-r,d/2-r,0),(-w/2+r,d/2-r,90),(-w/2+r,-d/2+r,180),(w/2-r,-d/2+r,270)]:
  for i in range(n):
   a=math.radians(start+i*90/n);poly.append(transform(b,x+r*math.cos(a),z+r*math.sin(a),0)[:2])
 return poly

def perimeter(poly):
 lengths=[0]
 for a,b in zip(poly,poly[1:]+poly[:1]):lengths.append(lengths[-1]+math.dist(a,b))
 def at(s,h,offset=0):
  s%=lengths[-1];i=next((j for j in range(len(poly)) if lengths[j+1]>=s),len(poly)-1)
  t=(s-lengths[i])/(lengths[i+1]-lengths[i]);a=poly[i];b=poly[(i+1)%len(poly)];l=math.dist(a,b)
  return(a[0]+(b[0]-a[0])*t+(b[1]-a[1])*offset/l,a[1]+(b[1]-a[1])*t-(b[0]-a[0])*offset/l,h)
 return at,lengths[-1]

def frustum(part,a,b,r0,r1,sides=8):
 a=Vector(a);b=Vector(b);axis=(b-a).normalized();ref=Vector((0,0,1)) if abs(axis.z)<.95 else Vector((1,0,0));u=axis.cross(ref).normalized();v=axis.cross(u).normalized()
 ring0=[a+r0*(u*math.cos(i*math.tau/sides)+v*math.sin(i*math.tau/sides)) for i in range(sides)]
 ring1=[b+r1*(u*math.cos(i*math.tau/sides)+v*math.sin(i*math.tau/sides)) for i in range(sides)]
 for i in range(sides):j=(i+1)%sides;part.face([ring0[i],ring0[j],ring1[j],ring1[i]])
 part.face(list(reversed(ring0)));part.face(ring1)

def ellipsoid(part,c,r,n=10,m=6):
 for j in range(m):
  a=-math.pi/2+j*math.pi/m;b=-math.pi/2+(j+1)*math.pi/m
  for i in range(n):
   p=i*math.tau/n;q=(i+1)*math.tau/n
   def pt(t,s):return(c[0]+r[0]*math.cos(t)*math.cos(s),c[1]+r[1]*math.cos(t)*math.sin(s),c[2]+r[2]*math.sin(t))
   pts=[pt(a,p),pt(a,q),pt(b,q),pt(b,p)]
   if j==0:pts=[pts[0],pts[2],pts[3]]
   if j==m-1:pts=pts[:3]
   part.face(pts)

manifest={k:D[k] for k in ['asset','name','anchor','base','yaw','sources','evidence','views']};manifest.update(schema=1,revision=1,lods=[],collisionVolumes=[],collisionMeshes=[],landscape=D['landscape'])
for lod in range(3):
 coll=bpy.data.collections.new(f'Sports LOD{lod}');scene.collection.children.link(coll);root=bpy.data.objects.new(f'Sports_LOD{lod}',None);coll.objects.link(root);buckets={}
 def part(sec,m):
  key=(sec,m)
  if key not in buckets:buckets[key]=Part(sec+' | '+m,'Sports / '+m,coll)
  return buckets[key]
 for b in D['blocks']:
  sec=b['id'];w=b['width'];d=b['depth'];h=b['height'];base=b['base'];poly=rounded(b,n=[24,12,6][lod]);at,length=perimeter(poly)
  ivory=part(sec+' shell','ivory metal');glass=part(sec+' glazing','dark glazing');metal=part(sec+' roof','silver shell');frame=part(sec+' frames','dark frame')
  band(ivory,poly,base,.5,.12)
  if sec!='annex':
   wall(glass,inset(poly,.50),base+.35,base+(22.8 if sec=='gym' else h-.4))
   cap(part(sec+' plinth','limestone'),inset(poly,.1),base+.02)
   # Recessed vertical mullions make the base glazing read as a separate layer.
   for i in range(round(length/3.2)):
    p=at(i*length/round(length/3.2),base+.3,-.44);q=(*p[:2],base+4.1);frame.beam(p,q,.08,.12)
  if sec=='pool':
   # Real hexagonal apertures in a white cellular skin, leaving a central metal wrap.
   radius=[1.42,1.75,2.6][lod];step=math.sqrt(3)*radius;rows=int((h-1.7)/(radius*1.5));cols=round(length/step);step=length/cols
   skin=part('pool perforated panels','ivory metal');reveals=part('pool aperture reveals','silver shell')
   for row in range(rows):
    y=base+1.05+radius+row*radius*1.5
    for j in range(cols):
     arc=(j+(row%2)*.5)*step;p=at(arc,y);a=math.radians(b['angle']);dx=p[0]-b['center'][0];dz=p[1]-b['center'][1];u=dx*math.cos(a)+dz*math.sin(a);v=-dx*math.sin(a)+dz*math.cos(a)
     if v< -d*.42 and abs(u)<14.4:continue
     hole=radius*(.22+.36*(.5+.5*math.sin(j*1.9+row*.9)))
     outer=[(arc+radius*math.cos(math.pi/6+i*math.tau/6),y+radius*math.sin(math.pi/6+i*math.tau/6)) for i in range(6)]
     inner=[(arc+hole*math.cos(math.pi/6+i*math.tau/6),y+hole*math.sin(math.pi/6+i*math.tau/6)) for i in range(6)]
     for i in range(6):
      k=(i+1)%6;skin.face([at(*outer[i]),at(*outer[k]),at(*inner[k]),at(*inner[i])])
      if lod<2:reveals.face([at(*inner[i]),at(*inner[k]),at(*inner[k],-.18),at(*inner[i],-.18)])
   band(ivory,poly,base+h-.55,.55,.12)
   # Continuous metal wrap: front vertical face turns through a quarter-circle over the roof.
   hood=part('pool central curved wrap','silver shell');seams=part('pool wrap standing seams','roof seams')
   section=[(-d/2-5.3,.4),(-d/2-5.3,16.9)]
   section += [(-d/2-5.3+7.6*(1-math.cos(i*math.pi/2/20)),16.9+7.6*math.sin(i*math.pi/2/20)) for i in range(1,21)]
   section.append((-d/2+14,24.5))
   for x0,x1 in [(-14,-.25),(.25,14)]:
    for (z0,y0),(z1,y1) in zip(section,section[1:]):hood.face([transform(b,x0,z0,y0),transform(b,x1,z0,y0),transform(b,x1,z1,y1),transform(b,x0,z1,y1)])
   for i in range(0,29,1 if lod==0 else 2 if lod==1 else 4):
    x=-14+i
    for (z0,y0),(z1,y1) in zip(section,section[1:]):seams.beam(transform(b,x,z0-.02,y0+.025),transform(b,x,z1-.02,y1+.025),.045,.075)
   if lod==0:manifest['collisionVolumes'].append({'name':'sports pool entrance wrap','footprint':[transform(b,u,v,0)[:2] for u,v in [(-14,-d/2-5.3),(14,-d/2-5.3),(14,-d/2+14),(-14,-d/2+14)]],'height':24.5,'base':base})
   roofpoly=inset(poly,1.25);cap(metal,roofpoly,base+23.0)
   for u in range(-40,41,2 if lod<2 else 5):
    if abs(u)<14:continue
    metal.beam(transform(b,u,-d/2+9,23.03),transform(b,u,d/2-9,23.03),.05,.07)
  elif sec=='gym':
   band(ivory,poly,base+4.3,.48,.5);band(ivory,poly,base+22.65,.48,.5)
   lattice=part('gym geometric screen','ivory metal');bays=round(length/3.8);bay=length/bays;screenLo=base+4.9;screenHi=base+22.65
   if lod==2:wall(part('gym distant screen','distant maze'),poly,screenLo,screenHi,tile=3.8)
   else:
    for j in range(bays):
     s=(j+.5)*bay
     for row in range(5):
      y=screenLo+1.75+row*3.45
      for ring,f in enumerate([1,.72,.42] if lod==0 else [1,.58]):
       pts=[(s-bay*.5*f,y),(s,y+1.65*f),(s+bay*.5*f,y),(s,y-1.65*f)]
       for edge,(a,z) in enumerate(zip(pts,pts[1:]+pts[:1])):
        if ring==1 and edge==(j+row)%4:continue
        lattice.beam(at(a[0],max(screenLo,min(screenHi,a[1]))),at(z[0],max(screenLo,min(screenHi,z[1]))),.14,.18,False)
   # Upper hall volume is set back from the outer screen; the old full-height patterned box is removed.
   inner=inset(poly,5.2);wall(ivory,inner,base+22.8,base+h);cap(metal,inset(inner,.7),base+h-.42);band(ivory,inner,base+h-.32,.32,.12)
   innerAt,L=perimeter(inner)
   for j in range(round(L/5)):
    s0=(j+.1)*L/round(L/5);s1=(j+.8)*L/round(L/5)
    glass.face([innerAt(s0,base+26.6,.025),innerAt(s1,base+26.6,.025),innerAt(s1,base+28,.025),innerAt(s0,base+28,.025)])
   for u in range(-32,33,2 if lod<2 else 5):metal.beam(transform(b,u,-d/2+12,h-.39),transform(b,u,d/2-12,h-.39),.045,.075)
   # Broad quadrant stair outside the southwest rounded corner.
   center=(-w/2+b['radius'],-d/2+b['radius']);count=36;innerR=8;outerR=24;rise=6.3
   stairs=part('gym curved entry stairs','limestone')
   def stairpt(radius,theta,elev):return transform(b,center[0]+radius*math.cos(theta),center[1]+radius*math.sin(theta),elev)
   for step in range(count):
    r0=outerR-(outerR-innerR)*step/count;r1=outerR-(outerR-innerR)*(step+1)/count;z=rise*(step+1)/count
    for i in range([32,20,12][lod]):
     a=math.pi+i*math.pi/2/[32,20,12][lod];c=a+math.pi/2/[32,20,12][lod]
     stairs.face([stairpt(r0,a,z),stairpt(r0,c,z),stairpt(r1,c,z),stairpt(r1,a,z)])
     stairs.face([stairpt(r0,a,z-rise/count),stairpt(r0,c,z-rise/count),stairpt(r0,c,z),stairpt(r0,a,z)])
   rails=part('gym stair rails','silver shell')
   for theta in [math.pi,math.pi*1.25,math.pi*1.5]:
    rails.beam(stairpt(outerR,theta,1.05),stairpt(innerR,theta,rise+1.05),.055)
    for i in range(9):
     r=outerR-(outerR-innerR)*i/8;z=rise*i/8;rails.beam(stairpt(r,theta,z),stairpt(r,theta,z+1.05),.045)
   if lod==0:
    positions=[];indices=[]
    for i in range(33):
     theta=math.pi+i*math.pi/64
     for radius,z in [(outerR,0),(innerR,rise)]:
      x,depth,elev=stairpt(radius,theta,z);positions += [x,elev,depth]
    for i in range(32):a=i*2;indices += [a,a+1,a+2,a+1,a+3,a+2]
    manifest['collisionMeshes'].append({'name':'sports curved stair ramp','position':positions,'index':indices})
    manifest['stairRoute']=[list(stairpt(radius,math.pi*1.25,z)) for radius,z in [(25,0),(24,0),(9,5.90625)]]
  else:
   # Each panel is either solid or a true recessed lens window, rather than a decal.
   panels=part('annex cladding','silver shell');N=round(length/7.5);panelW=length/N
   for row in range(3):
    lo=base+row*h/3;hi=base+(row+1)*h/3
    for j in range(N):
     s0=j*panelW;s1=(j+1)*panelW;mid=(s0+s1)/2
     if row==0 or j%8!=(row*3)%8:
      panels.face([at(s0,lo),at(s1,lo),at(s1,hi),at(s0,hi)]);continue
     yc=(lo+hi)/2;wh=panelW*.44;hh=.9
     angles=sorted(set([i*math.tau/24 for i in range(24)]+[math.atan2(v*(hi-lo)/2,u*panelW/2)%math.tau for u,v in [(1,1),(-1,1),(-1,-1),(1,-1)]]))
     outer=[];hole=[]
     for a in angles:
      dx=math.cos(a);dy=math.sin(a);scale=1/max(abs(dx)/(panelW/2),abs(dy)/((hi-lo)/2));outer.append((mid+dx*scale,yc+dy*scale));hole.append((mid+wh*dx,yc+hh*dy*(.75+.25*dx)))
     for i in range(len(angles)):
      k=(i+1)%len(angles);panels.face([at(*outer[i]),at(*outer[k]),at(*hole[k]),at(*hole[i])]);frame.face([at(*hole[i]),at(*hole[k]),at(*hole[k],-.22),at(*hole[i],-.22)])
     glass.face([at(s0,lo,-.25),at(s1,lo,-.25),at(s1,hi,-.25),at(s0,hi,-.25)])
   if lod<2:
    seams=part('annex metal joints','roof seams')
    for j in range(round(length/1.25)):seams.beam(at(j*1.25,base+.1,.014),at(j*1.25,base+h-.15,.014),.025,.02)
   cap(part('annex rooftop court','court green'),inset(poly,1.2),base+h+.02);band(ivory,poly,base+h-.25,.28,.1)
   court=part('annex court boundary','court lines');net=part('annex court fence','dark frame');fence=inset(poly,1.2);fa,L=perimeter(fence)
   for j in range(round(L/3.5)):net.beam(fa(j*L/round(L/3.5),base+h),fa(j*L/round(L/3.5),base+h+3),.07)
   for elev in [h+.1,h+3] if lod==2 else [h+.1,h+.8,h+1.6,h+2.3,h+3]:
    for a,bp in zip(fence,fence[1:]+fence[:1]):net.beam((*a,base+elev),(*bp,base+elev),.025)
   if lod==0:
    for j in range(round(L/.65)):net.beam(fa(j*.65,base+h),fa(j*.65,base+h+3),.009)
   for x in [-14,14]:
    rect=[(x-12,-7),(x+12,-7),(x+12,7),(x-12,7)]
    for a,c in zip(rect,rect[1:]+rect[:1]):court.beam(transform(b,*a,h+.045),transform(b,*c,h+.045),.055,.012)
  if lod==0:manifest['collisionVolumes'].append({'name':'sports '+sec,'footprint':rounded(b,n=8),'height':b['height'],'base':base})
 # Pavement follows the sampled terrain instead of floating at a single building datum.
 for apron in D['landscape']['aprons']:
  paving=part('site perimeter paving','pale paving')
  for i in range(len(apron['inner'])):
   j=(i+1)%len(apron['inner']);paving.face([(*apron['inner'][i],apron['innerHeights'][i]),(*apron['inner'][j],apron['innerHeights'][j]),(*apron['outer'][j],apron['outerHeights'][j]),(*apron['outer'][i],apron['outerHeights'][i])])
 for path in D['landscape']['paths']:part('pool ochre garden path','ochre path').face([(*p,h) for p,h in zip(path['footprint'],path['heights'])])
 # Site planting is authored together with each building and follows the campus terrain.
 for bed in D['landscape']['beds']:
  lawn=part('site lawn islands','lawn');curb=part('site lawn edges','limestone');center=(*bed['center'],bed['y'])
  fp=bed['footprint'];ys=bed['heights']
  for i in range(len(fp)):
   j=(i+1)%len(fp);lawn.face([center,(*fp[i],ys[i]),(*fp[j],ys[j])]);curb.beam((*fp[i],ys[i]-.01),(*fp[j],ys[j]-.01),.10,.10)
  if lod<2:
   shrubs=part('site shrub clusters','shrubs')
   for i in range(4):
    a=i*2.1;ellipsoid(shrubs,(bed['center'][0]+math.cos(a)*3,bed['center'][1]+math.sin(a)*2,bed['y']+.35),(1.05,.75,.4),8,5)
 for n,tree in enumerate(D['landscape']['plants']):
  x,z=tree['point'];y=tree['y'];h=tree['height'];trunk=part('site tree trunks','bark');leaves=part('site foliage','leaves');light=part('site foliage light','leaves light')
  if tree['type']=='palm':
   for i in range(8):
    t=i/8;q=(i+1)/8;frustum(trunk,(x+.3*t*t,z,y+h*t),(x+.3*q*q,z,y+h*q),.20-.075*t,.20-.075*q,7 if lod<2 else 5)
   top=Vector((x+.3,z,y+h))
   for k in range([12,9,6][lod]):
    theta=k*math.tau/[12,9,6][lod]+n*.7;direction=Vector((math.cos(theta),math.sin(theta),0));side=Vector((-math.sin(theta),math.cos(theta),0));L=3.0+.25*math.sin(k)
    def stem(t):return top+direction*L*t+Vector((0,0,1.25*math.sin(t*math.pi)-.72*t))
    for i in range(5):trunk.beam(stem(i/5),stem((i+1)/5),.025,.025,False)
    for i in range([13,8,5][lod]):
     t=(i+1)/([13,8,5][lod]+1);a=stem(t);width=.84*(math.sin(math.pi*t)**.55)
     for sign in [-1,1]:
      tip=a+side*sign*width+direction*.30+Vector((0,0,-.15));ridge=a+(tip-a)*.48+Vector((0,0,.06));target=light if (i+k)%3==0 else leaves
      target.face([a-direction*.12,ridge,tip,a+direction*.12]);target.face([a-direction*.12,tip,ridge,a+direction*.12])
  else:
   frustum(trunk,(x,z,y),(x,z,y+h*.78),.27,.12,8 if lod<2 else 5)
   for k in range([9,6,4][lod]):
    a=k*2.399;end=(x+math.cos(a)*1.6,z+math.sin(a)*1.6,y+h*(.70+.08*math.sin(k)))
    frustum(trunk,(x,z,y+h*.48),end,.09,.025,5)
    ellipsoid(light if k%3==0 else leaves,(end[0],end[1],end[2]+.65),(1.5,1.4,1.7),[10,8,6][lod],[7,5,4][lod])
  if lod==0:
   fp=[(x+.28*math.cos(i*math.tau/8),z+.28*math.sin(i*math.tau/8)) for i in range(8)];manifest['collisionVolumes'].append({'name':tree['id']+' trunk','footprint':fp,'height':2.5,'base':y})
 objects=[p.finish(root) for p in buckets.values()];objects=[o for o in objects if o]
 bpy.ops.object.select_all(action='DESELECT')
 for o in coll.objects:o.hide_set(False);o.select_set(True)
 bpy.context.view_layer.objects.active=root
 file=OUT/f'sports-lod{lod}.glb';bpy.ops.export_scene.gltf(filepath=str(file),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_cameras=False,export_lights=False,export_yup=True)
 manifest['lods'].append({'file':file.name,'distance':[0,300,750][lod],'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects),'meshObjects':len(objects),'bytes':file.stat().st_size})
 coll.hide_render=lod!=0
 for o in coll.objects:o.hide_set(lod!=0)
world=bpy.data.worlds.new('Sports daylight');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.34,.41,.46,1);world.node_tree.nodes['Background'].inputs[1].default_value=.7
light=bpy.data.lights.new('Sun','SUN');light.energy=3;light.angle=.14;o=bpy.data.objects.new('Sun',light);scene.collection.objects.link(o);o.rotation_euler=(.65,-.3,-.6)
camdata=bpy.data.cameras.new('Sports review camera');cam=bpy.data.objects.new('Sports review camera',camdata);scene.collection.objects.link(cam);scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=36;scene.cycles.use_denoising=True;scene.render.resolution_x=1500;scene.render.resolution_y=1050;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
def camera(view):
 p=view['position'];t=view['target'];cam.location=xyz((p[0],p[2],p[1]));target=Vector(xyz((t[0],t[2],t[1])));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();camdata.lens=36/(2*math.tan(math.radians(view['fov'])/2))*1050/1500
camera(D['views']['overall']);scene['sources']=json.dumps(D['sources'],ensure_ascii=False);scene['evidence']=json.dumps(D['evidence'],ensure_ascii=False)
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'sports.blend'),compress=True)
(OUT/'sports.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print('SPORTS_COMPLETE',json.dumps(manifest['lods']))
if '--render' in sys.argv:
 for name in ['overall','pool','gym','landscape']:
  camera(D['views'][name]);scene.render.filepath=str(HERE/(name+'.png'));bpy.ops.render.render(write_still=True)
