"""Incubator: individually traced floors, real recesses, metallic curtain wall and open roof grid."""
import bpy,json,math,random,sys
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'common'))
from geometry import Part,mat,MATS,xyz,wall,cap,area,inset,strip
ROOT=Path(__file__).resolve().parents[2];HERE=Path(__file__).parent;OUT=ROOT/'public/models/incubator';OUT.mkdir(parents=True,exist_ok=True)
D=json.loads((HERE/'design.json').read_text());H=D['storeyHeight']
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
 if c.name!='Collection':bpy.data.collections.remove(c)
scene=bpy.context.scene;scene.unit_settings.system='METRIC'
materials=[('ivory metal',(.76,.79,.78),.32,.35,'paint'),('silver metal',(.45,.5,.51),.27,.72,'metal'),('dark glass',(.035,.055,.061),.19,.35,'glass'),('charcoal cladding',(.085,.10,.10),.63,.15,'concrete'),('roof',(.44,.47,.46),.88,0,'roofMetal'),('rail',(.18,.21,.21),.36,.7,'metal'),('concrete columns',(.42,.46,.45),.85,0,'concrete'),('pale paving',(.58,.61,.58),.95,0,'stone'),('dark paving',(.13,.15,.15),.98,0,'paving'),('lawn',(.18,.29,.06),.99,0,'foliage'),('bark',(.30,.24,.15),.97,0,'bark'),('leaf shadow',(.075,.19,.035),.87,0,'foliage'),('leaf light',(.23,.35,.065),.88,0,'foliage'),('hedge',(.105,.23,.046),.95,0,'foliage'),('timber',(.28,.16,.07),.87,0,'wood'),('lamp',(.04,.048,.045),.48,.45,'metal'),('light strip',(.95,.88,.64),.4,0,'paint')]
for i in range(3):
 materials.append(('silver glass '+str(i),(.20+i*.013,.25+i*.012,.26+i*.01),.15+i*.017,.55,'glass'))
 materials.append(('bronze glass '+str(i),(.41+i*.022,.225+i*.015,.125+i*.012),.18+i*.017,.62,'glass'))
for args in materials:mat('INCUBATOR / '+args[0],*args[1:])
for k in ['leaf shadow','leaf light']:MATS['INCUBATOR / '+k].use_backface_culling=False
manifest={k:D[k] for k in ['asset','name','anchor','base','yaw','sources','evidence','views','review','landscape']}
manifest.update(lods=[],collisionVolumes=[],collisionMeshes=[],canopyBounds=[],walkRoutes=[],height=D['buildingBase']+D['stiltHeight']+H*5+4.3)
def volume(p,fp,z0,z1):
 if area(fp)<0:fp=list(reversed(fp))
 wall(p,fp,z0,z1);cap(p,fp,z1);cap(p,list(reversed(fp)),z0)
def collider(name,fp,z0,z1):
 if z1>z0:manifest['collisionVolumes'].append({'name':name,'footprint':fp,'base':z0,'height':z1-z0})
def meshcol(name,faces):
 if not faces:return
 vs=[];inds=[]
 for face in faces:
  n=len(vs)//3;vs.extend(v for p in face for v in [p[0],p[2],p[1]])
  for i in range(1,len(face)-1):inds.extend([n,n+i+1,n+i])
 manifest['collisionMeshes'].append({'name':name,'position':vs,'index':inds})
def ribbonfp(a,b,width):
 d=Vector(b)-Vector(a);n=Vector((-d.y,d.x)).normalized()*width/2
 return [tuple(Vector(a)-n),tuple(Vector(b)-n),tuple(Vector(b)+n),tuple(Vector(a)+n)]
def tube(part,a,b,r0,r1,n=8):
 a,b=Vector(a),Vector(b);d=(b-a).normalized();ref=Vector((0,0,1)) if abs(d.z)<.92 else Vector((1,0,0));u=d.cross(ref).normalized();v=d.cross(u).normalized()
 ra=[a+r0*(u*math.cos(i*math.tau/n)+v*math.sin(i*math.tau/n)) for i in range(n)];rb=[b+r1*(u*math.cos(i*math.tau/n)+v*math.sin(i*math.tau/n)) for i in range(n)]
 for i in range(n):j=(i+1)%n;part.face([ra[i],ra[j],rb[j],rb[i]])
 part.face(list(reversed(ra)));part.face(rb)
