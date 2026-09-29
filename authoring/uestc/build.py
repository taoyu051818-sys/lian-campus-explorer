"""UESTC two-building group: metre-scale traced wings, photo-informed facade and planting."""
import bpy,json,math,random,sys
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'common'))
from geometry import Part,mat,MATS,xyz,wall,cap,area,inset,strip
ROOT=Path(__file__).resolve().parents[2];HERE=Path(__file__).parent;OUT=ROOT/'public/models/uestc';OUT.mkdir(parents=True,exist_ok=True)
D=json.loads((HERE/'design.json').read_text());H=D['storeyHeight'];BASE=min(D['buildingBases'].values())
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
 if c.name!='Collection':bpy.data.collections.remove(c)
scene=bpy.context.scene;scene.unit_settings.system='METRIC'
materials=[('ivory metal',(.68,.70,.67),.44,.10,'paint'),('champagne fins',(.62,.43,.16),.37,.52,'metal'),('gold spandrel',(.61,.46,.24),.48,.32,'metal'),('blue glazing',(.044,.097,.128),.21,.08,'glass'),('glazing light',(.085,.146,.17),.24,.06,'glass'),('window shadow',(.075,.075,.060),.72,0,'paint'),('roof',(.73,.73,.67),.89,0,'roofMetal'),('terracotta',(.49,.24,.13),.91,0,'paving'),('rail',(.30,.34,.33),.35,.7,'metal'),('concrete columns',(.61,.62,.57),.82,0,'concrete'),('pale paving',(.64,.65,.61),.94,0,'stone'),('dark paving',(.13,.15,.15),.98,0,'paving'),('lawn',(.17,.27,.065),.99,0,'foliage'),('bark',(.30,.24,.15),.97,0,'bark'),('leaf shadow',(.075,.19,.035),.87,0,'foliage'),('leaf light',(.23,.35,.065),.88,0,'foliage'),('hedge',(.105,.23,.046),.95,0,'foliage'),('timber',(.28,.16,.07),.87,0,'wood'),('lamp',(.04,.048,.045),.48,.45,'metal'),('light strip',(.95,.88,.64),.4,0,'paint')]
for args in materials:mat('UESTC / '+args[0],*args[1:])
for k in ['leaf shadow','leaf light']:MATS['UESTC / '+k].use_backface_culling=False
manifest={k:D[k] for k in ['asset','name','anchor','base','yaw','sources','evidence','views','review','landscape']}
manifest.update(lods=[],collisionVolumes=[],collisionMeshes=[],canopyBounds=[],stairRoutes=[],courtyards=D['courtyards'],height=H*6+3)
def volume(p,fp,z0,z1):
 if area(fp)<0:fp=list(reversed(fp))
 wall(p,fp,z0,z1);cap(p,fp,z1);cap(p,list(reversed(fp)),z0)
def collider(name,fp,z0,z1):manifest['collisionVolumes'].append({'name':name,'footprint':fp,'base':z0,'height':z1-z0})
def meshcol(name,faces):
 vs=[];inds=[]
 for face in faces:
  n=len(vs)//3;vs.extend(v for p in face for v in [p[0],p[2],p[1]])
  for i in range(1,len(face)-1):inds.extend([n,n+i+1,n+i])
 manifest['collisionMeshes'].append({'name':name,'position':vs,'index':inds})
def rounded(poly,cut,n):
 if area(poly)<0:poly=list(reversed(poly))
 result=[]
 for i,p in enumerate(poly):
  a=poly[i-1];b=poly[(i+1)%len(poly)];u=Vector(a)-Vector(p);v=Vector(b)-Vector(p);c=min(cut,u.length*.28,v.length*.28);s=Vector(p)+u.normalized()*c;e=Vector(p)+v.normalized()*c
  for j in range(n+1):
   t=j/n;result.append(tuple(s*(1-t)**2+Vector(p)*2*t*(1-t)+e*t*t))
 return result
def ribbonfp(a,b,width):
 d=Vector(b)-Vector(a);normal=Vector((-d.y,d.x)).normalized()*width/2
 return [tuple(Vector(a)-normal),tuple(Vector(b)-normal),tuple(Vector(b)+normal),tuple(Vector(a)+normal)]
