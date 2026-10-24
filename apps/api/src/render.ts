import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {Document,Packer,Paragraph,TextRun,HeadingLevel} from 'docx';
import {Profile,Tailored,Template} from './schema';
const thaiFont=readFileSync(require.resolve('@fontsource/noto-sans-thai/files/noto-sans-thai-thai-400-normal.woff2')).toString('base64');
export const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function sections(p:Profile,r:Tailored,t:Template){
 const facts=new Map(p.facts.map(f=>[f.id,f]));
 return t.sections.map(section=>({section,groups:[...new Set(r.items.filter(i=>facts.get(i.sourceFactId)?.section===section).map(i=>facts.get(i.sourceFactId)!.group))].map(group=>({group,items:r.items.filter(i=>{const f=facts.get(i.sourceFactId);return f?.section===section&&f.group===group}).map(i=>({...i,heading:facts.get(i.sourceFactId)!.heading}))}))}));
}

type SectionGroup=ReturnType<typeof sections>[number]['groups'][number];
function positionTitle(section:string,heading:string){
 if(section==='work'||section==='projects'){
  const parts=heading.split(' | ');
  return parts.length>=2?parts.slice(0,2).join(' | '):parts[0]||'';
 }
 return heading;
}
function groupedRoles(section:string,g:SectionGroup){
 const result=new Map<string,typeof g.items>();
 for(const item of g.items){
  const title=positionTitle(section,item.heading);
  if(!result.has(title))result.set(title,[]);
  result.get(title)!.push(item);
 }
 return result;
}
function groupHTML(section:string,g:SectionGroup){
 const groupName=g.group?'<h3>'+escape(g.group)+'</h3>':'';
 if(['skills','languages','certificates'].includes(section)){
  return '<div class="group compact-group">'+groupName+
   '<p class="compact-values">'+g.items.map(i=>escape(i.text)).join(' · ')+'</p></div>';
 }
 let content='';
 for(const [role,items] of groupedRoles(section,g)){
  const roleLine=role&&!/unparsed original text|original text.*review/i.test(role)?
   '<div class="position">'+escape(role)+'</div>':'';
  content+='<div class="role-group">'+roleLine+
   '<ul class="bullets">'+items.map(i=>'<li>'+escape(i.text)+'</li>').join('')+'</ul></div>';
 }
 return '<div class="group">'+groupName+content+'</div>';
}

