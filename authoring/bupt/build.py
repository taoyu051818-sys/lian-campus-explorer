"""BUPT as-built pair: red/charcoal louver towers, white wings and stepped roof gardens."""
import bpy,json,math,random,sys
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'common'))
from geometry import Part,mat,MATS,xyz,wall,cap,area,inset,strip
ROOT=Path(__file__).resolve().parents[2];HERE=Path(__file__).parent;OUT=ROOT/'public/models/bupt';OUT.mkdir(parents=True,exist_ok=True)
D=json.loads((HERE/'design.json').read_text());H=D['storeyHeight'];BASE=min(D['buildingBases'].values())
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
 if c.name!='Collection':bpy.data.collections.remove(c)
scene=bpy.context.scene;scene.unit_settings.system='METRIC'
materials=[('ivory metal',(.72,.75,.73),.44,.16,'paint'),('silver louvers',(.70,.73,.72),.35,.55,'metal'),('red ceramic',(.43,.13,.072),.82,0,'brick'),('charcoal cladding',(.12,.145,.15),.65,.12,'concrete'),('blue glazing',(.04,.085,.10),.2,.08,'glass'),('glazing light',(.09,.15,.17),.24,.08,'glass'),('window shadow',(.085,.095,.092),.74,0,'paint'),('roof',(.55,.56,.51),.93,0,'roofMetal'),('terracotta',(.43,.20,.11),.94,0,'paving'),('rail',(.19,.22,.22),.4,.7,'metal'),('concrete columns',(.51,.54,.53),.84,0,'concrete'),('pale paving',(.63,.65,.61),.96,0,'stone'),('dark paving',(.13,.15,.15),.98,0,'paving'),('lawn',(.17,.27,.065),.99,0,'foliage'),('bark',(.30,.24,.15),.97,0,'bark'),('leaf shadow',(.075,.19,.035),.87,0,'foliage'),('leaf light',(.23,.35,.065),.88,0,'foliage'),('hedge',(.105,.23,.046),.95,0,'foliage'),('timber',(.28,.16,.07),.87,0,'wood'),('lamp',(.04,.048,.045),.48,.45,'metal'),('light strip',(.95,.88,.64),.4,0,'paint')]
for args in materials:mat('BUPT / '+args[0],*args[1:])
for k in ['leaf shadow','leaf light']:MATS['BUPT / '+k].use_backface_culling=False
manifest={k:D[k] for k in ['asset','name','anchor','base','yaw','sources','evidence','views','review','landscape']}
manifest.update(lods=[],collisionVolumes=[],collisionMeshes=[],canopyBounds=[],stairRoutes=[],terraceChecks=[],courtyards=D['courtyards'],height=H*6+3.2)
def pt(g,u,v):
 f=D['frames'][g];return tuple(f['origin'][i]+f['u'][i]*u+f['v'][i]*v for i in [0,1])