def tube(part,a,b,r0,r1,n=8):
 a,b=Vector(a),Vector(b);d=(b-a).normalized();ref=Vector((0,0,1)) if abs(d.z)<.92 else Vector((1,0,0));u=d.cross(ref).normalized();v=d.cross(u).normalized()
 ra=[a+r0*(u*math.cos(i*math.tau/n)+v*math.sin(i*math.tau/n)) for i in range(n)];rb=[b+r1*(u*math.cos(i*math.tau/n)+v*math.sin(i*math.tau/n)) for i in range(n)]
 for i in range(n):j=(i+1)%n;part.face([ra[i],ra[j],rb[j],rb[i]])
 part.face(list(reversed(ra)));part.face(rb)
def ellipsoid(part,c,size,n=10,rings=6):
 for j in range(rings):
  a=-math.pi/2+math.pi*j/rings;b=-math.pi/2+math.pi*(j+1)/rings
  def pt(t,angle):return(c[0]+size[0]*math.cos(t)*math.cos(angle),c[1]+size[1]*math.cos(t)*math.sin(angle),c[2]+size[2]*math.sin(t))
  for i in range(n):
   t=i*math.tau/n;q=(i+1)*math.tau/n
   if j==0:part.face([pt(a,t),pt(b,q),pt(b,t)])
   elif j==rings-1:part.face([pt(a,t),pt(a,q),pt(b,t)])
   else:part.face([pt(a,t),pt(a,q),pt(b,q),pt(b,t)])
