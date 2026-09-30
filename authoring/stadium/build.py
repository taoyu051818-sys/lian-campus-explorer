"""Photo-informed open coastal stadium. Local axes: X / depth / elevation."""
import bpy,json,math,random,sys
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'common'))
from geometry import Part,mat,MATS,xyz,wall,cap,area
ROOT=Path(__file__).resolve().parents[2];HERE=Path(__file__).parent;OUT=ROOT/'public/models/stadium';OUT.mkdir(parents=True,exist_ok=True)
D=json.loads((HERE/'design.json').read_text());scene=bpy.context.scene
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for col in list(bpy.data.collections):
 if col.name!='Collection':bpy.data.collections.remove(col)
scene.unit_settings.system='METRIC'
materials=[('ivory metal',(.73,.75,.71),.65,.12,'paint'),('concrete',(.49,.51,.47),.96,0,'plaster'),('blue seats',(.025,.18,.36),.36,.05,'paint'),('white seats',(.79,.80,.73),.46,0,'paint'),('seat shadow',(.075,.11,.13),.8,.12,'metal'),('silver metal',(.54,.58,.58),.3,.78,'metal'),('glass',(.025,.07,.088),.22,.2,'glass'),('track',(.012,.072,.21),.96,0,'paving'),('runoff',(.035,.20,.34),.98,0,'paving'),('white line',(.85,.88,.84),.94,0,'paint'),('grass',(.18,.31,.042),.98,0,'foliage'),('grass stripe',(.20,.34,.055),.98,0,'foliage'),('pale paving',(.54,.54,.48),.97,0,'stone'),('dark paving',(.12,.14,.14),.97,0,'paving'),('lawn',(.18,.29,.06),.99,0,'foliage'),('bark',(.30,.24,.15),.97,0,'bark'),('leaf shadow',(.055,.15,.023),.88,0,'foliage'),('leaf light',(.18,.29,.037),.9,0,'foliage'),('hedge',(.10,.20,.035),.95,0,'foliage'),('timber',(.28,.16,.07),.87,0,'wood'),('lamp',(.025,.035,.038),.48,.45,'metal'),('light strip',(.86,.91,.91),.35,.12,'paint')]
for args in materials:mat('STADIUM / '+args[0],*args[1:])
for k in ['leaf shadow','leaf light']:MATS['STADIUM / '+k].use_backface_culling=False
manifest={k:D[k] for k in ['asset','name','anchor','base','yaw','sources','evidence','views','review','landscape']}
manifest.update(lods=[],collisionVolumes=[],collisionMeshes=[],canopyBounds=[],stairRoutes=[],passageRoutes=[],height=31)
def volume(p,fp,z0,z1):
 if area(fp)<0:fp=list(reversed(fp))
 wall(p,fp,z0,z1);cap(p,fp,z1);cap(p,list(reversed(fp)),z0)
def collider(name,fp,z0,z1):manifest['collisionVolumes'].append({'name':name,'footprint':fp,'base':z0,'height':z1-z0})
def meshcol(name,faces):
 if not faces:return
 vs=[];inds=[];lookup={}
 for face in faces:
  vertices=[]
  for p in face:
   key=tuple(round(v,8) for v in (p[0],p[2],p[1]))
   if key not in lookup:lookup[key]=len(vs)//3;vs.extend(key)
   vertices.append(lookup[key])
  for i in range(1,len(face)-1):inds.extend([vertices[0],vertices[i+1],vertices[i]])
 manifest['collisionMeshes'].append({'name':name,'position':vs,'index':inds})
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
G=D['fieldHeight'];A=D['halfStraight'];R=D['standRadius'];L=2*math.pi*R+2*A;NR=D['lowerRows'];NU=D['upperRows'];DEP=D['rowDepth'];RISE=D['rowRise'];MID=D['concourseWidth']
def standpt(s,r=R):
 if s<math.pi*R:
  t=math.pi/2+s/R;return(-A+r*math.cos(t),r*math.sin(t))
 if s<math.pi*R+2*A:return(-A+s-math.pi*R,-r)
 t=-math.pi/2+(s-math.pi*R-2*A)/R;return(A+r*math.cos(t),r*math.sin(t))
