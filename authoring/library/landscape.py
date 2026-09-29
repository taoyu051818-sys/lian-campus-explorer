"""Original landscape meshes based on exterior panoramas; dimensions remain estimates."""
import math,random
from mathutils import Vector

def area(ps):return sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(ps,ps[1:]+ps[:1]))/2

def inside(p,ps):
    yes=False
    for a,b in zip(ps,ps[1:]+ps[:1]):
        if (a[1]>p[1])!=(b[1]>p[1]) and p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]:yes=not yes
    return yes

def circle(p,r,n=32,ry=None):return [(p[0]+r*math.cos(i*math.tau/n),p[1]+(ry or r)*math.sin(i*math.tau/n)) for i in range(n)]

def tube(part,a,b,r0,r1,n=8):
    a,b=Vector(a),Vector(b);d=(b-a).normalized();ref=Vector((0,0,1)) if abs(d.z)<.92 else Vector((1,0,0));u=d.cross(ref).normalized();v=d.cross(u).normalized()
    ra=[a+r0*(u*math.cos(i*math.tau/n)+v*math.sin(i*math.tau/n)) for i in range(n)];rb=[b+r1*(u*math.cos(i*math.tau/n)+v*math.sin(i*math.tau/n)) for i in range(n)]
    for i in range(n):j=(i+1)%n;part.face([ra[i],ra[j],rb[j],rb[i]])
    part.face(list(reversed(ra)));part.face(rb)

def ellipsoid(part,c,size,n=10,rings=5):
    for j in range(rings):
        a=-math.pi/2+math.pi*j/rings;b=-math.pi/2+math.pi*(j+1)/rings
        def p(t,angle):return(c[0]+size[0]*math.cos(t)*math.cos(angle),c[1]+size[1]*math.cos(t)*math.sin(angle),c[2]+size[2]*math.sin(t))
        for i in range(n):
            t=i*math.tau/n;q=(i+1)*math.tau/n
            if j==0:part.face([p(a,t),p(b,q),p(b,t)])
            elif j==rings-1:part.face([p(a,t),p(a,q),p(b,t)])
            else:part.face([p(a,t),p(a,q),p(b,q),p(b,t)])

def tree(pmat,lod,t,manifest=None):
    x,z=t['point'];y=t['y'];h=t['height'];radius=t['crownRadius'];name='Landscape '+t.get('zone','ground')
    bark=pmat(name+' tree branches','landscape bark');dark=pmat(name+' leaf canopy','leaf shadow');light=pmat(name+' leaf canopy','leaf light');start=[len(dark.v),len(light.v)]
    if t['type']=='palm-single':
        top=Vector((x+.18,z,y+h));tube(bark,(x,z,y),top,.18,.09,[10,8,6][lod])
        for j in range([12,8,5][lod]):
            angle=j*math.tau/[12,8,5][lod];direction=Vector((math.cos(angle),math.sin(angle),0));side=Vector((-direction.y,direction.x,0))
            def stem(f):return top+direction*(radius-.52)*f+Vector((0,0,math.sin(math.pi*f)*.85-1.25*f))
            for q in range(4):bark.beam(stem(q/4),stem((q+1)/4),.02,.02,False)
            for q in range([14,8,4][lod]):
                f=(q+1)/([14,8,4][lod]+1);p=stem(f)
                for sign in [-1,1]:light.face([p-direction*.10,p+side*sign*.55*math.sin(math.pi*f)+direction*.3+Vector((0,0,-.18)),p+direction*.13])
    else:
        tube(bark,(x,z,y),(x+.1,z,y+h*.86),.16,.04,[10,7,5][lod])
        for level in range(3):
            for k in range([9,6,4][lod]):
                a=k*2.399+level*.75;reach=radius*(.58-level*.10);end=Vector((x+math.cos(a)*reach,z+math.sin(a)*reach,y+h*(.60+level*.13+.03*math.sin(k))))
                tube(bark,(x,z,y+h*(.45+level*.14)),end,.035,.012,5)
                for j in range([10,5,2][lod]):
                    angle=j*2.399+k;rr=radius*.18*math.sqrt((j+1)/[10,5,2][lod]);c=end+Vector((math.cos(angle)*rr,math.sin(angle)*rr,.3*math.sin(j)))
                    part=light if (j+k)%4==0 else dark
                    for leaf in range([9,5,4][lod]):
                        theta=leaf*math.tau/[9,5,4][lod]+angle;u=Vector((math.cos(theta),math.sin(theta),.45*math.sin(theta)));v=Vector((-u.y,u.x,.25));part.face([c,c+u*.33-v*min(.17,radius*.07),c+u*min(.56,radius*.17),c+u*.33+v*min(.17,radius*.07)])
    vertices=dark.v[start[0]:]+light.v[start[1]:]
    measured=max(math.hypot(p[0]-x,-p[1]-z) for p in vertices)
    assert measured<radius+.015, (t['id'],measured,radius)
    if manifest is not None:manifest['canopyBounds'].append({'tree':t['id'],'lod':lod,'measuredRadius':measured,'clearanceRadius':radius})

