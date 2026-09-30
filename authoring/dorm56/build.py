"""Official plan and photo-informed student living one, with stepped floors and glazed links."""
import bpy,json,math,random,sys
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'common'))
from geometry import Part,mat,MATS,xyz,wall,cap,area,inset,strip,band
ROOT=Path(__file__).resolve().parents[2];HERE=Path(__file__).parent;OUT=ROOT/'public/models/dorm56';OUT.mkdir(parents=True,exist_ok=True)
D=json.loads((HERE/'design.json').read_text());bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.unit_settings.system='METRIC'
materials=[('ivory metal',(.63,.64,.59),.68,.03,'paint'),('grey tile',(.36,.38,.38),.87,.03,'ceramic'),('brick',(.38,.12,.065),.91,0,'ceramic'),('mortar',(.22,.19,.15),.95,0,'ceramic'),('window',(.055,.17,.22),.19,.2,'glass'),('glass rail',(.27,.39,.41),.23,.18,'glass'),('metal frame',(.33,.39,.39),.4,.6,'metal'),('roof',(.40,.42,.39),.98,0,'roofMetal'),('terrace pavers',(.30,.16,.09),.97,0,'paving'),('pipe',(.27,.29,.28),.68,.12,'metal'),('pale paving',(.52,.55,.51),.98,0,'paving'),('lawn',(.17,.27,.045),.99,0,'foliage'),('bark',(.23,.17,.09),.93,0,'bark'),('leaf shadow',(.05,.16,.025),.92,0,'foliage'),('leaf light',(.17,.29,.04),.9,0,'foliage'),('hedge',(.095,.23,.035),.97,0,'foliage')]
for a in materials:mat('DORM56 / '+a[0],*a[1:])
rail=MATS['DORM56 / glass rail'];rail.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value=.48;rail.diffuse_color=(*rail.diffuse_color[:3],.48);rail.surface_render_method='DITHERED'
for key in ['leaf shadow','leaf light','glass rail','window']:MATS['DORM56 / '+key].use_backface_culling=False
manifest={k:D[k] for k in ['asset','name','anchor','base','fixedTerrainBase','yaw','sources','evidence','views','review','landscape','height','walkRoutes']};manifest.update(lods=[],collisionVolumes=[],collisionMeshes=[],canopyBounds=[])
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

def shape(part,rec,lo,hi):
 wall(part,rec['outline'],lo,hi)
 for hole in rec['holes']:wall(part,hole,lo,hi)
 for tri in rec['triangles']:
  part.face([(*p,hi) for p in tri]);part.face([(*p,lo) for p in reversed(tri)])
def shapeCollider(name,rec,lo,hi):
 # Existing volume collision helper supports concave outlines; these floor groups have no holes.
 assert not rec['holes'],name+' unexpectedly has a hole'
 collider(name,rec['outline'],lo,hi)
