import {Profile,Tailored,jobSchema,tailoredSchema,truthGuard} from './schema';

// Deterministic presentation pass, AFTER the model output passed truthGuard.
// Every emitted line comes from a separately verified sourceFactId. A small
// model must not be allowed to drop entire Work/Skills/Education sections.
type Fact=Profile['facts'][number];
type Item=Tailored['items'][number];
const sectionOrder=['work','skills','projects','education','languages','certificates'] as const;
const plain=(s:string)=>s.toLowerCase().replace(/\s+/g,' ').trim();
const words=(s:string)=>new Set((plain(s).match(/[a-z][a-z0-9.+#/-]{1,}|[\u0e00-\u0e7f]{3,}/g)||[])
 .filter(t=>!new Set(['and','with','for','the','such','knowledge','experience','developer','years','technology','related','required','work']).has(t)));
const relevance=(fact:Fact,terms:Set<string>)=>{
 const corpus=words(fact.detail+' '+fact.heading);
 let n=0;for(const term of corpus)if(terms.has(term))n++;
 return n;
};
function bulletLimit(maxPages:number,groupIndex:number):number{
 return maxPages===1?(groupIndex===0?3:1):maxPages===2?(groupIndex===0?6:3):(groupIndex===0?9:4);
}
export function composeResume(
 profile:Profile,raw:Tailored,jobData:unknown,maxPages:number
):{tailored:Tailored;warnings:string[]}{
 const draft=tailoredSchema.parse(raw);
 truthGuard(profile,draft);
 const job=jobSchema.parse(jobData);
 const verified=profile.facts.filter(f=>f.verified);
 const available=new Map(verified.map(f=>[f.id,f]));
 const selected=new Map(draft.items.map(i=>[i.sourceFactId,i]));
 const terms=words([job.title,...job.required,...job.preferred,...job.responsibilities].join(' '));
 const warnings:string[]=[];
 const items:Item[]=[];
 const used=new Set<string>();
 const add=(fact:Fact)=>{
  if(used.has(fact.id))return;
  // Prefer the model's wording only when it was already checked against the
  // cited source. Otherwise use the original exact verified statement.
  const text=(selected.get(fact.id)?.text||fact.detail).trim();
  if(!text)return;
  used.add(fact.id);items.push({sourceFactId:fact.id,text});
 };
 const groups=new Map<string,Fact[]>();
 for(const fact of verified.filter(f=>f.section==='work')){
  const label=plain(fact.group||fact.heading)||'other employment';
  if(!groups.has(label))groups.set(label,[]);
  groups.get(label)!.push(fact);
 }
 // Distinct employers are given room, rather than allowing one employer with
 // many API-related bullets to crowd out all prior employment.
 let gidx=0;
 for(const facts of groups.values()){
  if(gidx>= (maxPages===1?2:4))break;
  const originalIndex=new Map(facts.map((f,i)=>[f.id,i]));
  const ordered=[...facts].sort((a,b)=>relevance(b,terms)-relevance(a,terms)||
   Number(selected.has(b.id))-Number(selected.has(a.id))||
   originalIndex.get(a.id)!-originalIndex.get(b.id)!);
  ordered.slice(0,bulletLimit(maxPages,gidx)).forEach(add);
  if(facts.length>bulletLimit(maxPages,gidx))warnings.push('Selected the most job-relevant verified bullets for '+(facts[0].group||'an employer')+' to keep the resume concise.');
  gidx++;
 }
 const skills=verified.filter(f=>f.section==='skills');
 skills.sort((a,b)=>relevance(b,terms)-relevance(a,terms)||
  Number(selected.has(b.id))-Number(selected.has(a.id)));
 skills.slice(0,maxPages===1?7:maxPages===2?12:16).forEach(add);
 // An education entry is useful even when AI left it out. Preserve each
 // verified school or training provider; no degree or qualification is invented.
 const schools=new Map<string,Fact[]>();
 for(const fact of verified.filter(f=>f.section==='education')){
  const key=plain(fact.group||fact.heading)||'education';
  if(!schools.has(key))schools.set(key,[]);
  schools.get(key)!.push(fact);
 }
 for(const facts of [...schools.values()].slice(0,maxPages===1?1:3)){
  facts.slice(0,maxPages===1?1:2).forEach(add);
 }
 const projects=verified.filter(f=>f.section==='projects')
  .sort((a,b)=>relevance(b,terms)-relevance(a,terms));
 projects.slice(0,maxPages>2?3:1).forEach(add);
 verified.filter(f=>f.section==='languages').slice(0,2).forEach(add);
 if(maxPages>2)verified.filter(f=>f.section==='certificates').slice(0,3).forEach(add);
 // Fallback for profiles with no categorized facts (older imported CVs).
 if(!items.length)for(const item of draft.items)if(available.has(item.sourceFactId))items.push(item);
 if(!items.length)throw new Error('No verified evidence available to compose a resume.');
 const originalSections=new Set(draft.items.map(i=>available.get(i.sourceFactId)?.section));
 for(const section of sectionOrder){
  if(verified.some(f=>f.section===section)&&!originalSections.has(section)&&
    items.some(i=>available.get(i.sourceFactId)?.section===section)){
   warnings.push('Restored verified '+section+' evidence that the model omitted.');
  }
 }
 const tailored=tailoredSchema.parse({...draft,items});
 truthGuard(profile,tailored);
 return {tailored,warnings};
}
