"""Original, deterministic design fixtures. Outputs only to the supplied directory."""
import sys, pathlib, html, base64
out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)

def node(key,kind,x,y,w,h,style='',text='',tag='div'):
    return f'<{tag} data-design-id="{key}" data-design-kind="{kind}" data-name="{key.replace("-"," ").title()}" style="position:absolute;box-sizing:border-box;left:{x}px;top:{y}px;width:{w}px;height:{h}px;{style}">{html.escape(text)}</{tag}>'
def text(key,x,y,w,h,value,size=24,color='#192b28',weight=400,font='Arial',extra=''):
    return node(key,'text',x,y,w,h,f'font-family:{font};font-size:{size}px;line-height:1.18;font-weight:{weight};color:{color};white-space:pre-wrap;{extra}',value)
def rect(key,x,y,w,h,color,extra=''):
    return node(key,'rect',x,y,w,h,f'background:{color};{extra}')
def frame(key,name,w,h,bg,content):
    return f'<section data-design-frame="{key}" data-name="{name}" style="position:relative;flex:none;box-sizing:border-box;width:{w}px;height:{h}px;overflow:hidden;background:{bg}">{content}</section>'
def write(name,frames):
    (out/f'{name}.design.html').write_text('<!doctype html>\n<html><head><meta charset="utf-8"><title>'+name.title()+'</title><style>[data-hidden="true"]{display:none}body{margin:0;display:flex;gap:40px;background:#e7e5e1}</style></head><body>'+frames+'</body></html>\n')
poster = text('brand',64,50,420,28,'FIELDNOTES / DESIGN WEEK',19,weight=700,extra='letter-spacing:2px')
poster += rect('rule',64,100,672,2,'#192b28')
poster += text('headline',58,142,700,250,'Objects for\neveryday living.',78,font='Georgia',extra='letter-spacing:-3px')
poster += node('sun','ellipse',398,420,280,280,'border-radius:50%;background:#c5603d')
poster += rect('plinth',96,760,600,70,'#dbd1bb')
poster += rect('vase-body',183,540,150,228,'#192b28','border-radius:20px 20px 70px 70px;transform:rotate(-8deg)')
poster += rect('vase-neck',212,485,68,100,'#192b28','border-radius:8px;transform:rotate(-8deg)')
poster += rect('stem-one',246,402,5,160,'#192b28','transform:rotate(17deg)')
poster += node('leaf-one','ellipse',250,400,90,34,'background:#687660;border-radius:50%;transform:rotate(-25deg)')
poster += node('leaf-two','ellipse',188,430,75,30,'background:#687660;border-radius:50%;transform:rotate(33deg)')
poster += rect('cup',446,663,132,98,'#f4efdf','border:3px solid #192b28;border-radius:8px 8px 30px 30px')
poster += node('handle','ellipse',561,682,53,53,'border:10px solid #192b28;border-radius:50%;background:transparent')
poster += text('date',64,885,360,70,'21—29 NOVEMBER\n10 AM—6 PM DAILY',24,weight=700)
poster += text('venue',470,887,265,78,'Riverside Works\n12 Mill Lane, London\nFree entry · fieldnotes.studio',19)
poster += text('footer',64,1030,680,25,'An exhibition of useful things, made with care.',19,font='Georgia')
write('poster',frame('poster','Fieldnotes · exhibition',800,1100,'#f4efdf',poster))
frames=[]
for i,(title,copy,bg,fg) in enumerate([('Less admin.\nMore making.','A quieter workspace for independent studios.','#173e36','#f1efdf'),('Everything\nin its place.','Projects, people and the next good idea.','#e9eddf','#173e36'),('Make room\nfor good work.','Meet Gather. Your studio, thoughtfully organised.','#dbbfa7','#173e36')]):
    p=f's{i}-';c=text(p+'brand',72,64,600,40,'gather / FOR INDEPENDENT STUDIOS',23,fg,700)
    c+=text(p+'headline',70,184,920,240,title,92,fg,400,'Georgia',extra='letter-spacing:-3px')
    c+=text(p+'copy',76,450,820,100,copy,30,fg)
    for j in range(3):
        x=76+j*308;c+=rect(p+f'card-{j}',x,623,280,230,'#f8f5e9','border-radius:12px')
        c+=text(p+f'card-label-{j}',x+24,650,236,60,['01 / PLAN','02 / MAKE','03 / SHARE'][j],18,'#173e36',700)
        c+=text(p+f'card-copy-{j}',x+24,712,230,100,['A clear week\nahead.','Space to\nfocus.','Everyone\nin the loop.'][j],29,'#173e36',400,'Georgia')
    c+=text(p+'footer',76,957,800,45,'Join the early access list  →  gather.studio',26,fg)
    frames.append(frame(p+'frame',f'Gather · {i+1} / 3',1080,1080,bg,c))