def ellipsoid(part,c,size,n=10,rings=6):
 for j in range(rings):
  a=-math.pi/2+math.pi*j/rings;b=-math.pi/2+math.pi*(j+1)/rings
  def p(t,angle):return(c[0]+size[0]*math.cos(t)*math.cos(angle),c[1]+size[1]*math.cos(t)*math.sin(angle),c[2]+size[2]*math.sin(t))
  for i in range(n):
   t=i*math.tau/n;q=(i+1)*math.tau/n
   if j==0:part.face([p(a,t),p(b,q),p(b,t)])
   elif j==rings-1:part.face([p(a,t),p(a,q),p(b,t)])
   else:part.face([p(a,t),p(a,q),p(b,q),p(b,t)])
def pt(u,v):
 f=D['frame'];return tuple(f['origin'][i]+f['u'][i]*u+f['v'][i]*v for i in [0,1])
def rect(r):
 x,y,X,Y=r;return [pt(x,y),pt(X,y),pt(X,Y),pt(x,Y)]
def inside(p,poly):
 x,y=p;hit=False
 for a,b in zip(poly,poly[1:]+poly[:1]):
  if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:hit=not hit
 return hit
def floorcells(level):
 polys=level['polygons'];holes=level['holes'];points=[p for poly in polys+holes for p in poly];xs=sorted(set(p[0] for p in points));ys=sorted(set(p[1] for p in points));cells={}
 for i in range(len(xs)-1):
  for j in range(len(ys)-1):
   p=((xs[i]+xs[i+1])/2,(ys[j]+ys[j+1])/2)
   if any(inside(p,q) for q in polys) and not any(inside(p,q) for q in holes):cells[i,j]=[xs[i],ys[j],xs[i+1],ys[j+1]]
 edges=[]
 for (i,j),r in cells.items():
  x,y,X,Y=r
  for neighbor,a,b in [((i,j-1),(x,y),(X,y)),((i+1,j),(X,y),(X,Y)),((i,j+1),(X,Y),(x,Y)),((i-1,j),(x,Y),(x,y))]:
   if neighbor not in cells:edges.append((a,b))
 return list(cells.values()),edges