export function renderHTML(p:Profile,r:Tailored,t:Template,profilePhoto?:string|null){
 const content=sections(p,r,t).map(s=>{
  if(s.section==='summary')return '<section data-section="summary"><h2>Profile</h2><p>'+escape(r.summary.text)+'</p></section>';
  if(!s.groups.length)return '';
  const label:Record<string,string>={work:'Professional Experience',skills:'Technical Skills',projects:'Projects',education:'Education',languages:'Languages',certificates:'Certifications'};
  return '<section data-section="'+s.section+'"><h2>'+(label[s.section]||s.section)+'</h2>'+
   s.groups.map(g=>groupHTML(s.section,g)).join('')+'</section>';
 }).filter(Boolean);
 const side=content.filter(c=>/data-section="(skills|languages|certificates)"/.test(c));const main=content.filter(c=>!side.includes(c));
 return `<!doctype html><html><head><meta charset="utf-8"><style>
 @font-face{font-family:'Noto Sans Thai';src:url(data:font/woff2;base64,${thaiFont}) format('woff2');font-weight:100 900}
 @page{size:${t.paper};margin:${t.margin}mm}*{box-sizing:border-box}body{font-family:'${t.font}','Noto Sans Thai',Arial,sans-serif;font-size:${t.bodySize}pt;color:#202a38;line-height:1.29;margin:0;overflow-wrap:anywhere}h1{font-size:${t.nameSize}pt;line-height:1.15;margin:0;color:${t.accent}}h2{text-transform:uppercase;letter-spacing:1px;color:${t.accent};font-size:${t.bodySize+1}pt;border-bottom:1px solid ${t.accent};padding-bottom:2px;margin:0 0 5px}h3{font-size:${t.bodySize+0.5}pt;margin:5px 0 2px}p{margin:2px 0 5px;white-space:pre-line}header{margin-bottom:7mm;min-height:20mm;display:flow-root}.portrait{float:right;width:24mm;height:27mm;object-fit:cover;margin-left:5mm;margin-bottom:3mm}section{margin-bottom:${Math.min(t.gap,6)}mm}.position{font-weight:600;margin:3px 0 2px}.role-group{break-inside:avoid;margin-bottom:5px}.bullets{margin:2px 0 5px;padding-left:17px}.bullets li{line-height:1.3;margin:0 0 2px}.compact-values{line-height:1.4;margin:2px 0 4px}.group{margin-bottom:4px}h2,h3,strong{break-after:avoid}.item{break-inside:avoid}.columns{display:grid;grid-template-columns:${t.sidebarWidth}% 1fr;gap:6mm}.side{background:${t.background};padding:4mm}.role{font-size:13pt;margin:7px 0}.contact{color:#526174;font-size:9pt} @media screen{body{padding:${t.margin}mm;max-width:${t.paper==='A4'?210:216}mm;margin:auto;background:white;min-height:297mm}}
 </style></head><body><header>${profilePhoto&&/^[A-Za-z0-9+/=]+$/.test(profilePhoto)?`<img class="portrait" src="data:image/png;base64,${profilePhoto}" alt="Profile photo">`:''}<h1>${escape(p.name)}</h1><p class="role">${escape(r.targetRole)}</p><p class="contact">${[p.email,p.phone,p.location,...p.links].filter(Boolean).map(escape).join(' · ')}</p></header>${t.layout==='sidebar'?`<div class="columns"><aside class="side">${side.join('')}</aside><main>${main.join('')}</main></div>`:content.join('')}</body></html>`;
}
export async function renderPDF(html:string){
 const browser=await chromium.launch({headless:true,args:process.env.CHROMIUM_NO_SANDBOX==='true'?['--no-sandbox']:[]});
 try{const page=await browser.newPage();await page.route('**/*',r=>r.abort());await page.setContent(html);await page.emulateMedia({media:'print'});await page.evaluate(()=>document.fonts.ready);
 const overflow=await page.evaluate(()=>Array.from(document.querySelectorAll('.item')).some(el=>el.scrollWidth>el.clientWidth+2));
 if(overflow)throw new Error('Text overflows horizontally. Adjust the template before exporting.');
 return await page.pdf({printBackground:true,preferCSSPageSize:true});}finally{await browser.close();}
}
export async function renderDOCX(p:Profile,r:Tailored,t:Template){
 const children=[
  new Paragraph({text:p.name,heading:HeadingLevel.TITLE}),
  new Paragraph(r.targetRole),
  new Paragraph([p.email,p.phone,p.location,...p.links].filter(Boolean).join(' · '))
 ];
 for(const s of sections(p,r,t)){
  if(s.section!=='summary'&&!s.groups.length)continue;
  const labels:Record<string,string>={summary:'Profile',work:'Professional Experience',skills:'Technical Skills',projects:'Projects',education:'Education',languages:'Languages',certificates:'Certifications'};
  children.push(new Paragraph({text:labels[s.section]||s.section,heading:HeadingLevel.HEADING_1}));
  if(s.section==='summary'){children.push(new Paragraph(r.summary.text));continue;}
  for(const g of s.groups){
   if(g.group)children.push(new Paragraph({text:g.group,heading:HeadingLevel.HEADING_2}));
   if(['skills','languages','certificates'].includes(s.section)){
    children.push(new Paragraph(g.items.map(i=>i.text).join(' · ')));
    continue;
   }
   for(const [role,items] of groupedRoles(s.section,g)){
    if(role&&!/unparsed original text|original text.*review/i.test(role))
     children.push(new Paragraph({children:[new TextRun({text:role,bold:true})]}));
    for(const item of items)children.push(new Paragraph({text:item.text,bullet:{level:0}}));
   }
  }
 }
 return Packer.toBuffer(new Document({
  styles:{default:{document:{run:{font:t.font,size:t.bodySize*2}},heading1:{run:{color:t.accent.slice(1)}}}},
  sections:[{properties:{page:{size:{width:t.paper==='A4'?11906:12240,height:t.paper==='A4'?16838:15840},
   margin:{top:t.margin*56.7,bottom:t.margin*56.7,left:t.margin*56.7,right:t.margin*56.7}}},children}]
 }));
}
