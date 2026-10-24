import {Profile,profileSchema} from './schema';

type Section=Profile['facts'][number]['section'];
type Fact=Profile['facts'][number];
const headers:Record<string,Section>={
 'profile':'summary','professional summary':'summary','summary':'summary',
 'professional experience':'work','work experience':'work','employment history':'work',
 'education':'education','academic background':'education',
 'key skills':'skills','technical skills':'skills','skills':'skills',
 'projects':'projects','personal projects':'projects',
 'certifications':'certificates','certificates':'certificates'
};
const date=/\b(?:0?[1-9]|1[0-2])\/(?:19|20)\d{2}\s*[–—-]\s*(?:(?:0?[1-9]|1[0-2])\/(?:19|20)\d{2}|Present|Current)\b/i;
const proficiency=/^(?:Expert|Competent|Proficient|Intermediate|Advanced|Basic|Beginner|Fluent|Native)$/i;
const normalize=(v:string)=>v.replace(/\s+/g,' ').trim().toLowerCase();
const columns=(v:string)=>v.trim().split(/\s{3,}/).map(x=>x.trim()).filter(Boolean);
function isContinuation(previous:string,current:string){
 if(!previous)return false;
 if(/^[a-z]/.test(current)||/^\d/.test(current))return true;
 return /\b(?:by|and|with|of|for|to|in|as|on|more|production|response|processing|speed)\s*$/i.test(previous);
}
function isSubheading(v:string){return /^[A-Za-z &/+-]{5,70}:$/.test(v);}
function original(v:string){return v.trim().replace(/^[•●▪]\s*/,'');}

export function recoverResumeFromText(text:string,textPages?:string[]):{profile:Profile;warnings:string[]}{
 const pages=textPages?.length?textPages:[text];
 const all=pages.join('\n');
 const first=(pages[0]||text).split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 const name=first[0]||'';
 const email=all.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0]||'';
 const phone=all.match(/(?:Phone(?: Number)?\s*:\s*)(\+?\d[\d()\- ]{7,}\d)/i)?.[1]?.trim()||'';
 const location=all.match(/(?:Address\s*:\s*)(.*?)(?:\s+Phone(?: Number)?\s*:|$)/im)?.[1]?.trim()||'';
 const links=[...new Set((all.match(/https?:\/\/[^\s|]+/g)||[]).map(s=>s.replace(/[),.;]+$/,'')))].slice(0,10);
 const facts:Fact[]=[];
 const seen=new Set<string>();
 let section:Section='summary';
 let group='';
 let heading='';
 let roleHeading='';
 let subsection='';
 let started=false;
 const push=(value:string,source:string,sec:Section=section,grp=group,hdg=heading)=>{
  if(!value.trim()||!source.trim()||facts.length>=200)return;
  const item={id:'fact_'+(facts.length+1),section:sec,group:grp,heading:hdg,
   detail:value.trim().slice(0,9900),source:source.trim().slice(0,9900),verified:false};
  const key=normalize([item.section,item.group,item.heading,item.detail].join('|'));
  if(seen.has(key))return;
  seen.add(key);facts.push(item);
 };
 const block={detail:'',source:''};
 const flush=()=>{
  if(block.detail)push(block.detail,block.source);
  block.detail='';block.source='';
 };
 const append=(line:string)=>{
  const sentence=original(line);
  if(!sentence)return;
  block.detail=block.detail?block.detail+' '+sentence:sentence;
  block.source=block.source?block.source+'\n'+line:line;
 };

 for(const page of pages){
  const lines=page.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  for(let i=0;i<lines.length;i++){
   const line=lines[i];
   const title=line.replace(/^[-–—•\s]+/,'').replace(/\s*:\s*$/,'').toLowerCase().trim();
   if(headers[title]||(title==='languages'&&section!=='skills')){
    flush();section=headers[title]||'languages';group='';heading='';roleHeading='';subsection='';started=true;continue;
   }
   if(title==='languages'&&section==='skills'){flush();section='languages';group='';heading='';roleHeading='';continue;}
   if(title==='software'||title==='technical tools'||title==='technologies'){
    flush();section='skills';group='Software';heading='';roleHeading='';subsection='';started=true;continue;
   }
   if(title==='social links'||title==='links'){flush();section='summary';group='';heading='';continue;}
   if(!started)continue;
   if(/^https?:\/\/|^github:|^link(?:ed)?in\b/i.test(line))continue;
   if(section==='work'||section==='education'){
    if(i+2<lines.length&&date.test(lines[i+2])&&line.length<130&&lines[i+1].length<130){
     flush();group=lines[i+1];heading=line+' | '+lines[i+2];roleHeading=heading;subsection='';i+=2;continue;
    }
    if(date.test(line)&&!heading){flush();heading=line;continue;}
    if(isSubheading(line)){flush();subsection=line.replace(/:$/,'');heading=roleHeading?roleHeading+' | '+subsection:subsection;continue;}
    // All hard-wrapped lines belong to the preceding bullet, not separate facts.
    if(block.detail&&(isContinuation(block.detail,line)||/^\s*(?:by|and|in|for|with)\b/i.test(line))){
     append(line);continue;
    }
    flush();
    append(line);
    continue;
   }
   if(section==='skills'||section==='languages'){
    flush();
    const items=columns(line);
    if(items.every(v=>proficiency.test(v)))continue;
    const next=lines[i+1]?columns(lines[i+1]):[];
    const withLevels=next.length===items.length&&next.every(v=>proficiency.test(v));
    // Preserve an actual two-line table as one evidence citation per skill.
    if(items.length>1||withLevels){
     for(let k=0;k<items.length;k++){
      const value=items[k];
      if(!value||proficiency.test(value))continue;
      push(value+(withLevels?' — '+next[k]:''),line+(withLevels?'\n'+lines[i+1]:''),
       section,group,'');
     }
     if(withLevels)i++;
     continue;
    }
    if(proficiency.test(line))continue;
    if(/^[-–—]\s*[A-Za-z ]+$/.test(line)){group=line.replace(/^[-–—]\s*/,'');continue;}
    push(line,line,section,group,'');
    continue;
   }
   if(section==='summary'){
    // The professional summary is usually a wrapped paragraph.
    if(block.detail){append(line);}else append(line);
    continue;
   }
   flush();push(original(line),line);
  }
  flush();
 }
 if(!facts.length)throw new Error('No readable evidence could be recovered from the original document.');
 const warnings=[
  'Recovered '+facts.length+' source-grounded facts from the original document. Review role dates, proficiency and every claim before confirming.',
  'All recovered facts are unverified. The saved original PDF and existing Master Resume were not modified.'
 ];
 if(facts.length>=200)warnings.push('200-fact maximum reached: some text may need manual recovery from the original PDF.');
 return {profile:profileSchema.parse({name,email,phone,location,links,facts}),warnings};
}