def quad(s0,s1,r0,r1):return[standpt(s0,r0),standpt(s1,r0),standpt(s1,r1),standpt(s0,r1)]
def capsule(r,n):return[((A if math.cos(t)>=0 else -A)+r*math.cos(t),r*math.sin(t)) for t in [i*math.tau/n for i in range(n)]]
def allowed(s):return max(1,min(NR+NU,int((NR+NU)*min(s,L-s)/36)))
def rowdata(row):return R+row*DEP+(MID if row>=NR else 0),G+.35+(row+1)*RISE
def rect(x,z,w,d):return[(x-w/2,z-d/2),(x+w/2,z-d/2),(x+w/2,z+d/2),(x-w/2,z+d/2)]
SECTORS=26;STEP=L/SECTORS;AISLE=1.8;PORTALS={4,10,13,16,22}
for lod in range(3):
 random.seed(838);coll=bpy.data.collections.new(f'STADIUM LOD{lod}');scene.collection.children.link(coll);root=bpy.data.objects.new(f'STADIUM {lod}',None);coll.objects.link(root);root['placeId']='stadium';buckets={}
 def part(name,material):
  key=(name,material)
  if key not in buckets:buckets[key]=Part(name+' | '+material,'STADIUM / '+material,coll)
  return buckets[key]
 white=part('white stand cheek walls and copings','ivory metal');concrete=part('two tier seating terraces','concrete');metal=part('slender balustrades and fence posts','silver metal');paving=part('circulation concourses','pale paving');blue=part('individual blue bucket seats','blue seats');pale=part('individual white bucket seats','white seats');backs=part('seat support rails','seat shadow');stair=part('radial white aisle stair treads','ivory metal')
 def line(p,a,b,h,w=.055):p.beam((*a,h),(*b,h),w,w)
 def rail(a,b,h,posts=True):
  line(metal,a,b,h+1.1,.045);line(metal,a,b,h+.58,.029)
  if posts:
   n=max(1,math.ceil(math.dist(a,b)/1.6))
   for j in range(n+1):p=tuple(a[k]+(b[k]-a[k])*j/n for k in [0,1]);metal.beam((*p,h),(*p,h+1.1),.035,.035)
 # Blue eight-lane track and light blue D-zones; turf stops at the straight end line.
 n=[192,144,96][lod];outer=capsule(D['innerRadius']+D['lanes']*D['laneWidth']+2.4,n)
 cap(part('blue track runoff apron','runoff'),outer,G)
 inner=capsule(D['innerRadius'],n);out=capsule(D['innerRadius']+D['lanes']*D['laneWidth'],n);track=part('eight lane blue running track','track')
 for i in range(n):j=(i+1)%n;track.face([(*inner[i],G+.008),(*out[i],G+.008),(*out[j],G+.008),(*inner[j],G+.008)])
 for i in range(14):
  lo=-52.5+i*105/14;hi=-52.5+(i+1)*105/14;cap(part('natural turf mowing strips','grass stripe' if i%2 else 'grass'),[(lo,-34),(hi,-34),(hi,34),(lo,34)],G+.019)
 marking=part('track lane and staggered start markings','white line')
 for lane in range(9):
  p=capsule(D['innerRadius']+lane*D['laneWidth'],n)
  for a,b in zip(p,p[1:]+p[:1]):line(marking,a,b,G+.027,.055)
 for lane in range(8):
  z=-D['innerRadius']-(lane+.5)*D['laneWidth'];x=-25+lane*2.5
  line(marking,(x,z-.61),(x,z+.61),G+.034,.09)
  for at in [-A,A]:line(marking,(at,z-.61),(at,z+.61),G+.034,.08)
 # Continuous top surfaces and risers are combined into a small number of collision meshes.
 standfaces=[];walkfaces=[];guardfaces=[];seatcount=0
 def surface(fp,h,target,physical=True):
  if area(fp)<0:fp=list(reversed(fp))
  face=[(*p,h) for p in fp];target.face(face)
  if lod==0 and physical:standfaces.append(face)
 def riser(a,b,lo,hi,target=concrete):
  face=[(*a,lo),(*b,lo),(*b,hi),(*a,hi)];target.face(face)
  if lod==0:standfaces.append(face)
 # Seat blocks have open aisles; the sea-facing tips lose rows progressively.
 for k in range(SECTORS):
  s0=k*STEP+(1.42 if k in PORTALS else AISLE/2);s1=(k+1)*STEP-(1.42 if k+1 in PORTALS else AISLE/2);segments=max(2,math.ceil((s1-s0)/[1.6,2.4,4][lod]));
  for row in range(NR+NU):
   r,h=rowdata(row);upper=row>=NR
   for j in range(segments):
    a=s0+(s1-s0)*j/segments;b=s0+(s1-s0)*(j+1)/segments;mid=(a+b)/2
    if row>=allowed(mid):continue
    # Press gallery occupies the central upper tier of the far end, with a shaded public deck in front.
    if upper and abs(mid-math.pi*R/2)<12:continue
    fp=quad(a,b,r,r+DEP);surface(fp,h,concrete);riser(fp[0],fp[1],G if row==0 else h-RISE,h)
    if row==allowed(mid)-1 and row<NR+NU-1:riser(fp[2],fp[3],G-.12,h,white)
   # Individual moulded bucket backs, seat pans and support rails follow the arc.
   count=max(1,math.floor((s1-s0)*(r+.42)/R/.54));
   for j in range(count):
    ss=s0+(s1-s0)*(j+.5)/count
    if row>=allowed(ss) or upper and abs(ss-math.pi*R/2)<12:continue
    p=Vector(standpt(ss,r+.43));tan=(Vector(standpt(ss+.02,r+.43))-Vector(standpt(ss-.02,r+.43))).normalized();normal=Vector((tan.y,-tan.x))
    pattern=math.sin(j*.19+k*.8)+.78*math.cos(row*.51-k*.6);target=pale if pattern>(-.05 if upper else .85) else blue
    def seatpt(x,z,y):q=p+tan*x+normal*z;return(q.x,q.y,y)
    if lod<2:
     # Separate seat pan and curved/slightly reclined back. Arm gaps remain visible.
     target.face([seatpt(-.225,-.2,h+.20),seatpt(.225,-.2,h+.20),seatpt(.225,.2,h+.24),seatpt(-.225,.2,h+.24)])
     target.face([seatpt(-.225,.18,h+.21),seatpt(.225,.18,h+.21),seatpt(.215,.26,h+.56),seatpt(.16,.28,h+.61),seatpt(-.16,.28,h+.61),seatpt(-.215,.26,h+.56)])
     if lod==0:
      for sign in [-1,1]:backs.beam(seatpt(sign*.15,0,h+.04),seatpt(sign*.15,.09,h+.24),.035,.035)
      target.face([seatpt(-.225,-.2,h+.15),seatpt(.225,-.2,h+.15),seatpt(.225,-.2,h+.20),seatpt(-.225,-.2,h+.20)])
    elif j%2==0:
     target.face([seatpt(-.45,-.18,h+.22),seatpt(.45,-.18,h+.22),seatpt(.45,.2,h+.22),seatpt(-.45,.2,h+.22)])
     target.face([seatpt(-.45,.2,h+.22),seatpt(.45,.2,h+.22),seatpt(.45,.25,h+.58),seatpt(-.45,.25,h+.58)])
    seatcount+=1
  # Mid-level circulation belt and rear deck remain continuous except at open portal cuts.
  for r0,r1,h in [(R+NR*DEP,R+NR*DEP+MID,G+.35+NR*RISE),(R+(NR+NU)*DEP+MID,R+(NR+NU)*DEP+MID+1.4,G+.35+(NR+NU)*RISE)]:
   for j in range(segments):
    a=s0+(s1-s0)*j/segments;b=s0+(s1-s0)*(j+1)/segments
    if allowed((a+b)/2)<(NR if r0<R+15 else NR+NU):continue
    surface(quad(a,b,r0,r1),h,paving)
    if r0>R+15:
     pa,pb=standpt(a,r1),standpt(b,r1);rail(pa,pb,h);riser(pb,pa,G-.12,h,white)
  # White retaining cheeks beside each seating sector define the stepped blocks.
  for ss in [s0,s1]:
   maxrow=min(allowed(ss),NR+NU)
   for row in range(maxrow):
    r,h=rowdata(row);pa,pb=standpt(ss,r),standpt(ss,r+DEP);white.beam((*pa,h+.10),(*pb,h+.10),.13,.20)
 # Radial stairs, portal doors and guarded intermediate landings.
 for k in range(1,SECTORS):
  ss=k*STEP
  if allowed(ss)<NR+NU:continue
  portal=k in PORTALS;half=1.42 if portal else AISLE/2
  if not portal:
   for j in range(2):
    a=R-DEP+DEP*j/2;b=a+DEP/2;hh=G+.35*(j+1)/2;fp=quad(ss-half,ss+half,a,b);surface(fp,hh,stair,False);riser(fp[0],fp[1],G+.35*j/2,hh,stair)
   if lod==0:
    fp=quad(ss-half,ss+half,R-DEP,R);walkfaces.append([(*fp[0],G),(*fp[1],G),(*fp[2],G+.35),(*fp[3],G+.35)])
  for row in range(NR+NU):
   r,h=rowdata(row)
   if portal and row<NR:continue
   # Two 190 mm risers per seating row produce walkable, visually discrete stairs.
   for j in range(2):
    a=r+DEP*j/2;b=a+DEP/2;hh=h-RISE/2*(1-j);fp=quad(ss-half,ss+half,a,b);surface(fp,hh,stair,False);riser(fp[0],fp[1],hh-RISE/2,hh,stair)
   if lod==0:
    fp=quad(ss-half,ss+half,r,r+DEP);walkfaces.append([(*fp[0],h-RISE),(*fp[1],h-RISE),(*fp[2],h),(*fp[3],h)])
  outerR=R+(NR+NU)*DEP+MID+1.4;top=G+.35+(NR+NU)*RISE
  outerFP=quad(ss-half,ss+half,outerR-1.4,outerR);surface(outerFP,top,paving)
  riser(outerFP[2],outerFP[3],G+3.05 if portal else G-.12,top,white)
  rail(outerFP[2],outerFP[3],top)
  r0=R+NR*DEP;r1=r0+MID;hmid=G+.35+NR*RISE;fp=quad(ss-half,ss+half,r0,r1);surface(fp,hmid,paving,False)
  if lod==0:walkfaces.append([(*p,hmid) for p in fp])
  if portal:
   # The entrance crosses below both tiers. Independent lintel and cheeks keep the opening hollow.
   rback=R+(NR+NU)*DEP+MID+1.4
   for side in [-1,1]:
    a,b=standpt(ss+side*1.42,R-.3),standpt(ss+side*1.42,rback);white.beam((*a,G+1.5),(*b,G+1.5),.24,3)
   fp=quad(ss-1.42,ss+1.42,R-.3,rback);surface(fp,G+.04,paving,False)
   # Collision ceiling, upper ramp and walls reflect the model, never a solid entrance prism.
   roofp=quad(ss-1.42,ss+1.42,R+NR*DEP,rback);surface(roofp,G+3.05,concrete,False)
   if lod==0:
    walkfaces.append([(*p,G+.04) for p in fp]);walkfaces.append(list(reversed([(*p,G+3.05) for p in roofp])))
    for side in [-1,1]:a,b=standpt(ss+side*1.42,R-.3),standpt(ss+side*1.42,rback);guardfaces.append([(*a,G),(*b,G),(*b,G+3),(*a,G+3)])
    manifest['passageRoutes'].append({'name':f'portal {k}','points':[[*standpt(ss,r),G+.04] for r in [rback+2,rback-.4,R+18,R+12,R+5,R-2]]})
  elif k in [8,13+1,19]:
   if lod==0:
    manifest['stairRoutes'].append({'name':f'aisle {k}','points':[[*standpt(ss,R-1),G],[*standpt(ss,R),G+.35],[*standpt(ss,R+NR*DEP),hmid],[*standpt(ss,R+NR*DEP+MID),hmid],[*standpt(ss,R+(NR+NU)*DEP+MID),G+.35+(NR+NU)*RISE]]})
  # Fine handrails terminate at landing edges, leaving the aisle centre clear.
  for side in [-1,1]:
   a,b=standpt(ss+side*half,R),standpt(ss+side*half,R+NR*DEP)
   if not portal:metal.beam((*a,G+1.2),(*b,hmid+.9),.044,.044)
 # Gallery at the far end: set back glazing, square piers and a shallow flat terrace.
 gallery=part('recessed central officials gallery','concrete');glass=part('shaded gallery windows and doors','glass');hmid=G+.35+NR*RISE;top=G+.35+(NR+NU)*RISE
 volume(paving,rect(-102,0,15,26),hmid-.25,hmid)
 volume(gallery,rect(-108,0,3,25),hmid,top-.5)
 volume(white,rect(-103,0,14,27.5),top-.5,top)
 if lod==0:
  collider('stadium gallery rear rooms',rect(-108,0,3,25),hmid,top-.5);collider('stadium gallery roof',rect(-103,0,14,27.5),top-.5,top);collider('stadium gallery deck',rect(-102,0,15,26),hmid-.25,hmid)
 for z in [-12,-6,0,6,12]:
  white.box((-97,z,(hmid+top)/2),(.42,.42,top-hmid))
  if lod==0:collider('stadium gallery pier '+str(z),rect(-97,z,.42,.42),hmid,top)
 for z in range(-10,12,3):glass.face([(-106.48,z-.9,hmid+1),(-106.48,z+.9,hmid+1),(-106.48,z+.9,hmid+2.3),(-106.48,z-.9,hmid+2.3)])
 rail((-95,-13),(-95,13),hmid)
 # Two rising viewing wings: deck thickness, open columns and parapets, no filled triangular wall.
 frame=part('folded elevated viewing platform','ivory metal');deck=part('folded platform dark deck treads','dark paving')
 def ridge(z):
  z=abs(z)
  if z<4:return top+12
  if z<26:return top+12-(z-4)*8.4/22
  return top+3.6-(z-26)*1.6/12
 for side in [-1,1]:
  for j in range(38):
   z0=side*j;z1=side*(j+1);h0=ridge(z0);h1=ridge(z1);hh=max(h0,h1)
   volume(deck,rect(-112,(z0+z1)/2,9,1),min(h0,h1)-.2,hh)
  for x in [-116.7,-107.3]:
   for za,zb in [(0,4),(4,26),(26,38)]:frame.beam((x,side*za,ridge(za)-.2),(x,side*zb,ridge(zb)-.2),.38,.65);metal.beam((x,side*za,ridge(za)+1.05),(x,side*zb,ridge(zb)+1.05),.06,.06)
 for z in range(-36,37,4):
  h=ridge(z)
  for x in [-115.8,-108.2]:
   frame.box((x,z,(top+h)/2),(.38,.45,h-top));metal.beam((x,z,h),(x,z,h+1.05),.035,.035)
   if lod==0:collider('stadium viewing frame column '+str(x)+' '+str(z),rect(x,z,.38,.45),top,h)
  if lod<2:frame.beam((-116.7,z,h-.15),(-107.3,z,h-.15),.20,.23)
 volume(paving,rect(-112,0,11,80),top-.35,top)
 if lod==0:collider('stadium viewing platform lower deck',rect(-112,0,11,80),top-.35,top)
 for side in [-1,1]:rail((-117.5,side*40),(-106.5,side*40),top)
 # Field perimeter on the open seaside: fine mesh fence, gate openings and four light banks.
 fence=part('open seaside perimeter fence mesh','silver metal');shadow=part('floodlight housings','lamp');lens=part('floodlight lenses','light strip')
 for i in range(30):
  x0=-A+i*2*A/30;x1=-A+(i+1)*2*A/30
  if abs((x0+x1)/2)<4.3:continue
  z=50;metal.beam((x0,z,G),(x0,z,G+2),.06,.06)
  for h in [.2,1.0,2.0]:line(fence,(x0,z),(x1,z),G+h,.025)
  if lod<2:
   for j in range(1,8):x=x0+(x1-x0)*j/8;fence.beam((x,z,G+.2),(x,z,G+2),.012,.012)
  if lod==0:guardfaces.append([(x0,z,G),(x1,z,G),(x1,z,G+2),(x0,z,G+2)])
 for x,z in [(-71,-77),(71,-77),(-61,57),(61,57)]:
  tube(metal,(x,z,G),(x,z,G+30),.30,.12,[12,10,8][lod]);frame.box((x,z,G+.25),(1.3,1.3,.5))
  if lod==0:collider(f'stadium floodlight base {x} {z}',rect(x,z,1.3,1.3),G,G+.5);collider(f'stadium floodlight pole {x} {z}',rect(x,z,.4,.4),G+.5,G+30)
  for row in range(3):
   for col in range(5):
    xx=x+(col-2)*.55;hh=G+28.6+row*.5;shadow.box((xx,z,hh),(.43,.34,.34));lens.box((xx,z+(.18 if z<0 else -.18),hh),(.34,.025,.25))
  for hh in [G+28.6,G+29.1,G+29.6]:metal.beam((x-1.4,z,hh),(x+1.4,z,hh),.08,.08)
 # Full-size and portable goal frames; thin net strands do not become solid walls.
 for x,z,width,height in [(-52.5,0,7.32,2.44),(52.5,0,7.32,2.44),(-25,-24,3,1.8),(24,23,3,1.8)]:
  sign=1 if x>0 else -1;back=x+sign*1.6
  for zz in [z-width/2,z+width/2]:
   for xx in [x,back]:metal.beam((xx,zz,G+.03),(xx,zz,G+height),.065,.065)
   metal.beam((x,zz,G+height),(back,zz,G+height),.06,.06)
  for xx in [x,back]:metal.beam((xx,z-width/2,G+height),(xx,z+width/2,G+height),.075,.075)
  if lod<2:
   net=part('goal net strands','white line')
   for j in range(1,round(width/.18)):zz=z-width/2+j*.18;net.beam((back,zz,G+.04),(back,zz,G+height),.009,.009)
   for j in range(1,round(height/.18)):net.beam((back,z-width/2,G+j*.18),(back,z+width/2,G+j*.18),.009,.009)
 if lod==0:
  meshcol('stadium stand surfaces',standfaces);meshcol('stadium aisle ramps and tunnel floors',walkfaces);meshcol('stadium tunnel and seaside guards',guardfaces);manifest['representedSeats']=seatcount
 # Landscape geometry is appended below, using the same checked plant positions for every LOD.
 # Terrain-following paving, continuous lawns, hedges and branch/leaf canopies.
 paving=part('site perimeter paving','pale paving');lawn=part('connected planted lawns','lawn');curb=part('planting curbs','ivory metal')
 for path in D['landscape']['paths']:
     q=[(*p,h) for p,h in zip(path['footprint'],path['heights'])];part('terrain conforming perimeter paving','dark paving' if path['tone'] else 'pale paving').face(q if area(path['footprint'])>0 else list(reversed(q)))
 for band in D['landscape'].get('paverBands',[]):
     fp=band['footprint'];q=[(*p,h) for p,h in zip(fp,band['heights'])];part('stone forecourt paving bands','roof').face(q if area(fp)>0 else list(reversed(q)))
 for marking in D['landscape'].get('markings',[]):
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
     if lod==0:collider('stadium lamp '+str(x)+','+str(z),[[x-.10,z-.10],[x+.10,z-.10],[x+.10,z+.10],[x-.10,z+.10]],y,y+h)
 objects=[o for p in buckets.values() if (o:=p.finish(root))];objects += [o for o in coll.objects if o.type=='MESH' and o not in objects]
 for obj in objects:obj['placeId']='stadium'
 bpy.ops.object.select_all(action='DESELECT')
 for o in coll.objects:o.hide_set(False);o.select_set(True)
 bpy.context.view_layer.objects.active=root;file=OUT/f'stadium-lod{lod}.glb'
 bpy.ops.export_scene.gltf(filepath=str(file),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_cameras=False,export_lights=False,export_yup=True)
 manifest['lods'].append({'file':file.name,'distance':[0,290,680][lod],'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects),'meshObjects':len(objects),'bytes':file.stat().st_size})
 coll.hide_render=lod!=0
 for o in coll.objects:o.hide_set(lod!=0)
preview=bpy.data.collections.new('Preview only');scene.collection.children.link(preview)
mat('STADIUM / studio ground',(.29,.35,.20),.95,0,'terrain');floor=Part('Studio floor','STADIUM / studio ground',preview)
t=D['landscape']['terrain'];vs=t['position']
for i in range(0,len(t['index']),3):
 q=[t['index'][i+j]*3 for j in range(3)];floor.face([(vs[k],vs[k+2],vs[k+1]) for k in reversed(q)])
pr=bpy.data.objects.new('Preview only root',None);preview.objects.link(pr);floor.finish(pr)
world=bpy.data.worlds.new('STADIUM daylight');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.38,.46,.53,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65
light=bpy.data.lights.new('Sun','SUN');light.energy=3;light.angle=.12;sun=bpy.data.objects.new('Sun',light);scene.collection.objects.link(sun);sun.rotation_euler=(.6,-.4,-.8)
camdata=bpy.data.cameras.new('STADIUM review camera');cam=bpy.data.objects.new('STADIUM review camera',camdata);scene.collection.objects.link(cam);scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.render.resolution_x=1500;scene.render.resolution_y=1050;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
def camera(name):
    view=D['views'][name];p=view['position'];t=view['target'];cam.location=xyz((p[0],p[2],p[1]));target=Vector(xyz((t[0],t[2],t[1])));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();camdata.lens=36/(2*math.tan(math.radians(view['fov'])/2))*1050/1500
camera('overall');scene['sources']=json.dumps(D['sources']);scene['evidence']=json.dumps(D['evidence'])
# All signage is mesh geometry; remove orphan font datablocks from the source.
assert not any(o.type=='FONT' for o in bpy.data.objects)
for font in list(bpy.data.fonts):
 if font.filepath:bpy.data.fonts.remove(font,do_unlink=True)
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'stadium.blend'),compress=True)
(OUT/'stadium.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print('STADIUM_COMPLETE',json.dumps(manifest['lods']))
if '--render' in sys.argv:
    for name in ['overall','front','stairs','rear','landscape']:
        camera(name);scene.render.filepath=str(HERE/(name+'.png'));bpy.ops.render.render(write_still=True)