for lod in range(3):
 random.seed(203);coll=bpy.data.collections.new(f'UESTC LOD{lod}');scene.collection.children.link(coll)
 root=bpy.data.objects.new(f'UESTC {lod}',None);coll.objects.link(root);root['placeId']='uestc';buckets={}
 def part(name,material):
  key=(name,material)
  if key not in buckets:buckets[key]=Part(name+' | '+material,'UESTC / '+material,coll)
  return buckets[key]
 bands=part('rounded white balcony ribbons','ivory metal');slabs=part('balcony floor decks','roof');gold=part('gold spandrels','gold spandrel');frames=part('champagne window grids','champagne fins');glass=part('recessed blue glazing','blue glazing');glass2=part('recessed blue glazing','glazing light');fins=part('gold vertical sun fins','champagne fins');columns=part('exposed ground columns','concrete columns');rail=part('roof guardrails','rail');seam=part('white panel joints','window shadow')
 outlines={}
 for b in D['blocks']:
  ident=b['id'];fp=rounded(b['outline'],b['cornerCut'],[8,5,3][lod]);outlines[ident]=fp;base=D['buildingBases'][ident[0]];floors=b['floors'];iscore=b['style']=='gold-core';isaud=b['style']=='auditorium';facade=inset(fp,.55 if iscore else 1.5);groundfp=inset(fp,3.2 if not iscore else .7)
  if lod==0:
   collider('uestc '+ident+' ground rooms',groundfp,base-1.2,base+H)
   collider('uestc '+ident+' upper rooms',facade,base+H,base+H*(floors-1))
   collider('uestc '+ident+' top rooms',inset(fp,2.65) if not iscore and not isaud else facade,base+H*(floors-1),base+H*floors-.12)
  # A recessed ground facade leaves a genuine open perimeter colonnade.
  volume(gold,groundfp,base-.15,base+.3);wall(glass,groundfp,base+.3,base+H-.3)
  for a,c in zip(groundfp,groundfp[1:]+groundfp[:1]):
   count=max(1,math.ceil(math.dist(a,c)/[1.7,2.2,3.4][lod]))
   for j in range(count):
    t=j/count;p=tuple(a[k]+(c[k]-a[k])*t for k in [0,1]);frames.beam((*p,base+.3),(*p,base+H-.25),.065,.095)
  structural=fp
  for floor in range(1,floors+1):
   fp=inset(structural,1.15 if floor==floors and not iscore and not isaud else (-.65 if floor==1 and not iscore else 0))
   facade=inset(structural,(2.65 if floor==floors-1 and not iscore and not isaud else 1.5) if not iscore else .55)
   h=base+floor*H
   # Footprint stays constant at the structural edge; set-back glass exposes the slab depth.
   if floor==floors:volume(part('flat roof planes','roof'),fp,h-.22,h)
   else:volume(slabs,fp,h-.22,h)
   if lod==0:collider(f'uestc {ident} floor {floor}',fp,h-.22,h)
   if not iscore:
    openings=[]
    for st in D['stairs']:
     if st['block']!=ident:continue
     sa=Vector(b['outline'][st['edge']]);sb=Vector(b['outline'][(st['edge']+1)%len(b['outline'])])
     for lev in st['levels']:
      if floor==lev:openings.append(tuple(sa+(sb-sa)*st['t0']))
      if floor==lev+1:openings.append(tuple(sa+(sb-sa)*st['t1']))
    for link in D['connectors']:
     if floor not in link['levels']:continue
     for p in [link['a'],link['b']]:
      if any(math.dist(p,v)<5 for v in fp):openings.append(p)
    if ident in ['A_south','B_north'] and floor==1:openings.append(D['bridge']['b' if ident=='A_south' else 'a'])
    guardfaces=[];inner=inset(fp,.2)
    for i,a in enumerate(fp):
     j=(i+1)%len(fp);c=fp[j];length=math.dist(a,c);n=max(1,math.ceil(length/.65)) if openings else 1
     for k in range(n):
      t0=k/n;t1=(k+1)/n;mid=[a[q]*(1-(t0+t1)/2)+c[q]*(t0+t1)/2 for q in [0,1]]
      if any(math.dist(mid,p)<2.0 for p in openings):continue
      pa=[a[q]*(1-t0)+c[q]*t0 for q in [0,1]];pb=[a[q]*(1-t1)+c[q]*t1 for q in [0,1]];pc=[inner[i][q]*(1-t1)+inner[j][q]*t1 for q in [0,1]];pd=[inner[i][q]*(1-t0)+inner[j][q]*t0 for q in [0,1]]
      volume(bands,[pa,pb,pc,pd],h-.22,h+1.23)
      gold.face([(*pd,h+.05),(*pc,h+.05),(*pc,h+1.19),(*pd,h+1.19)])
      guardfaces.append([(*pa,h),(*pb,h),(*pb,h+1.24),(*pa,h+1.24)])
    if lod==0:meshcol(f'uestc {ident} balcony guard {floor}',guardfaces)
   else:strip(gold,fp,inset(fp,.3),h-.25,h+.12)
   if floor==floors:continue
   # Glazing and short gold spandrels between each white balcony band.
   wall(gold if isaud and floor==floors-1 else glass2 if floor%3==0 else glass,facade,h+.2,h+H-.24)
   wall(gold,facade,h+.05,h+.70 if not iscore else h+.36)
   spacing=[.68,1.08,1.95][lod] if iscore or isaud else [1.22,1.75,2.65][lod]
   # Equal arc-length sampling avoids dense posts around every rounded corner.
   lengths=[0]
   for a,c in zip(facade,facade[1:]+facade[:1]):lengths.append(lengths[-1]+math.dist(a,c))
   count=math.ceil(lengths[-1]/spacing);index=0
   for j in range(count):
    dist=lengths[-1]*j/count
    while lengths[index+1]<dist:index+=1
    a,c=facade[index],facade[(index+1)%len(facade)];t=(dist-lengths[index])/(lengths[index+1]-lengths[index]);p=Vector(a)*(1-t)+Vector(c)*t;direction=(Vector(c)-Vector(a)).normalized();normal=Vector((direction.y,-direction.x));q=p+normal*(.17 if iscore or isaud else .045)
    target=fins if iscore or isaud or j%5==0 else frames
    target.beam((*q,h+.65),(*q,h+H-.25),.11 if target==fins else .065,.26 if target==fins else .09)
    if lod<2:
     # Alternating short rails recreate the staggered rectangular window grid.
     k=h+1.4+(j%3)*.45;end=q+direction*(lengths[-1]/count*.83);frames.beam((*q,k),(*end,k),.052,.075)
   for dh in [1.05,2.7]:
    for a,c in zip(facade,facade[1:]+facade[:1]):frames.beam((*a,h+dh),(*c,h+dh),.045,.075)
  fp=structural
  # Ground columns at regular structural bays. Their narrow footprints leave the arcade walkable.
  colfp=inset(fp,.9);lengths=[0]
  for a,c in zip(colfp,colfp[1:]+colfp[:1]):lengths.append(lengths[-1]+math.dist(a,c))
  count=max(4,round(lengths[-1]/6.6));index=0
  for j in range(count):
   dist=lengths[-1]*j/count
   while lengths[index+1]<dist:index+=1
   a,c=colfp[index],colfp[(index+1)%len(colfp)];t=(dist-lengths[index])/(lengths[index+1]-lengths[index]);q=tuple(a[k]+(c[k]-a[k])*t for k in [0,1]);tube(columns,(*q,base-.05),(*q,base+H-.2),.25,.23,[12,9,6][lod])
   if lod==0:collider(f'uestc {ident} column {j}',[[q[0]-.27,q[1]-.27],[q[0]+.27,q[1]-.27],[q[0]+.27,q[1]+.27],[q[0]-.27,q[1]+.27]],base-.1,base+H)
  roofh=base+floors*H
  railfp=inset(fp,1.5 if not iscore and not isaud else .45)
  for a,c in zip(railfp,railfp[1:]+railfp[:1]):
   rail.beam((*a,roofh+1.15),(*c,roofh+1.15),.04,.04)
   if lod<2 and math.dist(a,c)>1:
    for j in range(max(1,math.ceil(math.dist(a,c)/1.6))):
     t=j/max(1,math.ceil(math.dist(a,c)/1.6));p=[a[k]+(c[k]-a[k])*t for k in [0,1]];rail.beam((*p,roofh+.15),(*p,roofh+1.15),.028,.028)
  if lod<2 and not iscore:
   for a,c in zip(fp,fp[1:]+fp[:1]):
    length=math.dist(a,c)
    if length<1:continue
    normal=Vector((c[1]-a[1],a[0]-c[0])).normalized()*.006
    for j in range(math.ceil(length/1.35)):
     t=j/math.ceil(length/1.35);p=Vector(a)*(1-t)+Vector(c)*t+normal
     for level in range(1,floors+1):seam.beam((*p,base+level*H-.18),(*p,base+level*H+.93),.008,.01,False)
  if isaud:
   terrace=part('terracotta roof terrace','terracotta');cap(terrace,inset(fp,.4),roofh+.025);pergola=part('open gold rooftop pergola','champagne fins');perg=inset(fp,2.2)
   for a,c in zip(perg,perg[1:]+perg[:1]):
    pergola.beam((*a,roofh+2.65),(*c,roofh+2.65),.26,.3)
    if math.dist(a,c)>1:
     for j in range(max(1,math.ceil(math.dist(a,c)/4))):
      t=j/max(1,math.ceil(math.dist(a,c)/4));p=tuple(a[k]+(c[k]-a[k])*t for k in [0,1]);pergola.beam((*p,roofh+.03),(*p,roofh+2.65),.2,.2)
  else:
   # Low roof stair/equipment enclosures aligned with the plan wing, not arbitrary towers.
   a=Vector(b['outline'][0]);c=Vector(b['outline'][1]);direction=(c-a).normalized();normal=Vector((-direction.y,direction.x));centre=a+direction*min((c-a).length*.45,10)+normal*5
   equip=[tuple(centre+direction*u+normal*v) for u,v in [(-3,-1.7),(3,-1.7),(3,1.7),(-3,1.7)]]
   volume(part('roof service enclosures','ivory metal'),equip,roofh,roofh+2.1)
 # Narrow upper links connect the wings while retaining the open courtyards and ground passages.
 links=part('elevated wing connectors','ivory metal');linkdeck=part('connector floors','roof')
 for link in D['connectors']:
  a,b=link['a'],link['b'];fp=ribbonfp(a,b,link['width']);base=D['buildingBases'][link['name'][0]]
  for level in link['levels']:
   h=base+level*H;volume(linkdeck,fp,h-.22,h)
   for i,j in [(0,1),(2,3)]:
    links.beam((*fp[i],h+.49),(*fp[j],h+.49),.18,1.2)
   if lod==0:collider('uestc connector '+link['name']+f' {level}',fp,h-.22,h);meshcol('uestc connector guards '+link['name']+f' {level}',[[(*fp[i],h),(*fp[j],h),(*fp[j],h+1.08),(*fp[i],h+1.08)] for i,j in [(0,1),(2,3)]])
 # Cross-site link has an open underpass and continuous end-to-end deck.
 bridge=D['bridge'];a,b=bridge['a'],bridge['b'];fp=ribbonfp(a,b,bridge['width']);z0=D['buildingBases']['B']+H;z1=D['buildingBases']['A']+H
 bridgepart=part('cross site two storey bridge','ivory metal');deck=part('cross site bridge deck','roof')
 face=[(*fp[0],z0),(*fp[1],z1),(*fp[2],z1),(*fp[3],z0)];deck.face(face);deck.face([(p[0],p[1],p[2]-.2) for p in reversed(face)])
 for i,j in [(0,1),(3,2)]:
  pa,pb=face[i],face[j];bridgepart.face([(pa[0],pa[1],pa[2]-.2),(pb[0],pb[1],pb[2]-.2),(pb[0],pb[1],pb[2]+1.06),(pa[0],pa[1],pa[2]+1.06)])
  bridgepart.beam((pa[0],pa[1],pa[2]+H-.4),(pb[0],pb[1],pb[2]+H-.4),.2,1.0)
 for t in [.25,.75]:
  p=Vector(a)*(1-t)+Vector(b)*t;h=z0*(1-t)+z1*t;tube(part('bridge support columns','rail'),(*p,BASE-1),(*p,h-.18),.2,.2,8)
 if lod==0:
  meshcol('uestc cross site bridge floor',[face]);meshcol('uestc cross site bridge guards',[[face[i],face[j],(face[j][0],face[j][1],face[j][2]+1.08),(face[i][0],face[i][1],face[i][2]+1.08)] for i,j in [(0,1),(3,2)]])
 # Exterior flights sit outside the balcony slab and connect through short landings.
 stair=part('diagonal exterior stair treads','concrete columns');guards=part('ascending white stair ribbons','ivory metal');landings=part('exterior stair landings','roof')
 for spec in D['stairs']:
  block=next(b for b in D['blocks'] if b['id']==spec['block']);poly=block['outline'];i=spec['edge'];a,b=Vector(poly[i]),Vector(poly[(i+1)%len(poly)]);direction=(b-a).normalized();normal=Vector((direction.y,-direction.x));normal*=1 if area(poly)>0 else -1
  p=a+(b-a)*spec['t0']+normal*spec['offset'];q=a+(b-a)*spec['t1']+normal*spec['offset'];along=(q-p).normalized();side=Vector((-along.y,along.x))*spec['width']/2
  for level in spec['levels']:
   h0=D['buildingBases'][spec['block'][0]]+H*level;h1=h0+H;n=24
   for j in range(n):
    s=p+(q-p)*j/n;e=p+(q-p)*(j+1)/n;foot=[tuple(s-side),tuple(e-side),tuple(e+side),tuple(s+side)];h=h0+H*(j+1)/n;volume(stair,foot,h-.17,h)
   ramp=[(*tuple(p-side),h0),(*tuple(q-side),h1),(*tuple(q+side),h1),(*tuple(p+side),h0)]
   guardfaces=[]
   for sign in [-1,1]:
    s=p+side*sign;e=q+side*sign;f=[(*s,h0-.15),(*e,h1-.15),(*e,h1+1.06),(*s,h0+1.06)];guards.face(f);guards.face([(x+normal.x*.13,y+normal.y*.13,h) for x,y,h in reversed(f)]);guardfaces.append(f)
   for endpoint,pnt,h in [(p,p-along*1.05,h0),(q,q+along*1.05,h1)]:
    extension=ribbonfp(tuple(endpoint),tuple(pnt),spec['width']);volume(landings,extension,h-.2,h)
    if lod==0:collider(f'uestc {spec["name"]} turn {level} {h}',extension,h-.2,h)
    inner=pnt-normal*(spec['offset']+.65);fp=ribbonfp(tuple(inner),tuple(pnt),2.25);volume(landings,fp,h-.2,h)
    if lod==0:collider(f'uestc {spec["name"]} landing {level} {h}',fp,h-.2,h)
   if lod==0:
    meshcol(f'uestc stair ramp {spec["name"]} {level}',[ramp]);meshcol(f'uestc stair guards {spec["name"]} {level}',guardfaces)
    manifest['stairRoutes'].append({'name':spec['name']+f' {level}','points':[[p.x,p.y,h0],[(p.x+q.x)/2,(p.y+q.y)/2,(h0+h1)/2],[q.x,q.y,h1],[q.x+along.x*1.05,q.y+along.y*1.05,h1],[q.x+along.x*1.05-normal.x*(spec['offset']+.60),q.y+along.y*1.05-normal.y*(spec['offset']+.60),h1]]})
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
     if lod==0:collider('uestc lamp '+str(x)+','+str(z),[[x-.10,z-.10],[x+.10,z-.10],[x+.10,z+.10],[x-.10,z+.10]],y,y+h)
 objects=[o for p in buckets.values() if (o:=p.finish(root))]
 for obj in objects:obj['placeId']='uestc'
 bpy.ops.object.select_all(action='DESELECT')
 for o in coll.objects:o.hide_set(False);o.select_set(True)
 bpy.context.view_layer.objects.active=root;file=OUT/f'uestc-lod{lod}.glb'
 bpy.ops.export_scene.gltf(filepath=str(file),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_cameras=False,export_lights=False,export_yup=True)
 manifest['lods'].append({'file':file.name,'distance':[0,240,600][lod],'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects),'meshObjects':len(objects),'bytes':file.stat().st_size})
 coll.hide_render=lod!=0
 for o in coll.objects:o.hide_set(lod!=0)
preview=bpy.data.collections.new('Preview only');scene.collection.children.link(preview)
mat('UESTC / studio ground',(.40,.45,.39),.95,0,'terrain');floor=Part('Studio floor','UESTC / studio ground',preview)
floor.face([(-300,-300,D['review']['groundHeight']),(300,-300,D['review']['groundHeight']),(300,300,D['review']['groundHeight']),(-300,300,D['review']['groundHeight'])])
pr=bpy.data.objects.new('Preview only root',None);preview.objects.link(pr);floor.finish(pr)
world=bpy.data.worlds.new('UESTC daylight');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.38,.46,.53,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65
light=bpy.data.lights.new('Sun','SUN');light.energy=3;light.angle=.12;sun=bpy.data.objects.new('Sun',light);scene.collection.objects.link(sun);sun.rotation_euler=(.6,-.4,-.8)
camdata=bpy.data.cameras.new('UESTC review camera');cam=bpy.data.objects.new('UESTC review camera',camdata);scene.collection.objects.link(cam);scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.render.resolution_x=1500;scene.render.resolution_y=1050;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
def camera(name):
    view=D['views'][name];p=view['position'];t=view['target'];cam.location=xyz((p[0],p[2],p[1]));target=Vector(xyz((t[0],t[2],t[1])));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();camdata.lens=36/(2*math.tan(math.radians(view['fov'])/2))*1050/1500
camera('overall');scene['sources']=json.dumps(D['sources']);scene['evidence']=json.dumps(D['evidence'])
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'uestc.blend'),compress=True)
(OUT/'uestc.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print('UESTC_COMPLETE',json.dumps(manifest['lods']))
if '--render' in sys.argv:
    for name in ['overall','college1','college2','landscape']:
        camera(name);scene.render.filepath=str(HERE/(name+'.png'));bpy.ops.render.render(write_still=True)