def ground(pmat,lod,D,manifest,cap,strip,inset):
    white=pmat('Landscape curved edging','white concrete');stone=pmat('Landscape forecourt paving','warm limestone');grass=pmat('Landscape connected lawns','landscape lawn');dark=pmat('Landscape dark stone basin','basin stone')
    mesh=D['pavingMesh'];vs=mesh['position'];indices=mesh['index']
    for i in range(0,len(indices),3):
        face=[(vs[j*3],vs[j*3+2],vs[j*3+1]) for j in indices[i:i+3]]
        stone.face(face if area([p[:2] for p in face])>0 else list(reversed(face)))
    for bed in D['beds']:
        fp=bed['footprint'];ys=bed['heights'];c=tuple(sum(p[k] for p in fp)/len(fp) for k in [0,1])+(sum(ys)/len(ys),)
        for i in range(len(fp)):
            j=(i+1)%len(fp);grass.face([c,(*fp[i],ys[i]),(*fp[j],ys[j])]);white.beam((*fp[i],ys[i]+.015),(*fp[j],ys[j]+.015),.08,.07)
    for sh in D['shrubs']:
        part=pmat('Landscape loose shrub drifts','burgundy shrubs' if sh['tone']=='burgundy' else 'leaf shadow');ellipsoid(part,(*sh['point'],sh['y']),(sh['radius'],sh['radius']*.9,.4),[10,8,6][lod],[5,4,3][lod])
    for t in D['plants']:
        tree(pmat,lod,t,manifest)
        if lod==0:manifest['collisionVolumes'].append({'name':t['id']+' trunk','footprint':circle(t['point'],.23,8),'base':t['y'],'height':2.7,'foundationDepth':0})
        if lod<2 and t['type']!='palm-single':
            for k in range(3):
                a=k*math.tau/3;x,z=t['point'];y=t['y'];pmat('Landscape tree support stakes','landscape bark').beam((x+.8*math.cos(a),z+.8*math.sin(a),y),(x+.12*math.cos(a),z+.12*math.sin(a),y+1.9),.055,.055)
    pond=D['pond'];fp=pond['footprint'];h=pond['rimHeight'];inner=inset(fp,.48)
    strip(dark,fp,inner,pond['waterHeight']-.22,h);strip(white,fp,inset(fp,.12),h,h+.055)
    cap(pmat('Landscape reflecting pool','pool water'),inner,pond['waterHeight'])
    if lod<2:
        # Alternating small slate joints follow the elliptical retaining rim.
        joints=pmat('Landscape basin slate joints','frame shadow')
        for i in range(0,len(fp),2):
            a,b=fp[i],fp[(i+1)%len(fp)];joints.beam((*a,h-.14),(*b,h-.14),.01,.012)
    if lod==0:manifest['collisionVolumes'].append({'name':'library landscape pool barrier','footprint':fp,'base':min(p[2] for r in D['walkRoutes'] for p in r['points'])-.5,'height':h+.5-min(p[2] for r in D['walkRoutes'] for p in r['points']),'foundationDepth':0})
    for ci,can in enumerate(D['canopy']):
        ps=can['points'];ys=can['heights'];w=can['width'];height=can['height'];shell=pmat('Landscape curved white shade canopy','warm ceramic');post=pmat('Landscape canopy columns','pearl aluminium')
        for i in range(len(ps)-1):
            a,b=Vector(ps[i]),Vector(ps[i+1]);dv=(b-a).normalized();n=Vector((-dv.y,dv.x))*w/2;quad=[tuple(a-n),tuple(b-n),tuple(b+n),tuple(a+n)];roofh=max(ys[i],ys[i+1])+height
            strip(shell,quad,inset(quad,.08),roofh,roofh+.14);cap(shell,quad,roofh+.14)
            if lod==0:manifest['collisionVolumes'].append({'name':f'library landscape canopy roof {ci} {i}','footprint':quad,'base':roofh,'height':.14,'foundationDepth':0})
            if i%4==0:
                for sign in [-1,1]:
                    p=a+n*sign*.8;post.beam((*p,ys[i]),(*p,roofh),.075,.075)
                    if lod==0:manifest['collisionVolumes'].append({'name':f'library landscape canopy post {ci} {i} {sign}','footprint':circle(p,.075,6),'base':ys[i],'height':height,'foundationDepth':0})
    for li,l in enumerate(D['lights']):
        x,z=l['point'];y=l['y'];h=l['height'];pole=pmat('Landscape slim path lights','pearl aluminium');tube(pole,(x,z,y),(x,z,y+h),.045,.045,8);pole.box((x,z,y+h),( .16,.24,.14))
        if lod==0:manifest['collisionVolumes'].append({'name':f'library landscape lamp {li}','footprint':circle(l['point'],.09,8),'base':y,'height':h,'foundationDepth':0})
    for pi,p in enumerate(D['pots']):
        x,z=p['point'];y=p['y'];pot=pmat('Landscape entrance planted urns','basin stone');tube(pot,(x,z,y),(x,z,y+1.2),.42,.7,20)
        for k in range(12):
            a=k*2.399;ellipsoid(pmat('Landscape entrance pot foliage','leaf light'),(x+.5*math.cos(a),z+.5*math.sin(a),y+1.2+.25*math.sin(k)),(.42,.4,.36),8,4)
        if lod==0:manifest['collisionVolumes'].append({'name':f'library landscape entrance pot {pi}','footprint':circle(p['point'],.72,12),'base':y,'height':1.4,'foundationDepth':0})

