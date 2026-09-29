"""Canteen 8: photo-informed brick screens, white side frame and rooftop plant."""
import bpy,json,math,random,sys
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'common'))
from geometry import Part,mat,MATS,xyz,wall,cap,area,inset,strip
ROOT=Path(__file__).resolve().parents[2];HERE=Path(__file__).parent;OUT=ROOT/'public/models/canteen';OUT.mkdir(parents=True,exist_ok=True)
D=json.loads((HERE/'design.json').read_text())
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
 if c.name!='Collection':bpy.data.collections.remove(c)
scene=bpy.context.scene;scene.unit_settings.system='METRIC'
materials=[('ivory metal',(.77,.78,.73),.52,.15,'paint'),('plaster',(.69,.66,.52),.92,0,'plaster'),('brick',(.32,.085,.031),.87,0,'ceramic'),('silver metal',(.53,.59,.60),.31,.75,'metal'),('blue glass',(.035,.07,.082),.2,.25,'glass'),('vent shadow',(.025,.035,.038),.69,.05,'metal'),('roof',(.34,.35,.32),.96,0,'roofMetal'),('mechanical',(.52,.59,.60),.56,.45,'metal'),('teal pipe',(.028,.30,.26),.35,.6,'metal'),('blue tank',(.018,.28,.53),.3,.34,'paint'),('solar',(.075,.105,.14),.2,.35,'glass'),('orange sign',(.96,.26,.015),.4,.1,'paint'),('pale paving',(.58,.59,.52),.97,0,'stone'),('dark paving',(.095,.105,.10),.98,0,'paving'),('lawn',(.18,.29,.06),.99,0,'foliage'),('bark',(.30,.24,.15),.97,0,'bark'),('leaf shadow',(.06,.17,.025),.88,0,'foliage'),('leaf light',(.20,.31,.045),.9,0,'foliage'),('hedge',(.10,.20,.035),.95,0,'foliage'),('timber',(.28,.16,.07),.87,0,'wood'),('lamp',(.04,.048,.045),.48,.45,'metal'),('light strip',(.95,.88,.64),.4,0,'paint'),('yellow marking',(.85,.57,.08),.96,0,'paint')]
for i,c in enumerate([(.43,.12,.045),(.33,.075,.025),(.49,.16,.067)]):materials.append(('brick tone '+str(i),c,.9,0,'ceramic'))
for args in materials:mat('CANTEEN / '+args[0],*args[1:])
for k in ['leaf shadow','leaf light']:MATS['CANTEEN / '+k].use_backface_culling=False
manifest={k:D[k] for k in ['asset','name','anchor','base','yaw','sources','evidence','views','review','landscape']}
manifest.update(lods=[],collisionVolumes=[],collisionMeshes=[],canopyBounds=[],stairRoutes=[],height=D['height']+D['buildingBase']+D['plinthHeight']+3.5)
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
B=D['buildingBase'];G=B+D['plinthHeight'];H=D['height'];FP=[pt(*p) for p in D['outlineUV']]
for lod in range(3):
 random.seed(836);coll=bpy.data.collections.new(f'CANTEEN LOD{lod}');scene.collection.children.link(coll)
 root=bpy.data.objects.new(f'CANTEEN {lod}',None);coll.objects.link(root);root['placeId']='canteen';buckets={}
 def part(name,material):
  key=(name,material)
  if key not in buckets:buckets[key]=Part(name+' | '+material,'CANTEEN / '+material,coll)
  return buckets[key]
 white=part('white folded wing and parapets','ivory metal');cream=part('cream service walls','plaster');slabs=part('roof decks and floor slabs','roof');glass=part('deep shaded canteen glazing','blue glass');metal=part('window mullions and railings','silver metal');red=part('thick terracotta sun fins','brick');paving=part('raised entrance terrace stone','pale paving')
 def line(p,a,b,h,w=.07,d=.07):p.beam((*pt(*a),h),(*pt(*b),h),w,d)
 def brickface(a,b,z0,z1):
  if lod==2:return
  av=Vector(a);dv=Vector(b)-av;length=dv.length;dv.normalize();normal=Vector((dv.y,-dv.x));n=math.ceil((z1-z0)/(.15 if lod==0 else .3))
  for row in range(n):
   h0=z0+row*(z1-z0)/n+.008;h1=z0+(row+1)*(z1-z0)/n-.008
   step=.47 if lod==0 else 1.15;start=-step*.5 if row%2 else 0
   while start<length:
    l=max(0,start+.009);r=min(length,start+step-.009)
    if r>l+.015:
     aa=av+dv*l+normal*.007;bb=av+dv*r+normal*.007
     target=part('individual brick courses','brick tone '+str((row+int(start/step)*7)%3));target.face([(*aa,h0),(*bb,h0),(*bb,h1),(*aa,h1)])
    start+=step
 # OSM envelope retained; glazing sits ahead of recessed room volumes and behind the fins.
 core=inset(FP,1.05);volume(cream,core,G-.82,G+H-.23)
 if lod==0:collider('canteen enclosed rooms',core,G-.82,G+H)
 for h in [G,G+5.6,G+H]:
  volume(slabs,FP,h-.22,h)
  if lod==0:collider(f'canteen floor plate {h}',FP,h-.22,h)
 strip(white,FP,inset(FP,.18),G+H,G+H+.35)
 for i,(a,b) in enumerate(zip(FP,FP[1:]+FP[:1])):
  a,b=Vector(a),Vector(b);dv=b-a;length=dv.length;dv.normalize();normal=Vector((dv.y,-dv.x));screen=i in [4,5,6];side=i==3
  if side:continue
  # Real window recess and mullions; rear elevation deliberately simpler than confirmed front.
  if screen:
   aa=a-normal*.62;bb=b-normal*.62
   for z0,z1 in [(G+.65,G+5.3),(G+6,G+H-.72)]:glass.face([(*aa,z0),(*bb,z0),(*bb,z1),(*aa,z1)])
   for h,th in [(G+5.65,.75),(G+H-.55,1.1)]:
    red.beam((*a,h),(*b,h),.62,th);brickface(tuple(a+normal*.31),tuple(b+normal*.31),h-th/2,h+th/2)
   n=max(2,round(length/1.18));step=length/n
   for j in range(n+1):
    p=a+dv*min(length,j*step);uv=(D['outlineUV'][i][0]+(D['outlineUV'][(i+1)%len(FP)][0]-D['outlineUV'][i][0])*j/n)
    balcony=i==5 and 25.5<uv<34.5
    if balcony:continue
    # Vertical brick fins end above the pale lower plinth, as visible through tree gaps.
    for lo,hi in [(G+2.2,G+5.27),(G+6.03,G+H-1.1)]:
     fpa=[tuple(p-dv*.15+normal*.36),tuple(p+dv*.15+normal*.36),tuple(p+dv*.15-normal*.7),tuple(p-dv*.15-normal*.7)]
     volume(red,fpa,lo,hi);brickface(tuple(p-dv*.15+normal*.37),tuple(p+dv*.15+normal*.37),lo,hi)
    if lod==0:
     fpcol=[tuple(p-dv*.15+normal*.36),tuple(p+dv*.15+normal*.36),tuple(p+dv*.15-normal*.7),tuple(p-dv*.15-normal*.7)];collider(f'canteen facade fin {i} {j}',fpcol,G+2.2,G+H-.7)
  else:
   white.beam((*a,G+5.6),(*b,G+5.6),.27,.42)
   for k in range(max(1,round(length/3.6))):
    count=max(1,round(length/3.6));p=a+dv*(k+.18)*length/count-normal*.25;q=a+dv*(k+.84)*length/count-normal*.25
    for lo,hi in [(G+.8,G+4.5),(G+6.5,G+10.2)]:glass.face([(*p,lo),(*q,lo),(*q,hi),(*p,hi)])
  count=max(1,round(length/2.3))
  for k in range(count+1):
   p=a+dv*k*length/count-normal*.59
   metal.beam((*p,G+.6),(*p,G+H-.8),.045,.055)
 # Central first-floor balcony is inset between the brick screens; ground entrance remains distinct.
 fp=rect([25.5,34.5,34.5,36.0]);volume(paving,fp,G+5.4,G+5.6)
 for u in [25.6,34.4]:line(metal,(u,34.6),(u,35.9),G+6.65,.035,.035)
 line(metal,(25.6,35.9),(34.4,35.9),G+6.65,.045,.045)
 for j in range(34):
  p=pt(25.6+8.8*j/33,35.9);metal.beam((*p,G+5.6),(*p,G+6.65),.022,.026)
 volume(white,rect([25.3,35.4,34.7,36.1]),G+4.75,G+5.1)
 for u in [27,30,33]:
  p=pt(u,35.2);metal.beam((*p,G+.1),(*p,G+4.4),.075,.09)
 # Angled white side wing: deep projecting border, recessed panel, dark end window and vent grille.
 sf=D['sideFrame'];aa=Vector(pt(*sf['a']));bb=Vector(pt(*sf['b']));dd=(bb-aa).normalized();nn=Vector((dd.y,-dd.x));length=(bb-aa).length;af=aa+nn*.8;bf=bb+nn*.8
 for z in [G+6.1,G+H-.45]:white.beam((*af,z),(*bf,z),1.45,.95)
 for p in [af+dd*.5,bf-dd*.5]:white.beam((*p,G+6.1),(*p,G+H-.45),.95,1.45)
 pa=aa+dd*1.0-nn*.38;pb=bb-dd*1.0-nn*.38
 part('recessed white side panel','plaster').face([(*pa,G+6.65),(*pb,G+6.65),(*pb,G+H-.95),(*pa,G+H-.95)])
 pa=aa+dd*1.05-nn*.35;pb=aa+dd*4.2-nn*.35
 glass.face([(*pa,G+6.65),(*pb,G+6.65),(*pb,G+H-.95),(*pa,G+H-.95)])
 vent=part('dark side ventilation slots','vent shadow')
 for j in range(6):
  for k in range(5):
   p=bb-dd*(1.8+k*.55)-nn*.34;q=p-dd*.36;vent.face([(*p,G+7+j*.24),(*q,G+7+j*.24),(*q,G+7+j*.24+.09),(*p,G+7+j*.24+.09)])
 # Shaded ground doors and pale piers below the cantilever.
 for j in range(7):
  p=aa+dd*(j+.2)*length/7-nn*.5;q=aa+dd*(j+.85)*length/7-nn*.5
  glass.face([(*p,G+.1),(*q,G+.1),(*q,G+5.6),(*p,G+5.6)])
  white.beam((*p,G),(*p,G+5.6),.32,.38)
 # Two accessible exterior terraces and stairs with ramps matching the visible treads.
 for platform in D['platforms']:
  volume(paving,platform['outline'],B-.15,G)
  if lod==0:collider('canteen '+platform['id']+' entrance terrace',platform['outline'],B-.15,G)
 stairs=part('entrance stone stair treads','pale paving');rails=part('entrance stair handrails','silver metal')
 for st in D['stairs']:
  a=Vector(pt(*st['a']));b=Vector(pt(*st['b']));along=(b-a).normalized();side=Vector((-along.y,along.x))*st['width']/2;h0=st['h0'];h1=st['h1'];count=math.ceil((h1-h0)/.15)
  for j in range(count):
   p=a+(b-a)*j/count;q=a+(b-a)*(j+1)/count;volume(stairs,[tuple(p-side),tuple(q-side),tuple(q+side),tuple(p+side)],h0+(h1-h0)*j/count-.12,h0+(h1-h0)*(j+1)/count)
  landing=[tuple(a-along*1.7-side),tuple(a-side),tuple(a+side),tuple(a-along*1.7+side)];volume(paving,landing,h0-.2,h0)
  for sign in [-1,1]:
   pa=a+side*sign;pb=b+side*sign;rails.beam((*pa,h0+1.03),(*pb,h1+1.03),.042,.042)
   for j in range(4):
    p=pa+(pb-pa)*j/3;h=h0+(h1-h0)*j/3;rails.beam((*p,h),(*p,h+1.03),.032,.032)
  if lod==0:
   meshcol('canteen stair ramp '+st['name'],[[(*tuple(a-side),h0),(*tuple(b-side),h1),(*tuple(b+side),h1),(*tuple(a+side),h0)]])
   collider('canteen lower landing '+st['name'],landing,h0-.2,h0)
   meshcol('canteen stair guards '+st['name'],[[(*tuple(a+side*sg),h0),(*tuple(b+side*sg),h1),(*tuple(b+side*sg),h1+1.03),(*tuple(a+side*sg),h0+1.03)] for sg in [-1,1]])
   manifest['stairRoutes'].append({'name':st['name'],'points':[[*(a-along*.9),h0],[*a,h0],[*((a+b)/2),(h0+h1)/2],[*b,h1],[*(b+along*1.3),h1]]})
 # Pitched solar collectors are discrete framed panels, not a flat dark roof texture.
 rh=G+H;solar=part('tilted dark solar collector faces','solar');frames=part('collector aluminium frames and supports','silver metal');modules=0
 for row in range(8):
  for col in range(28):
   u=8+col*1.46;v=12.7+row*2.62;w=1.34;dep=2.35
   if v+dep>34.9:continue
   ps=[(*pt(u,v),rh+.78),(*pt(u+w,v),rh+.78),(*pt(u+w,v+dep),rh+.28),(*pt(u,v+dep),rh+.28)]
   solar.face(ps);modules+=1
   for a,b in zip(ps,ps[1:]+ps[:1]):frames.beam(a,b,.038,.035)
   if lod<2:
    for x in [u+.16,u+w-.16]:
     for y,h in [(v+.2,.74),(v+dep-.2,.32)]:p=pt(x,y);frames.beam((*p,rh+.08),(*p,rh+h),.035,.035)
 if lod==0:manifest['solarCollectors']=modules
 # Rooftop ducts, service towers, rail bases, blue tank and exposed teal pipes.
 equipment=part('rooftop mechanical casings','mechanical');ducts=part('rectangular roof ventilation ducts','silver metal');black=part('fan openings and grilles','vent shadow');pipe=part('exposed teal rooftop pipework','teal pipe');tank=part('blue horizontal roof tank','blue tank')
 for u,v,w,dep,h in [(7,4,3.2,3.2,2.5),(60,5,5.3,5.5,3.3)]:volume(cream,rect([u,v,u+w,v+dep]),rh,rh+h);volume(white,rect([u-.15,v-.15,u+w+.15,v+dep+.15]),rh+h,rh+h+.18)
 for idx,(u,v) in enumerate([(16,4),(23,4),(39,5),(47,5),(54,5),(52,9)]):
  volume(equipment,rect([u,v,u+3.4,v+2.6]),rh+.25,rh+1.8);volume(white,rect([u-.15,v-.15,u+3.55,v+2.75]),rh+.08,rh+.25)
  for k in [0,1]:
   p=pt(u+.95+k*1.45,v+1.3);tube(black,(*p,rh+1.8),(*p,rh+1.85),.53,.53,[16,12,8][lod])
   if lod<2:
    for j in range(6):
     an=j*math.pi/3;a0=(p[0]+.49*math.cos(an),p[1]+.49*math.sin(an),rh+1.86);equipment.beam((*p,rh+1.86),a0,.032,.032)
  volume(ducts,rect([u+3.4,v+.5,u+5.8,v+2.1]),rh+.55,rh+1.6)
 for u,v in [(27,3),(30,3),(27,6),(30,6)]:volume(part('rooftop dark pump units','vent shadow'),rect([u,v,u+1.5,v+1.7]),rh+.15,rh+1.6)
 a=pt(35,8.5);b=pt(39.4,8.5);tube(tank,(*a,rh+2),(*b,rh+2),1.12,1.12,[24,16,12][lod])
 for p in [a,b]:ellipsoid(tank,(*p,rh+2),(.85,.85,1.12),[16,12,8][lod],[8,6,4][lod])
 for u in [35.7,38.8]:
  for v in [7.5,9.5]:p=pt(u,v);frames.beam((*p,rh+.1),(*p,rh+1.15),.12,.12)
 for v in [6.5,10.3,11.2]:
  line(pipe,(14,v),(57,v),rh+.25,.095,.095)
 for u in [16,23,30,36,42,49,56]:line(pipe,(u,4),(u,11.2),rh+.27,.08,.08)
 for u in [23,31]:
  for v in [7,11]:p=pt(u,v);white.beam((*p,rh),(*p,rh+2.3),.23,.23)
 for v in [7,11]:line(white,(23,v),(31,v),rh+2.3,.24,.22)
 for u in [23,27,31]:line(white,(u,7),(u,11),rh+2.3,.24,.22)
 # Main sign uses a converted system font and ships as mesh, with the canonical name in UI.
 if lod<2:
  font=bpy.data.fonts.load('/System/Library/Fonts/STHeiti Medium.ttc');curve=bpy.data.curves.new('Canteen lettering','FONT');curve.body='学生食堂';curve.font=font;curve.size=.85;curve.align_x='CENTER';curve.extrude=.025
  obj=bpy.data.objects.new('Student canteen facade lettering',curve);coll.objects.link(obj);obj.parent=root;obj['placeId']='canteen';p=pt(30,36.03);obj.location=xyz((*p,G+H-.7));obj.rotation_euler=(math.pi/2,0,-math.atan2(D['frame']['u'][1],D['frame']['u'][0]));obj.data.materials.append(MATS['CANTEEN / orange sign'])
  bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.convert(target='MESH')
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
 for band in D['landscape']['paverBands']:
     fp=band['footprint'];q=[(*p,h) for p,h in zip(fp,band['heights'])];part('stone forecourt paving bands','roof').face(q if area(fp)>0 else list(reversed(q)))
 for marking in D['landscape']['markings']:
     part('scooter parking bay markings','yellow marking' if marking['color']=='yellow' else 'ivory metal').beam(marking['a'],marking['b'],marking['width'],.008)
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
     if lod==0:collider('canteen lamp '+str(x)+','+str(z),[[x-.10,z-.10],[x+.10,z-.10],[x+.10,z+.10],[x-.10,z+.10]],y,y+h)
 objects=[o for p in buckets.values() if (o:=p.finish(root))];objects += [o for o in coll.objects if o.type=='MESH' and o not in objects]
 for obj in objects:obj['placeId']='canteen'
 bpy.ops.object.select_all(action='DESELECT')
 for o in coll.objects:o.hide_set(False);o.select_set(True)
 bpy.context.view_layer.objects.active=root;file=OUT/f'canteen-lod{lod}.glb'
 bpy.ops.export_scene.gltf(filepath=str(file),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_cameras=False,export_lights=False,export_yup=True)
 manifest['lods'].append({'file':file.name,'distance':[0,240,600][lod],'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects),'meshObjects':len(objects),'bytes':file.stat().st_size})
 coll.hide_render=lod!=0
 for o in coll.objects:o.hide_set(lod!=0)
preview=bpy.data.collections.new('Preview only');scene.collection.children.link(preview)
mat('CANTEEN / studio ground',(.40,.45,.39),.95,0,'terrain');floor=Part('Studio floor','CANTEEN / studio ground',preview)
floor.face([(-300,-300,D['review']['groundHeight']),(300,-300,D['review']['groundHeight']),(300,300,D['review']['groundHeight']),(-300,300,D['review']['groundHeight'])])
pr=bpy.data.objects.new('Preview only root',None);preview.objects.link(pr);floor.finish(pr)
world=bpy.data.worlds.new('CANTEEN daylight');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.38,.46,.53,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65
light=bpy.data.lights.new('Sun','SUN');light.energy=3;light.angle=.12;sun=bpy.data.objects.new('Sun',light);scene.collection.objects.link(sun);sun.rotation_euler=(.6,-.4,-.8)
camdata=bpy.data.cameras.new('CANTEEN review camera');cam=bpy.data.objects.new('CANTEEN review camera',camdata);scene.collection.objects.link(cam);scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.render.resolution_x=1500;scene.render.resolution_y=1050;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
def camera(name):
    view=D['views'][name];p=view['position'];t=view['target'];cam.location=xyz((p[0],p[2],p[1]));target=Vector(xyz((t[0],t[2],t[1])));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();camdata.lens=36/(2*math.tan(math.radians(view['fov'])/2))*1050/1500
camera('overall');scene['sources']=json.dumps(D['sources']);scene['evidence']=json.dumps(D['evidence'])
# All signage is mesh geometry; remove orphan font datablocks from the source.
assert not any(o.type=='FONT' for o in bpy.data.objects)
for font in list(bpy.data.fonts):
 if font.filepath:bpy.data.fonts.remove(font,do_unlink=True)
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'canteen.blend'),compress=True)
(OUT/'canteen.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print('CANTEEN_COMPLETE',json.dumps(manifest['lods']))
if '--render' in sys.argv:
    for name in ['overall','front','rear','landscape']:
        camera(name);scene.render.filepath=str(HERE/(name+'.png'));bpy.ops.render.render(write_still=True)
