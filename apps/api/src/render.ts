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
export function renderHTML(p:Profile,r:Tailored,t:Template){
 const content=sections(p,r,t).map(s=>{if(s.section==='summary')return `<section data-section="summary"><h2>Profile</h2><p>${escape(r.summary.text)}</p>${s.groups.map(g=>g.items.map(i=>`<div class="item">${i.heading?`<strong>${escape(i.heading)}</strong>`:''}<p>${escape(i.text)}</p></div>`).join('')).join('')}</section>`;if(!s.groups.length)return '';return `<section data-section="${s.section}"><h2>${s.section}</h2>${s.groups.map(g=>`<div class="group">${g.group?`<h3>${escape(g.group)}</h3>`:''}${g.items.map(i=>`<div class="item">${i.heading?`<strong>${escape(i.heading)}</strong>`:''}<p>${escape(i.text)}</p></div>`).join('')}</div>`).join('')}</section>`}).filter(Boolean);
 const side=content.filter(c=>/data-section="(skills|languages|certificates)"/.test(c));const main=content.filter(c=>!side.includes(c));
 return `<!doctype html><html><head><meta charset="utf-8"><style>
 @font-face{font-family:'Noto Sans Thai';src:url(data:font/woff2;base64,${thaiFont}) format('woff2');font-weight:100 900}
 @page{size:${t.paper};margin:${t.margin}mm}*{box-sizing:border-box}body{font-family:'${t.font}','Noto Sans Thai',Arial,sans-serif;font-size:${t.bodySize}pt;color:#202a38;line-height:1.45;margin:0;overflow-wrap:anywhere}h1{font-size:${t.nameSize}pt;line-height:1.15;margin:0;color:${t.accent}}h2{text-transform:uppercase;letter-spacing:1px;color:${t.accent};font-size:${t.bodySize+1}pt;border-bottom:1px solid ${t.accent};padding-bottom:3px;margin:0 0 8px}h3{font-size:${t.bodySize+0.5}pt;margin:6px 0}p{margin:3px 0 7px;white-space:pre-line}header{margin-bottom:7mm}section{margin-bottom:${t.gap}mm}h2,h3,strong{break-after:avoid}.item{break-inside:avoid}.columns{display:grid;grid-template-columns:${t.sidebarWidth}% 1fr;gap:6mm}.side{background:${t.background};padding:4mm}.role{font-size:13pt;margin:7px 0}.contact{color:#526174;font-size:9pt} @media screen{body{padding:${t.margin}mm;max-width:${t.paper==='A4'?210:216}mm;margin:auto;background:white;min-height:297mm}}
 </style></head><body><header><h1>${escape(p.name)}</h1><p class="role">${escape(r.targetRole)}</p><p class="contact">${[p.email,p.phone,p.location,...p.links].filter(Boolean).map(escape).join(' · ')}</p></header>${t.layout==='sidebar'?`<div class="columns"><aside class="side">${side.join('')}</aside><main>${main.join('')}</main></div>`:content.join('')}</body></html>`;
}
export async function renderPDF(html:string){
 const browser=await chromium.launch({headless:true,args:process.env.CHROMIUM_NO_SANDBOX==='true'?['--no-sandbox']:[]});
 try{const page=await browser.newPage();await page.route('**/*',r=>r.abort());await page.setContent(html);await page.emulateMedia({media:'print'});await page.evaluate(()=>document.fonts.ready);
 const overflow=await page.evaluate(()=>Array.from(document.querySelectorAll('.item')).some(el=>el.scrollWidth>el.clientWidth+2));
 if(overflow)throw new Error('Text overflows horizontally. Adjust the template before exporting.');
 return await page.pdf({printBackground:true,preferCSSPageSize:true});}finally{await browser.close();}
}
export async function renderDOCX(p:Profile,r:Tailored,t:Template){
 const children=[new Paragraph({text:p.name,heading:HeadingLevel.TITLE}),new Paragraph(r.targetRole),new Paragraph([p.email,p.phone,p.location,...p.links].filter(Boolean).join(' · '))];
 for(const s of sections(p,r,t)){if(s.section!=='summary'&&!s.groups.length)continue;children.push(new Paragraph({text:s.section.toUpperCase(),heading:HeadingLevel.HEADING_1}));if(s.section==='summary')children.push(new Paragraph(r.summary.text));for(const g of s.groups){if(g.group)children.push(new Paragraph({text:g.group,heading:HeadingLevel.HEADING_2}));for(const item of g.items){if(item.heading)children.push(new Paragraph({children:[new TextRun({text:item.heading,bold:true})]}));children.push(new Paragraph(item.text));}}}
 return Packer.toBuffer(new Document({styles:{default:{document:{run:{font:t.font,size:t.bodySize*2}},heading1:{run:{color:t.accent.slice(1)}}}},sections:[{properties:{page:{size:{width:t.paper==='A4'?11906:12240,height:t.paper==='A4'?16838:15840},margin:{top:t.margin*56.7,bottom:t.margin*56.7,left:t.margin*56.7,right:t.margin*56.7}}},children}]}));
}