def roof(pmat,lod,petal,roofpoly,terrace,roofY,upper,manifest,cap,strip,inset):
    name=petal['name'];isGarden=petal['roofFinish']=='garden';deck=upper if isGarden and upper else roofY
    fp=terrace if isGarden and upper else inset(roofpoly,1.4);center=[sum(p[k] for p in fp)/len(fp) for k in [0,1]]
    # Plank seams are real narrow lines cropped to the lower terrace outline.
    seams=pmat('Landscape roof timber board joints','frame shadow')
    if lod<2:
        minx,maxx=min(p[0] for p in roofpoly),max(p[0] for p in roofpoly);miny,maxy=min(p[1] for p in roofpoly),max(p[1] for p in roofpoly)
        for iy in range(math.ceil((maxy-miny)/.5)):
            y=miny+iy*.5;run=[]
            for ix in range(math.ceil((maxx-minx)/.5)):
                p=(minx+ix*.5,y);ok=inside(p,inset(roofpoly,1)) and (not upper or not inside(p,terrace))
                if ok:run.append(p)
                if (not ok or ix==math.ceil((maxx-minx)/.5)-1) and len(run)>1:seams.beam((*run[0],roofY+.065),(*run[-1],roofY+.065),.012,.008);run=[]
                elif not ok:run=[]
    white=pmat('Landscape roof white planters','white concrete');green=pmat('Landscape roof planted islands','landscape lawn')
    if isGarden:
        centers=[]
        for i,(ox,oy,r) in enumerate([(-6,-2,1.8),(-1,-6,1.25),(5,-3,1.45),(4,4,1.8),(-3,5,1.15)]):
            p=(center[0]+ox,center[1]+oy);ring=circle(p,r,24 if lod<2 else 12)
            if not all(inside(q,fp) for q in ring):continue
            strip(white,ring,inset(ring,.18),deck+.06,deck+.43);cap(green,inset(ring,.2),deck+.37);centers.append(p)
            t={'id':f'{name} roof tree {i}','point':p,'y':deck+.38,'height':2.5+i%2*.7,'crownRadius':1.3,'type':'layered-broadleaf','zone':'roof'}
            # Scale roof trees through a smaller leaf primitive footprint.
            x,z=p;t['crownRadius']=2.0;tree(pmat,lod,t)
            if lod==0:manifest['roofPlanting'].append({'wing':name,'point':[x,z,deck+.37],'radius':r})
        # Irregular grass / shrub islands follow edges, leaving the central dark deck open.
        for start,count in [(0,len(fp)//5),(len(fp)//2,len(fp)//4)]:
            outside=inset(fp,1.1);inner=inset(fp,4.0);idx=[(start+j)%len(fp) for j in range(count+1)];patch=[outside[i] for i in idx]+[inner[i] for i in reversed(idx)]
            cap(green,patch,deck+.09)
            for j in idx[::max(1,len(idx)//8)]:
                q=inner[j];ellipsoid(pmat('Landscape roof loose shrubs','leaf shadow'),(*q,deck+.38),(.65,.65,.35),[10,8,6][lod],[5,4,3][lod])
        # White curved bench along one planted edge.
        arc=[(center[0]+6*math.cos(a),center[1]+5*math.sin(a)) for a in [j*.08+.25 for j in range(12)]]
        for a,b in zip(arc,arc[1:]):
            if inside(a,fp) and inside(b,fp):white.beam((*a,deck+.5),(*b,deck+.5),.6,.18)
    else:
        # The photo shows long white rectangular beds on the lower terrace beside each raised white roof.
        outer=inset(roofpoly,1.8);inner=inset(roofpoly,3.2)
        for i in range(0,len(outer),max(1,len(outer)//18)):
            j=(i+max(2,len(outer)//25))%len(outer);quad=[outer[i],outer[j],inner[j],inner[i]]
            if upper and any(inside(q,terrace) for q in quad):continue
            strip(white,quad,inset(quad,.12),roofY+.06,roofY+.48);cap(green,inset(quad,.14),roofY+.43)
            mid=[sum(p[k] for p in quad)/4 for k in [0,1]];ellipsoid(pmat('Landscape roof linear bed shrubs','leaf light'),(*mid,roofY+.62),(.48,.6,.28),[10,8,6][lod],[5,4,3][lod])
            if lod==0:manifest['roofPlanting'].append({'wing':name,'point':[*mid,roofY+.43],'footprint':quad})
