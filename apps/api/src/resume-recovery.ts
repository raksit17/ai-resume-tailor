import {Profile,profileSchema} from './schema';

// No model required. Read only literal text from the user's document.
// Never mark facts verified without the user's explicit confirmation.
export function recoverResumeFromText(text:string,textPages?:string[]):{profile:Profile;warnings:string[]}{
 const pages=textPages?.length?textPages:[text];
 const all=pages.join('\n');
 const first=pages[0]||text;
 const fullLines=first.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
 const email=all.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0]||'';
 const phone=all.match(/\+?\d[\d()\- ]{7,}\d/)?.[0]?.replace(/\s+/g,' ').trim()||'';
 const name=fullLines[0]||'';
 const links=[...new Set((all.match(/https?:\/\/[^\s|]+/g)||[]).map(s=>s.replace(/[),.;]+$/,'')))].slice(0,10);
 const facts:Profile['facts']=[];
 const seen=new Set<string>();
 let section:Profile['facts'][number]['section']='summary';
 let group='';
 let heading='';
 const add=(detail:string,source:string,sec=section)=>{
  if(!detail.trim()||!source.trim()||facts.length>=200)return;
  const key=[sec,group,heading,detail].join('|').toLowerCase();
  if(seen.has(key))return;
  seen.add(key);
  facts.push({id:'fact_'+(facts.length+1),section:sec,group,heading,detail:detail.trim().slice(0,9900),source:source.trim().slice(0,9900),verified:false});
 };
 const sectionTitles:Record<string,Profile['facts'][number]['section']>={
  'profile':'summary','professional summary':'summary','summary':'summary',
  'professional experience':'work','work experience':'work','employment history':'work',
  'education':'education','academic background':'education',
  'key skills':'skills','technical skills':'skills','skills':'skills',
  'projects':'projects','personal projects':'projects',
  'languages':'languages','certifications':'certificates','certificates':'certificates'
 };
 const date=/\b(?:0?[1-9]|1[0-2])\/(?:19|20)\d{2}\s*[–—-]\s*(?:(?:0?[1-9]|1[0-2])\/(?:19|20)\d{2}|Present|Current)\b/i;
 let skippedContact=false;
 let subsection='';
 for(const [pageIndex,page] of pages.entries()){
  const lines=page.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  for(let i=0;i<lines.length;i++){
   const line=lines[i];
   const title=line.replace(/^[-–•\s]+/,'').replace(/\s*:\s*$/,'').toLowerCase().trim();
   if(title==='social links'||title==='links'){section='summary';group='';heading='';skippedContact=true;continue;}
   const nextSection=sectionTitles[title];
   if(nextSection){section=nextSection;group='';heading='';subsection='';skippedContact=true;continue;}
   if(!skippedContact&&pageIndex===0){
    // Before the first section heading the PDF usually contains the name/address/contact.
    continue;
   }
   if(/^https?:\/\/|^github:|^link(?:ed)?in\b/i.test(line)){continue;}
   if(section==='work'||section==='education'){
    // Role or degree, organization, date. Header fields stay separate
    // from achievements but are retained as contextual group/heading.
    if(i+2<lines.length&&date.test(lines[i+2])&&line.length<115&&lines[i+1].length<115){
     group=lines[i+1];
     heading=line+' | '+lines[i+2];
     subsection='';
     i+=2;
     continue;
    }
    if(date.test(line)&&!heading){heading=line;continue;}
    if(/^[A-Za-z &/+-]{5,60}\s*:$/.test(line)){subsection=line.replace(/:$/,'');continue;}
   }
   if(section==='skills'||section==='languages'){
    if(/^[-–]\s*[A-Za-z ]+$/.test(line)){group=line.replace(/^[-–]\s*/,'');continue;}
    const columns=line.split(/\s{3,}/).map(x=>x.trim()).filter(Boolean);
    // Preserve the original skills table columns, do not invent proficiency.
    if(columns.length>1){
     for(const item of columns)add(item,item);
     continue;
    }
    if(/^(Expert|Competent|Proficient|Intermediate|Advanced|Basic)(\s+|$)/i.test(line))continue;
   }
   // Preserve original wording of work/education bullet. Avoid a full PDF page
   // as one evidence fact; keep each extracted line distinct for user review.
   const detail=line.replace(/^\s*[•●▪]\s*/,'');
   if(detail===name||detail===email)continue;
   if(section==='summary'&&detail.startsWith('Address:'))continue;
   const savedHeading=heading;
   if(subsection)heading=savedHeading+' | '+subsection;
   add(detail,line);
   heading=savedHeading;
  }
 }
 if(!facts.length)throw new Error('No readable evidence could be recovered from the original document.');
 const warnings=[
  'Recovered '+facts.length+' source-grounded facts from the original document. Review dates, company/role, skill proficiency, and every claim before confirming.',
  'Recovered facts are unverified until explicitly checked; no source content has been promoted to a verified claim automatically.'
 ];
 if(facts.length===200)warnings.push('Reached the 200-fact limit; review the source text for additional items.');
 return {profile:profileSchema.parse({name,email,phone,location:'',links,facts}),warnings};
}