write('social',''.join(frames))
app=rect('sidebar',0,0,224,900,'#edf0e9')+text('app-brand',28,30,175,44,'gather',32,weight=700)
for i,t in enumerate(['Overview','Projects','Schedule','People','Files']):
    if i==0: app+=rect('nav-active',16,123,192,42,'#d9e2d3','border-radius:8px')
    app+=text(f'nav-{i}',32,134+i*55,166,30,t,17,weight=700 if i==0 else 400)
app+=text('studio-name',28,791,175,80,'NORTH STUDIO\n6 people · Pro plan',14,extra='line-height:1.7')
app+=text('breadcrumb',264,31,900,32,'Workspace  /  Overview',15,'#65756e')+text('user',1250,31,160,32,'Alex Morgan  ●',15)
app+=rect('top-rule',224,86,1216,1,'#e3e6e0')
app+=text('app-headline',264,120,900,60,'Good morning, Alex.',36,weight=600)+text('app-subtitle',264,180,900,40,'Here’s what’s moving at North Studio this week.',18,'#65756e')
for i,(value,label,note) in enumerate([('12','Active projects','3 ready for review'),('86%','On schedule','↑ 8% from last month'),('28h','Focus time','Across the studio this week')]):
    x=264+i*380;app+=rect(f'metric-card-{i}',x,245,356,155,'#f0f3ec','border-radius:12px')+text(f'metric-label-{i}',x+24,265,300,30,label,16,'#65756e')+text(f'metric-value-{i}',x+24,306,270,52,value,40,weight=600)+text(f'metric-note-{i}',x+24,365,300,24,note,14,'#65756e')
app+=text('projects-label',264,442,600,35,'Projects in motion',23,weight=600)+text('projects-link',1260,449,140,24,'View all  →',14)
app+=rect('table-header',264,500,1116,44,'#edf0e9','border-radius:6px')
for key,x,w,t in [('name',280,430,'PROJECT'),('owner',755,180,'OWNER'),('status',970,200,'STATUS'),('due',1210,150,'DUE DATE')]: app+=text('col-'+key,x,515,w,20,t,12,'#65756e',700)
for i,(title,sub,owner,status,due) in enumerate([('Fieldnotes identity','Brand strategy · Phase 2','Maya Chen','In progress','Nov 20'),('Orchard website','Digital experience · Phase 1','Jules Park','In review','Nov 24'),('Riverside wayfinding','Environmental · Phase 3','Alex Morgan','In progress','Nov 28'),('Gather launch','Campaign · Phase 1','Sam Rivera','Planning','Dec 02')]):
    y=565+i*75;app+=text(f'project-title-{i}',280,y,450,26,title,17,weight=600)+text(f'project-sub-{i}',280,y+29,450,24,sub,13,'#65756e')+text(f'project-owner-{i}',755,y+12,180,28,owner,15)
    app+=rect(f'project-status-bg-{i}',960,y+4,130,30,['#e4ebdd','#f2e6ca','#e4ebdd','#e9e7f0'][i],'border-radius:15px')+text(f'project-status-{i}',972,y+11,113,22,status,13)+text(f'project-due-{i}',1210,y+12,150,25,due,15)+rect(f'project-rule-{i}',264,y+63,1116,1,'#e3e6e0')