for lod in range(3):
 random.seed(560);coll=bpy.data.collections.new(f'DORM56 LOD{lod}');scene.collection.children.link(coll);root=bpy.data.objects.new(f'DORM56 {lod}',None);coll.objects.link(root);root['placeId']='dorm56';buckets={}
 def part(name,material):
  key=(name,material)
  if key not in buckets:buckets[key]=Part(name+' | '+material,'DORM56 / '+material,coll)
  return buckets[key]
 white=part('projecting white floor bands','ivory metal');core=part('recessed grey dormitory walls','grey tile');glass=part('blue recessed room windows','window');frame=part('window mullions and balcony rails','metal frame');rails=part('transparent balcony guards','glass rail');roof=part('flat roofs and service enclosures','roof');brick=part('red brick service building piers','brick');pavers=part('terrace red paving','terrace pavers');roofgreen=part('terrace planted beds','lawn');pipes=part('open gallery service pipes','pipe')
 for building in D['buildings']:
  num=building['number'];service=num==11
  for level in building['levels']:
   f=level['floor'];lo=level['base'];hi=level['top'];last=f==building['floors'];name=f'building{num}/floor{f}'
   # No horizontal foundation plate: the ground colonnade uses terrain-draped paving.
   if f>0:
    for k,rec in enumerate(level['slab']):
     shape(white,rec,lo-.30,lo)
     if lod==0:shapeCollider(name+f'/slab{k}',rec,lo-.30,lo)
   for k,rec in enumerate(level['rooms']):
    shape(core,rec,-.65 if f==0 else lo,hi-.30)
    if lod==0:shapeCollider(name+f'/room{k}',rec,-.65 if f==0 else lo,hi-.30)
   if last:facades=[]
   else:facades=level['facade']
   for rec in facades:
    fp=rec['outline']
    for ei,(av,bv) in enumerate(zip(fp,fp[1:]+fp[:1])):
     a=Vector(av);b=Vector(bv);delta=b-a;length=delta.length
     if length<.3:continue
     u=delta/length;n=Vector((u.y,-u.x));count=max(1,round(length/3.25));bay=length/count
     # Deeply recessed glass, with the glass plane just in front of its backing wall.
     depth=2.18 if f==0 else 1.13
     for j in range(count):
      aa=a+u*(j*bay+.27)-n*depth;bb=a+u*((j+1)*bay-(.27 if f==0 else bay*.44))-n*depth
      if f==0:
       mid=(aa+bb)/2
       # Cross-passage is genuinely empty: draw storefront glass only over a surviving core wall.
       from mathutils.geometry import intersect_point_line
       def pointInside(p,poly):
        inside=False
        for vv,ww in zip(poly,poly[1:]+poly[:1]):
         if (vv[1]>p[1])!=(ww[1]>p[1]) and p[0]<(ww[0]-vv[0])*(p[1]-vv[1])/(ww[1]-vv[1])+vv[0]:inside=not inside
        return inside
       if not any(pointInside(mid-n*.08,r['outline']) for r in level['rooms']):continue
      sill=lo+.15 if f==0 else lo+.30;top=hi-.48
      glass.face([(*aa,sill),(*bb,sill),(*bb,top),(*aa,top)])
      if lod<2:
       for p in ([aa,bb,(aa+bb)/2] if lod==0 else [aa,bb]):frame.beam((*p,sill),(*p,top),.045,.045)
       frame.beam((*aa,top-.65),(*bb,top-.65),.045,.045)
       if lod==0 and f>0 and j%3==1:
        # Small projecting opening sash gives a distinct window highlight.
        p=aa+u*.12;q=p+u*min(.75,bay*.3)
        for x,y in [(p,q)]:frame.beam((*(x+n*.13),lo+1.35),(*(y+n*.13),lo+1.35),.06,.06)
        frame.beam((*p,top-.66),(*(p+n*.13),lo+1.35),.05,.05)
      if f>0:
       pa=a+u*(j*bay+.2)-n*.12;pb=a+u*((j+1)*bay-.2)-n*.12
       rails.face([(*pa,lo+.20),(*pb,lo+.20),(*pb,lo+1.07),(*pa,lo+1.07)])
       frame.beam((*pa,lo+1.08),(*pb,lo+1.08),.035,.035)
     for j in range(count+1):
      p=a+u*j*bay-n*.15
      target=brick if service and f>0 else white
      target.beam((*p,-.5 if f==0 else lo),(*p,hi-.25),.42 if service else .25,.42)
      if lod==0 and f==0:collider(name+f'/pier{ei}/{j}',rect(*p,.46 if service else .29,.46),-.5 if f==0 else lo,hi-.25)
     if service and f>0:
      brick.beam((*a,lo+.1),(*b,lo+.1),.5,.65);brick.beam((*a,hi-.40),(*b,hi-.40),.5,.65)
      if lod==0:
       mortar=part('brick fine horizontal courses','mortar')
       for row in range(13):
        hh=lo+.4+row*.21
        for j in range(count+1):
         p=a+u*j*bay+n*.075;mortar.beam((*(p-u*.20),hh),(*(p+u*.20),hh),.012,.012)
     if f>0 and lod==0:
      for j in range(count):
       # Small ventilation grille beside each opening, as visible in ground panorama.
       p=a+u*(j*bay+.15)-n*1.11;h=hi-.91
       frame.beam((*(p-u*.085),h-.10),(*(p+u*.085),h+.10),.019,.025)
       frame.beam((*(p-u*.085),h+.10),(*(p+u*.085),h-.10),.019,.025)
     if f==0 and lod<2:
      pipes.beam((*(a-n*.5),hi-.6),(*(b-n*.5),hi-.6),.07,.07)
   for ti,terrace in enumerate(level['terraces']):
    shape(roof if last else pavers,terrace,lo+.01,lo+.04)
    fp=terrace['outline']
    for av,bv in zip(fp,fp[1:]+fp[:1]):
     a=Vector(av);b=Vector(bv);u=b-a;length=u.length
     if length<.2:continue
     u/=length;frame.beam((*a,lo+1.12),(*b,lo+1.12),.045,.045)
     for j in range(math.ceil(length/(1.5 if lod<2 else 3))+1):
      p=a+u*min(length,j*(1.5 if lod<2 else 3));frame.beam((*p,lo+.05),(*p,lo+1.12),.038,.038)
     if lod==0:
      n=Vector((u.y,-u.x))*.04;collider(name+f'/terrace guard{ti}/{tuple(av)}',[tuple(a-n),tuple(b-n),tuple(b+n),tuple(a+n)],lo+.05,lo+1.12)
    xs=[p[0] for p in fp];zs=[p[1] for p in fp];mnx,mxx=min(xs),max(xs);mnz,mxz=min(zs),max(zs)
    if not last and len(fp)==4 and mxx-mnx>2 and mxz-mnz>2:
     planted=rect((mnx+mxx)/2,(mnz+mxz)/2,mxx-mnx-1.2,mxz-mnz-1.2);volume(roofgreen,planted,lo+.06,lo+.22)
    if last:
     # Compact service housings and solar collectors are photo-informed, counts are estimates.
     cx=sum(xs)/len(xs);cz=sum(zs)/len(zs)

     if pointInside((cx,cz),fp):volume(roof,rect(cx,cz,3.8,3.2),lo+.05,lo+1.2)
     for row in range(2):
      for k in range(4 if lod==2 else 8):
       xx=mnx+1.2+k*2.3;zz=mnz+1+row*3.2
       corners=[(xx,zz),(xx+1.7,zz),(xx+1.7,zz+2),(xx,zz+2)]
       if all(pointInside(p,fp) for p in corners):glass.face([(*p,lo+(.3 if j<2 else .8)) for j,p in enumerate(corners)])
 # Elevated glazed links: continuous opaque decks/roof, thin glass sides, open space underneath.
 links=part('elevated glass link decks and roof','ivory metal');linkglass=part('glazed link curtain wall','window');linkframe=part('glazed link mullions','metal frame')
 for bridge in D['bridges']:
  a=Vector(bridge['a']);b=Vector(bridge['b']);u=b-a;length=u.length;u/=length;n=Vector((u.y,-u.x));half=bridge['width']/2;fp=[tuple(a-n*half),tuple(b-n*half),tuple(b+n*half),tuple(a+n*half)];lo=bridge['base'];hi=bridge['roof'];volume(links,fp,lo-.32,lo);volume(links,fp,hi-.23,hi)
  if lod==0:collider(bridge['id']+' floor',fp,lo-.32,lo);collider(bridge['id']+' roof',fp,hi-.23,hi)
  for sign in [-1,1]:
   aa=a+n*(half-.11)*sign;bb=b+n*(half-.11)*sign;linkglass.face([(*aa,lo+.18),(*bb,lo+.18),(*bb,hi-.28),(*aa,hi-.28)])
   count=math.ceil(length/(1.5 if lod<2 else 3));linkframe.beam((*aa,lo+1.15),(*bb,lo+1.15),.045,.045)
   for j in range(count+1):
    p=aa.lerp(bb,j/count);linkframe.beam((*p,lo+.12),(*p,hi-.23),.06,.06)
   if lod==0:collider(bridge['id']+f' glazed wall{sign}',[tuple(aa-n*.035),tuple(bb-n*.035),tuple(bb+n*.035),tuple(aa+n*.035)],lo,hi)
  # Long spans have a pair of piers on the outer edges; keep the passage centerline clear.
  if length>22:
   for sign in [-1,1]:
    p=(a+b)/2+n*(half-.22)*sign;links.beam((*p,-.55),(*p,lo-.32),.35,.45)
    if lod==0:collider(bridge['id']+f' support{sign}',rect(*p,.39,.49),-.55,lo-.32)
 # Terrain-draped paths and islands share the exact campus triangles.
 paving=part('continuous courtyard paving','pale paving');lawn=part('courtyard and perimeter planted lawns','lawn');curb=part('low planting curbs','ivory metal')
 for rec in D['landscape']['paths']+D['landscape']['beds']:
  target=lawn if 'heights' in rec else paving;pos=rec['position'];idx=rec['index']
  for j in range(0,len(idx),3):target.face([(pos[3*i],pos[3*i+2],pos[3*i+1]) for i in idx[j:j+3]])
 for bed in D['landscape']['beds']:
  if bed['name'].startswith('courtyard lawn'):continue
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
 for obj in objects:obj['placeId']='dorm56'
 bpy.ops.object.select_all(action='DESELECT')
 for o in coll.objects:o.hide_set(False);o.select_set(True)
 bpy.context.view_layer.objects.active=root;file=OUT/f'dorm56-lod{lod}.glb'
 bpy.ops.export_scene.gltf(filepath=str(file),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_cameras=False,export_lights=False,export_yup=True)
 manifest['lods'].append({'file':file.name,'distance':[0,300,750][lod],'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects),'meshObjects':len(objects),'bytes':file.stat().st_size})
 coll.hide_render=lod!=0
 for o in coll.objects:o.hide_set(lod!=0)
preview=bpy.data.collections.new('Preview only');scene.collection.children.link(preview);pr=bpy.data.objects.new('Preview root',None);preview.objects.link(pr)
mat('DORM56 / terrain',(.22,.31,.14),.95,0,'terrain');floor=Part('site terrain','DORM56 / terrain',preview)
p=D['landscape']['terrain']['position'];ind=D['landscape']['terrain']['index']
for j in range(0,len(ind),3):floor.face([(p[3*i],p[3*i+2],p[3*i+1]) for i in reversed(ind[j:j+3])])
floor.finish(pr)
world=bpy.data.worlds.new('Daylight');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.38,.46,.53,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65
light=bpy.data.lights.new('Sun','SUN');light.energy=3;light.angle=.12;sun=bpy.data.objects.new('Sun',light);scene.collection.objects.link(sun);sun.rotation_euler=(.6,-.4,-.8)
camdata=bpy.data.cameras.new('Review camera');cam=bpy.data.objects.new('Review camera',camdata);scene.collection.objects.link(cam);scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.resolution_x=1500;scene.render.resolution_y=1050;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
def camera(name):
 view=D['views'][name];p=view['position'];t=view['target'];cam.location=xyz((p[0],p[2],p[1]));target=Vector(xyz((t[0],t[2],t[1])));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();camdata.lens=36/(2*math.tan(math.radians(view['fov'])/2))*1050/1500
camera('overall');scene['sources']=json.dumps(D['sources']);scene['evidence']=json.dumps(D['evidence']);bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'dorm56.blend'),compress=True)
(OUT/'dorm56.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n');print('DORM56_COMPLETE',json.dumps(manifest['lods']))
if '--render' in sys.argv:
 for name in ['overall','front','landscape','shared']:
  camera(name);scene.render.filepath=str(HERE/(name+'.png'));bpy.ops.render.render(write_still=True)