L=D['frame']['length'];W=D['frame']['depth'];B=D['buildingBase'];S=D['stiltHeight']
for lod in range(3):
 random.seed(835);coll=bpy.data.collections.new(f'INCUBATOR LOD{lod}');scene.collection.children.link(coll)
 root=bpy.data.objects.new(f'INCUBATOR {lod}',None);coll.objects.link(root);root['placeId']='incubator';buckets={}
 def part(name,material):
  key=(name,material)
  if key not in buckets:buckets[key]=Part(name+' | '+material,'INCUBATOR / '+material,coll)
  return buckets[key]
 slabs=part('separate floor plates and setback terraces','roof');white=part('white open rooftop framework','ivory metal');mullions=part('slender curtain wall mullions','rail');dark=part('lower dark glazing','dark glass');silver=[part('middle silver glazing','silver glass '+str(i)) for i in range(3)];bronze=[part('upper bronze reflective panels','bronze glass '+str(i)) for i in range(3)];cols=part('exposed stilt columns','concrete columns');rails=part('setback terrace guardrails','rail')
 def line(part,a,b,h,width=.06,depth=.06):part.beam((*pt(*a),h),(*pt(*b),h),width,depth)
 def facade(edges,z0,z1,palette,level):
  for a,b in edges:
   length=math.dist(a,b);n=max(1,round(length/([1.45,1.8,2.9][lod])));av=Vector(a);dv=Vector(b)-av
   for j in range(n):
    aa=av+dv*j/n;bb=av+dv*(j+1)/n;p,q=pt(*aa),pt(*bb);matpart=palette[(j+level)%len(palette)]
    matpart.face([(*p,z0),(*q,z0),(*q,z1),(*p,z1)])
    mullions.beam((*p,z0),(*p,z1),.065,.08)
    if lod<2:
     mullions.beam((*p,z0+.95),(*q,z0+.95),.055,.055)
     # Occasional recessed operable pane; framed glass, no baked reflection imagery.
     if j%9==3 and length>10:
      d=(Vector(q)-Vector(p)).normalized();aa=Vector(p)+d*.25;bb=Vector(q)-d*.25
      if math.dist(aa,bb)>.15:
       part('small operable window frames','silver metal').beam((*aa,z0+.25),(*aa,z0+.8),.05,.05)
       part('small operable window frames','silver metal').beam((*bb,z0+.25),(*bb,z0+.8),.05,.05)
       for hh in [z0+.25,z0+.8]:part('small operable window frames','silver metal').beam((*aa,hh),(*bb,hh),.05,.05)
   for hh in [z0,z1]:line(mullions,a,b,hh,.09,.09)
 # Partial lower stilt floor: enclosed service cores plus real open bays beneath the first floor.
 for k,room in enumerate(D['stiltRooms']):
  fp=rect(room['rect']);volume(dark,fp,B-.3,B+S)
  if lod==0:collider(f'incubator stilt core {k}',fp,B-.5,B+S)
 for u in [2,30,43,56,82,110,136]:
  for v in [1.5,W-1.5]:
   if u>87:continue
   fp=rect([u-.28,v-.28,u+.28,v+.28]);volume(cols,fp,B-.3,B+S)
   if lod==0:collider(f'incubator stilt column {u} {v}',fp,B-.4,B+S)
 # A terrain-level slab gives the genuinely open ground bays a continuous walking surface.
 fp=rect([0,0,L,W]);volume(part('open stilt floor paving','pale paving'),fp,B-.3,B)
 if lod==0:collider('incubator open stilt floor',fp,B-.3,B)
 for level in D['levels']:
  k=level['level'];z0=B+S+(k-1)*H;z1=z0+H;cells,edges=floorcells(level)
  for i,r in enumerate(cells):
   fp=rect(r);volume(slabs,fp,z0-.22,z0);volume(slabs,fp,z1-.22,z1)
   if lod==0:collider(f'incubator floor {k} room {i}',fp,z0-.22,z1)
  facade(edges,z0+.03,z1-.22,[dark] if k==1 else silver if k<=3 else bronze,k)
  # The solid floor beneath open recesses forms the terrace floor, not a black decal.
  if k<5:
   for a,b in edges:
    line(rails,a,b,z1+.88,.034,.034)
 # The fourth-floor roof left of the stepped fifth-floor block is a planted roof terrace.
 roofgarden=part('west roof terrace planting','lawn');curb=part('roof planter edges','concrete columns');deck=part('west rooftop timber terrace','timber');z=B+S+4*H
 for r in [[2.5,3,26.8,6],[2.5,9,6.5,29],[9,27,26.8,32]]:
  volume(curb,rect(r),z,z+.26);cap(roofgarden,inset(rect(r),.16),z+.28)
 for r in [[7.2,9,25.5,25],[2,33,27.8,34.5]]:
  volume(deck,rect(r),z+.01,z+.1)
  if lod<2:
   for x in range(math.ceil(r[0]),math.floor(r[2])):line(mullions,(x,r[1]),(x,r[3]),z+.104,.012,.009)
 for u,v in [(4,12),(4,22),(12,4.5),(22,4.5)]:
  p=pt(u,v);ellipsoid(part('roof terrace shrubs','hedge'),(*p,z+.65),(1,1,.5),[10,8,6][lod],[5,4,3][lod])
 # Flat fifth-floor roof, two equipment bars and a service pod on the lower terrace.
 rh=B+S+5*H
 for r,h,at in [([54,22,92,31],2.6,rh),([98,22,122,31],2.6,rh),([16,19,25,25],2.5,z)]:
  fp=rect(r);volume(part('rooftop service enclosures','charcoal cladding'),fp,at,at+h)
  cap(slabs,fp,at+h+.03)
  for a,b in zip(fp,fp[1:]+fp[:1]):
   n=max(1,round(math.dist(a,b)/[.3,.55,.9][lod]))
   for j in range(n):
    p=tuple(a[k]+(b[k]-a[k])*j/n for k in [0,1]);part('service enclosure louvers','silver metal').beam((*p,at+.15),(*p,at+h-.12),.07,.065)
 # The white canopy remains visibly open at all LODs; model the primary grid and partial infill.
 ch=rh+4.1
 for u in [31,49,67,85,103,121,136]:
  for v in [2.5,32.5]:
   p=pt(u,v);white.beam((*p,rh),(*p,ch),.28,.28)
 for v in [1,5,9,13,17,21,25,29,34]:line(white,(28,v),(L+1,v),ch,.2,.3)
 for u in range(28,140,4):line(white,(u,1),(u,34),ch,.18,.26)
 if lod<2:
  for i,u in enumerate(range(29,137,4)):
   for j,v in enumerate(range(2,33,4)):
    if (i*7+j*3)%5<2:
     for q in range(1,4):line(white,(u,v+q*.65),(u+2.6,v+q*.65),ch+.02,.13,.1)
 # Rails around the lower roof terrace; sparse supports retain a light profile.
 for a,b in [((0,0),(28.7,0)),((0,0),(0,W)),((0,W),(28.7,W))]:
  line(rails,a,b,z+1,.045,.045)
  n=math.ceil(math.dist(a,b)/2.2)
  for j in range(n+1):
   p=pt(*(a[k]+(b[k]-a[k])*j/n for k in [0,1]));rails.beam((*p,z),(*p,z+1),.035,.035)
 # Entrance paths from the frontage paving to the two unblocked stilt openings.
 for idx,u in enumerate([37,59]):
  fp=rect([u-2.0,W-1,u+2.0,W+4.6]);volume(part('entrance approach paving','pale paving'),fp,B-.25,B)
  if lod==0:
   collider(f'incubator entrance approach {idx}',fp,B-.25,B)
   manifest['walkRoutes'].append({'name':f'stilt entrance {idx+1}','points':[[*pt(u,W+3.8),B],[*pt(u,W-2),B],[*pt(u,19),B]]})
 # Two flank pergolas over the paved forecourts echo the completed photograph.
 for side in [-1,1]:
  start=-17 if side<0 else L+6
  for u in [start,start+4,start+8]:
   for v in [4,12]:
    p=pt(u,v);white.beam((*p,B),(*p,B+2.8),.15,.15)
   line(white,(u,4),(u,12),B+2.8,.15,.18)
  for v in range(4,13):line(white,(start,v),(start+8,v),B+2.8,.12,.12)
 # The rooftop sign is converted to editable mesh; no external font is shipped.
 if lod<2:
  font=bpy.data.fonts.load('/System/Library/Fonts/STHeiti Medium.ttc')
  curve=bpy.data.curves.new('Incubator rooftop lettering','FONT');curve.body='黎安国际科创港';curve.font=font;curve.size=1.7;curve.space_character=1.25;curve.align_x='CENTER';curve.extrude=.035
  obj=bpy.data.objects.new('Rooftop sign 黎安国际科创港',curve);coll.objects.link(obj);obj.parent=root;obj['placeId']='incubator'
  p=pt(63,W-1);obj.location=xyz((*p,rh+.25));obj.rotation_euler=(math.pi/2,0,-math.atan2(D['frame']['u'][1],D['frame']['u'][0]));obj.data.materials.append(MATS['INCUBATOR / bronze glass 1'])
  bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.convert(target='MESH')
  # Drop the unused font data after conversion; source is self-contained.
  if curve.users==0:bpy.data.curves.remove(curve)
  if font.users==0:bpy.data.fonts.remove(font)
 # Terrain-following paving, continuous lawns, hedges and branch/leaf canopies.
 paving=part('site perimeter paving','pale paving');lawn=part('connected planted lawns','lawn');curb=part('planting curbs','ivory metal')
 for apron in D['landscape']['aprons']:
     a,b=apron['inner'],apron['outer'];ah,bh=apron['innerHeights'],apron['outerHeights']
     for i in range(len(a)):
         j=(i+1)%len(a)
         if math.dist(a[i],b[i])<.01:continue
         p=[(*a[i],ah[i]),(*a[j],ah[j]),(*b[j],bh[j]),(*b[i],bh[i])];paving.face(p if area([q[:2] for q in p])>0 else list(reversed(p)))
 for path in D['landscape']['paths']:
     q=[(*p,h) for p,h in zip(path['footprint'],path['heights'])];part('internal drive and court paving','dark paving' if path['tone'] else 'pale paving').face(q if area(path['footprint'])>0 else list(reversed(q)))
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
     if lod==0:collider('incubator lamp '+str(x)+','+str(z),[[x-.10,z-.10],[x+.10,z-.10],[x+.10,z+.10],[x-.10,z+.10]],y,y+h)
 objects=[o for p in buckets.values() if (o:=p.finish(root))];objects += [o for o in coll.objects if o.type=='MESH' and o not in objects]
 for obj in objects:obj['placeId']='incubator'
 bpy.ops.object.select_all(action='DESELECT')
 for o in coll.objects:o.hide_set(False);o.select_set(True)
 bpy.context.view_layer.objects.active=root;file=OUT/f'incubator-lod{lod}.glb'
 bpy.ops.export_scene.gltf(filepath=str(file),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_cameras=False,export_lights=False,export_yup=True)
 manifest['lods'].append({'file':file.name,'distance':[0,240,600][lod],'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects),'meshObjects':len(objects),'bytes':file.stat().st_size})
 coll.hide_render=lod!=0
 for o in coll.objects:o.hide_set(lod!=0)
preview=bpy.data.collections.new('Preview only');scene.collection.children.link(preview)
mat('INCUBATOR / studio ground',(.40,.45,.39),.95,0,'terrain');floor=Part('Studio floor','INCUBATOR / studio ground',preview)
floor.face([(-300,-300,D['review']['groundHeight']),(300,-300,D['review']['groundHeight']),(300,300,D['review']['groundHeight']),(-300,300,D['review']['groundHeight'])])
pr=bpy.data.objects.new('Preview only root',None);preview.objects.link(pr);floor.finish(pr)
world=bpy.data.worlds.new('INCUBATOR daylight');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.38,.46,.53,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65
light=bpy.data.lights.new('Sun','SUN');light.energy=3;light.angle=.12;sun=bpy.data.objects.new('Sun',light);scene.collection.objects.link(sun);sun.rotation_euler=(.6,-.4,-.8)
camdata=bpy.data.cameras.new('INCUBATOR review camera');cam=bpy.data.objects.new('INCUBATOR review camera',camdata);scene.collection.objects.link(cam);scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.render.resolution_x=1500;scene.render.resolution_y=1050;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
def camera(name):
    view=D['views'][name];p=view['position'];t=view['target'];cam.location=xyz((p[0],p[2],p[1]));target=Vector(xyz((t[0],t[2],t[1])));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();camdata.lens=36/(2*math.tan(math.radians(view['fov'])/2))*1050/1500
camera('overall');scene['sources']=json.dumps(D['sources']);scene['evidence']=json.dumps(D['evidence'])
# All signage is mesh geometry; remove orphan font datablocks from the source.
assert not any(o.type=='FONT' for o in bpy.data.objects)
for font in list(bpy.data.fonts):
 if font.filepath:bpy.data.fonts.remove(font,do_unlink=True)
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'incubator.blend'),compress=True)
(OUT/'incubator.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print('INCUBATOR_COMPLETE',json.dumps(manifest['lods']))
if '--render' in sys.argv:
    for name in ['overall','front','rear','landscape']:
        camera(name);scene.render.filepath=str(HERE/(name+'.png'));bpy.ops.render.render(write_still=True)