write('app',frame('app','Gather · studio overview',1440,900,'#fcfcf7',app))
svg='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600" viewBox="0 0 1200 600"><rect width="1200" height="600" fill="#cbd9d8"/><circle cx="950" cy="120" r="70" fill="#f5e7b4"/><path d="M0 410L230 290 480 380 750 300 1200 380V600H0Z" fill="#90aaa2"/><path d="M120 440L530 270 1090 400 680 580Z" fill="#617d73"/><path d="M260 250L630 120 990 240 610 380Z" fill="#f0ebda"/><path d="M260 250V435L610 560V380Z" fill="#ddd1ba"/><path d="M610 380V560L990 425V240Z" fill="#f5f0e2"/><path d="M300 295L566 389V488L300 394Z" fill="#34554c"/><path d="M650 395L950 284V394L650 505Z" fill="#34554c"/><path d="M375 322V420M475 357V455M730 365V474M840 324V433" stroke="#b7c9b8" stroke-width="9"/><path d="M600 140L490 340M710 175L600 377" stroke="#c5b89f" stroke-width="8"/><path d="M230 465L600 596M680 575L1040 444" stroke="#e7dfc9" stroke-width="13"/></svg>'
url='data:image/svg+xml;base64,'+base64.b64encode(svg.encode()).decode()
brief=text('brief-brand',52,36,600,25,'NORTH STUDIO / PROJECT BRIEF',14,weight=700,extra='letter-spacing:1px')+text('brief-date',600,36,150,25,'13 NOV 2026',13)
brief+=rect('brief-rule',52,82,690,1,'#b2bcb0')+text('brief-title',52,111,690,118,'A new home for\nRiverside Workshop',43,font='Georgia',extra='letter-spacing:-1px')
brief+=text('brief-deck',52,245,690,66,'A welcoming place to learn, make and share.\nOpening spring 2027 · London Borough of Hackney',18,extra='line-height:1.5')
brief+=f'<img data-design-id="building-image" data-design-kind="image" data-name="Workshop concept illustration" alt="Architectural concept for a light-filled community workshop" src="{url}" style="position:absolute;left:52px;top:340px;width:690px;height:345px;object-fit:cover">'
brief+=text('image-caption',52,698,690,24,'01 / Concept study — a workshop connected to its neighbourhood.',12,'#65756e')
brief+=text('brief-objective-label',52,754,200,25,'THE OPPORTUNITY',13,weight=700)+text('brief-objective',52,793,320,145,'Turn an unused depot into an accessible community workshop. Keep the character of the building and make every visitor feel they belong.',18,extra='line-height:1.45')
brief+=text('brief-deliverables-label',418,754,300,25,'WHAT WE’LL MAKE',13,weight=700)+text('brief-deliverables',418,793,324,145,'Identity and signage system\nA practical, welcoming website\nOpening-week programme\nA toolkit for the local team',18,extra='line-height:1.65')
brief+=rect('brief-footer-rule',52,987,690,1,'#b2bcb0')+text('brief-footer',52,1010,690,58,'Next: concept review · 26 November\nProject lead: Maya Chen · maya@example.test',14,extra='line-height:1.6')
write('brief',frame('brief','Riverside · project brief',794,1123,'#f8f6ed',brief))
perf=''.join(rect(f'cell-{i}',20+(i%20)*49,20+(i//20)*49,40,40,['#667e73','#c9d2bd','#d9ba9f'][i%3],'border-radius:5px') for i in range(300))
write('performance',frame('performance','300 editable elements',1040,800,'#f8f6ed',perf))
print('Wrote five original fixtures to',out)