def rect(g,r):
 x,y,X,Y=r;return [pt(g,x,y),pt(g,X,y),pt(g,X,Y),pt(g,x,Y)]
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
for lod in range(3):
 random.seed(218);coll=bpy.data.collections.new(f'BUPT LOD{lod}');scene.collection.children.link(coll)
 root=bpy.data.objects.new(f'BUPT {lod}',None);coll.objects.link(root);root['placeId']='bupt';buckets={}
 def part(name,material):
  key=(name,material)
  if key not in buckets:buckets[key]=Part(name+' | '+material,'BUPT / '+material,coll)
  return buckets[key]
 white=part('white rectangular window frames','ivory metal');slabs=part('floor plates and roof planes','roof');silver=part('horizontal silver sun louvers','silver louvers');dark=part('charcoal end tower panels','charcoal cladding');red=part('brick red end tower panels','red ceramic');glass=part('recessed blue gray windows','blue glazing');glass2=part('recessed blue gray windows','glazing light');cols=part('open ground colonnades','concrete columns');rails=part('terrace guardrails','rail');seams=part('panel joints and window mullions','window shadow');pergola=part('open white roof pergolas','ivory metal')
 def guard(name,a,b,h,skip=None):
  # Real gaps in both mesh and collision keep stair/landing connections open.
  d=Vector(b)-Vector(a);length=d.length;n=max(1,math.ceil(length/.6));faces=[]
  for k in range(n):
   p=Vector(a)+d*k/n;q=Vector(a)+d*(k+1)/n;mid=(p+q)/2
   if skip and skip(mid):continue
   for dh in [.12,1.08]:rails.beam((*p,h+dh),(*q,h+dh),.038,.038)
   if k%[2,3,5][lod]==0:rails.beam((*p,h),(*p,h+1.08),.032,.032)
   faces.append([(*p,h),(*q,h),(*q,h+1.10),(*p,h+1.10)])
  if lod==0:meshcol(name,faces)
 for b in D['blocks']:
  g=b['id'][0];base=D['buildingBases'][g];fp=b['outline'];floors=b['floors'];start=b['startFloor'];r=b['rect'];iswhite=b['style']=='white';skin=white if iswhite else red if b['style'].startswith('red') else dark
  ground=inset(fp,2.05);facade=inset(fp,.35)
  if start==0:
   wall(glass,ground,base+.14,base+H-.2)
   if lod==0:collider('bupt '+b['id']+' ground rooms',ground,base-1,base+H-.18)
   for a,c in zip(inset(fp,.6),inset(fp,.6)[1:]+inset(fp,.6)[:1]):
    count=max(1,round(math.dist(a,c)/5.5))
    for j in range(count):
     t=j/count;p=tuple(a[k]*(1-t)+c[k]*t for k in [0,1]);cf=[(p[0]-.23,p[1]-.23),(p[0]+.23,p[1]-.23),(p[0]+.23,p[1]+.23),(p[0]-.23,p[1]+.23)];volume(skin if not iswhite else cols,cf,base-.15,base+H)
     if lod==0:collider('bupt '+b['id']+f' column {j} {a}',cf,base-.15,base+H)
  if start>0:
   # Built-photo end core: solid white outer blades with recessed open stair flights.
   core=part('white end stair core blades','ivory metal');steps=part('recessed core stair flights','concrete columns')
   for rr in [[r[0],r[1],r[2],r[1]+1.0],[r[0],r[1]+1.0,r[0]+1.0,r[3]]]:
    cf=rect(g,rr);volume(core,cf,base-.1,base+H*start)
    if lod==0:collider('bupt northwest white core '+str(rr),cf,base-.1,base+H*start)
   for floor in range(start):
    h=base+floor*H;fp0=rect(g,[r[0]+1,r[1]+1,r[2],r[3]]);volume(slabs,fp0,h-.18,h)
    if lod==0:collider('bupt northwest core floor '+str(floor),fp0,h-.18,h)
    for side in [0,1]:
     aa=Vector(pt(g,3 if side==0 else 13,3+side*2.5));bb=Vector(pt(g,13 if side==0 else 3,3+side*2.5));rise=H/2;n=13;normal=Vector((-(bb-aa).y,(bb-aa).x)).normalized()*.8
     for j in range(n):
      aa0=aa+(bb-aa)*j/n;bb0=aa+(bb-aa)*(j+1)/n;z=h+side*rise+rise*(j+1)/n;volume(steps,[tuple(aa0-normal),tuple(bb0-normal),tuple(bb0+normal),tuple(aa0+normal)],z-.15,z)
     rails.beam((*aa,h+side*rise+1),(*bb,h+(side+1)*rise+1),.035,.035)
   # Interior core is enclosed; only garden stairs are part of the outdoor walking route.
   corefp=rect(g,[r[0]+1,r[1]+1,r[2],r[3]])
   if lod==0:collider('bupt enclosed northwest stair core',corefp,base-.1,base+H*start)
   wall(glass,corefp,base+.2,base+H*start-.2)
   for lev in range(1,start):
    for aa,bb in zip(corefp,corefp[1:]+corefp[:1]):white.beam((*aa,base+H*lev),(*bb,base+H*lev),.16,.24)
   # Slim vertical recess in the otherwise plain white end face.
   aa,bb=pt(g,10,-.012),pt(g,12,-.012);glass.face([(*aa,base+H*1.4),(*bb,base+H*1.4),(*bb,base+H*3.7),(*aa,base+H*3.7)])
  for level in range(max(1,start),floors):
   h=base+level*H
   volume(slabs,fp,h-.22,h)
   if lod==0:collider(f'bupt {b["id"]} slab {level}',fp,h-.22,h);collider(f'bupt {b["id"]} rooms {level}',facade,h,h+H-.22)
   # Separate recessed glazing and opaque panels, with a narrow dark reveal at each opening.
   wall(skin,facade,h+.06,h+H-.22)
   for edge,(a,c) in enumerate(zip(fp,fp[1:]+fp[:1])):
    d=(Vector(c)-Vector(a)).normalized();normal=Vector((d.y,-d.x));length=math.dist(a,c);count=max(1,round(length/(1.72 if iswhite else 3.35)));step=length/count
    for j in range(count):
     margin=.28 if iswhite else .78;pa=Vector(a)+d*(j*step+margin)-normal*.12;pb=Vector(a)+d*((j+1)*step-margin)-normal*.12
     pane=glass2 if (j+level)%5==0 else glass;z0=h+.83 if iswhite else h+1.05;z1=h+H-.45 if iswhite else h+H-.70
     pane.face([(*pa,z0),(*pb,z0),(*pb,z1),(*pa,z1)])
     if lod<2:
      for p in [pa,pb]:seams.beam((*p,z0),(*p,z1),.05,.055)
      seams.beam((*pa,z0),(*pb,z0),.05,.055);seams.beam((*pa,z1),(*pb,z1),.05,.055)
      if j%3==0:
       mid=(pa+pb)/2;seams.beam((*mid,z0),(*mid,z1),.05,.055)
     if iswhite:
      # Deep white reveals around every bay cast their own shadows.
      for p in [Vector(a)+d*j*step,Vector(a)+d*(j+1)*step]:white.beam((*p,h+.65),(*p,h+H-.19),.24,.33)
    if iswhite:
     white.beam((*a,h+.29),(*c,h+.29),.34,.65);white.beam((*a,h+H-.16),(*c,h+H-.16),.34,.3)
    else:
     for dh in ([.10,.43,.77,1.11,2.70,3.06,3.48] if lod==0 else [.12,.64,1.1,2.7,3.48] if lod==1 else [.15,.9,2.8,3.48]):
      a1=Vector(a)+normal*.30;b1=Vector(c)+normal*.30;silver.beam((*a1,h+dh),(*b1,h+dh),.24,.075 if lod<2 else .09)
     if lod<2:
      for j in range(math.ceil(length/3.4)+1):
       p=Vector(a)+d*min(length,j*3.4)+normal*.30;silver.beam((*p,h+.06),(*p,h+H-.15),.038,.07)
   if not iswhite and lod<2:
    # Ceramic/panel joints are subtle and behind the detached louvers.
    for a,c in zip(facade,facade[1:]+facade[:1]):
     for dh in [.38,1.95,3.38]:seams.beam((*a,h+dh),(*c,h+dh),.012,.018,False)
  rh=base+floors*H;volume(slabs,fp,rh-.23,rh)
  if lod==0:collider('bupt '+b['id']+' roof',fp,rh-.23,rh)
  strip(skin,fp,inset(fp,.22),rh-.1,rh+.75)
  if not iswhite:
   # Open louver crown surrounds the rooftop service enclosure.
   for a,c in zip(fp,fp[1:]+fp[:1]):
    for dh in ([1.1,1.45,1.8,2.15,2.5,2.85] if lod<2 else [1.1,1.8,2.5]):silver.beam((*a,rh+dh),(*c,rh+dh),.22,.075)
    n=max(1,round(math.dist(a,c)/4.5))
    for j in range(n):
     p=tuple(a[k]+(c[k]-a[k])*j/n for k in [0,1]);silver.beam((*p,rh+.6),(*p,rh+3),.09,.09)
   eq=rect(g,[r[0]+3,r[1]+3,r[0]+8.4,r[1]+8]);volume(skin,eq,rh,rh+2.5)
  elif b['id']!='B_four_storey' and start==0:
   along=0 if r[2]-r[0]>r[3]-r[1] else 1;length=(r[2]-r[0]) if along==0 else (r[3]-r[1]);n=max(2,round(length/5.3))
   for j in range(n+1):
    t=j/n
    a=pt(g,r[0]+2+(r[2]-r[0]-4)*t,r[1]+2) if along==0 else pt(g,r[0]+2,r[1]+2+(r[3]-r[1]-4)*t)
    c=pt(g,r[0]+2+(r[2]-r[0]-4)*t,r[3]-2) if along==0 else pt(g,r[2]-2,r[1]+2+(r[3]-r[1]-4)*t)
    for p in [a,c]:pergola.beam((*p,rh),(*p,rh+2.9),.34,.34)
    pergola.beam((*a,rh+2.9),(*c,rh+2.9),.35,.4)
   for shift in [2,4.6,7.2,9.8,12.4]:
    a=pt(g,r[0]+2,r[1]+shift) if along==0 else pt(g,r[0]+shift,r[1]+2)
    c=pt(g,r[2]-2,r[1]+shift) if along==0 else pt(g,r[0]+shift,r[3]-2)
    pergola.beam((*a,rh+2.9),(*c,rh+2.9),.18,.22)
 # Multi-level open links retain actual ground passages between end towers and wings.
 for link in D['connectors']:
  g=link['name'][0];fp=link['outline'];r=link['rect'];base=D['buildingBases'][g]
  for level in link['levels']:
   h=base+H*level;volume(part('open connector floor decks','ivory metal'),fp,h-.24,h)
   if lod==0:collider(f'bupt {link["name"]} floor {level}',fp,h-.24,h)
   pairs=[(0,1),(2,3)] if r[2]-r[0] < r[3]-r[1] else [(1,2),(3,0)]
   for i,j in pairs:guard(f'bupt {link["name"]} guard {level} {i}',fp[i],fp[j],h)
 # Roof gardens are true separate height levels. The lower court remains open to the sky.
 terrace=part('stepped garden retaining walls','concrete columns');paving=part('stepped garden paving','pale paving');lawn=part('roof garden planted panels','lawn');curb=part('roof garden stone borders','ivory metal')
 for t in D['terraces']:
  g=t['id'][0];fp=t['outline'];base=D['buildingBases'][g];h=base+t['height'];r=t['rect']
  if t['height']>0:
   volume(terrace,fp,base-.14,h-.16);volume(paving,fp,h-.16,h)
   if lod==0:collider('bupt terrace '+t['id'],fp,base-.14,h)
  else:
   volume(paving,fp,h-.15,h)
   if lod==0:collider('bupt terrace '+t['id'],fp,h-.15,h)
  if lod==0:manifest['terraceChecks'].append({'name':t['id'],'point':list(pt(g,(r[0]+r[2])/2,r[1]+3))+[h]})
  for i,a in enumerate(fp):
   c=fp[(i+1)%len(fp)]
   # Skip guards where a building adjoins; clear all stair arrival/departure slots.
   def skip(p):
    for st in D['stairs']:
     if st['group']!=g:continue
     for e in [st['a'],st['b']]:
      if (p-Vector(pt(g,*e))).length<st['width']/2+1.15:return True
    return False
   if t['height']>.01:guard('bupt terrace guard '+t['id']+str(i),a,c,h,skip)
  # Two narrow planting panels frame the continuous central stair promenade.
  if r[2]-r[0]>5 and r[3]-r[1]>8:
   boxes=[[r[0]+1.1,r[1]+2,r[2]-1.3,r[1]+6.1],[r[0]+1.1,r[3]-6.1,r[2]-1.3,r[3]-2]]
   for box in boxes:
    if box[2]-box[0]<1:continue
    pp=rect(g,box);volume(curb,pp,h+.015,h+.14);cap(lawn,inset(pp,.16),h+.16)
  # Orthogonal joints in the photographed paving, omitted only in the distant LOD.
  if lod==0:
   for x in range(math.ceil(r[0]),math.floor(r[2]),2):
    a,c=pt(g,x,r[1]),pt(g,x,r[3]);seams.beam((*a,h+.007),(*c,h+.007),.011,.006,False)
 # Raised planters surround the sunken entrance court with a grid of grass squares.
 g='A';base=D['buildingBases'][g]
 court=rect(g,[40,16.6,56.4,33]);volume(part('open recessed entrance court paving','pale paving'),court,base-.12,base)
 if lod==0:collider('bupt A open court paving',court,base-.12,base)
 for x in [42,46,50,54]:
  for y in [5,9,13]:
   fp=rect('A',[x-1.5,y-1.5,x+1.5,y+1.5]);volume(curb,fp,base,base+.1);cap(lawn,inset(fp,.12),base+.12)
 # Real stair treads with smooth matching collision ramps and open guard ends.
 stairs=part('garden stair treads','pale paving')
 for st in D['stairs']:
  g=st['group'];base=D['buildingBases'][g];a=Vector(pt(g,*st['a']));b=Vector(pt(g,*st['b']));along=(b-a).normalized();side=Vector((-along.y,along.x))*st['width']/2;h0=base+st['h0'];h1=base+st['h1'];n=math.ceil((h1-h0)/.16)
  for j in range(n):
   p=a+(b-a)*j/n;q=a+(b-a)*(j+1)/n;volume(stairs,[tuple(p-side),tuple(q-side),tuple(q+side),tuple(p+side)],h0+(h1-h0)*j/n-.12,h0+(h1-h0)*(j+1)/n)
  for sign in [-1,1]:
   pa=a+side*sign;pb=b+side*sign;rails.beam((*pa,h0+1.05),(*pb,h1+1.05),.045,.045)
   for j in range(0,n+1,[3,4,6][lod]):
    p=pa+(pb-pa)*j/n;h=h0+(h1-h0)*j/n;rails.beam((*p,h),(*p,h+1.05),.035,.035)
  if lod==0:
   ramp=[(*tuple(a-side),h0),(*tuple(b-side),h1),(*tuple(b+side),h1),(*tuple(a+side),h0)];meshcol('bupt stair ramp '+st['name'],[ramp])
   meshcol('bupt stair guards '+st['name'],[[(*tuple(a+side*sg),h0),(*tuple(b+side*sg),h1),(*tuple(b+side*sg),h1+1.05),(*tuple(a+side*sg),h0+1.05)] for sg in [-1,1]])
   manifest['stairRoutes'].append({'name':st['name'],'points':[[*(a-along*.5),h0],[*a,h0],[*((a+b)/2),(h0+h1)/2],[*b,h1],[*(b+along*.85),h1]]})
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
     if lod==0:collider('bupt lamp '+str(x)+','+str(z),[[x-.10,z-.10],[x+.10,z-.10],[x+.10,z+.10],[x-.10,z+.10]],y,y+h)
 objects=[o for p in buckets.values() if (o:=p.finish(root))]
 for obj in objects:obj['placeId']='bupt'
 bpy.ops.object.select_all(action='DESELECT')
 for o in coll.objects:o.hide_set(False);o.select_set(True)
 bpy.context.view_layer.objects.active=root;file=OUT/f'bupt-lod{lod}.glb'
 bpy.ops.export_scene.gltf(filepath=str(file),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_cameras=False,export_lights=False,export_yup=True)
 manifest['lods'].append({'file':file.name,'distance':[0,240,600][lod],'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects),'meshObjects':len(objects),'bytes':file.stat().st_size})
 coll.hide_render=lod!=0
 for o in coll.objects:o.hide_set(lod!=0)
preview=bpy.data.collections.new('Preview only');scene.collection.children.link(preview)
mat('BUPT / studio ground',(.40,.45,.39),.95,0,'terrain');floor=Part('Studio floor','BUPT / studio ground',preview)
floor.face([(-300,-300,D['review']['groundHeight']),(300,-300,D['review']['groundHeight']),(300,300,D['review']['groundHeight']),(-300,300,D['review']['groundHeight'])])
pr=bpy.data.objects.new('Preview only root',None);preview.objects.link(pr);floor.finish(pr)
world=bpy.data.worlds.new('BUPT daylight');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.38,.46,.53,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65
light=bpy.data.lights.new('Sun','SUN');light.energy=3;light.angle=.12;sun=bpy.data.objects.new('Sun',light);scene.collection.objects.link(sun);sun.rotation_euler=(.6,-.4,-.8)
camdata=bpy.data.cameras.new('BUPT review camera');cam=bpy.data.objects.new('BUPT review camera',camdata);scene.collection.objects.link(cam);scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.render.resolution_x=1500;scene.render.resolution_y=1050;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
def camera(name):
    view=D['views'][name];p=view['position'];t=view['target'];cam.location=xyz((p[0],p[2],p[1]));target=Vector(xyz((t[0],t[2],t[1])));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();camdata.lens=36/(2*math.tan(math.radians(view['fov'])/2))*1050/1500
camera('overall');scene['sources']=json.dumps(D['sources']);scene['evidence']=json.dumps(D['evidence'])
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'bupt.blend'),compress=True)
(OUT/'bupt.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print('BUPT_COMPLETE',json.dumps(manifest['lods']))
if '--render' in sys.argv:
    for name in ['overall','college1','college2','landscape']:
        camera(name);scene.render.filepath=str(HERE/(name+'.png'));bpy.ops.render.render(write_still=True)
