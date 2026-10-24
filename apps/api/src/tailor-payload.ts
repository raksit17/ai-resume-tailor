import {z} from 'zod';
import {aiPreflight} from './ai';
import {Profile,Tailored,jobSchema,tailoredSchema} from './schema';

export const TAILOR_INSTRUCTION =
 'Select and rewrite ONLY verified resume facts for the job. Facts contain an id, section, heading, group and original detail excerpt. '+
 'Use a sourceFactId at most once in items. All claims and numeric achievements MUST be supported by the cited fact. '+
 'Summary must cite real fact IDs. Never invent skills or rewrite historic job titles. '+
 'Prioritize explicit job requirements; record unsupported requirements in notes. '+
 'Use the user instructions only where consistent with the verified facts.';

type CompactFact={id:string;section:Profile['facts'][number]['section'];group:string;heading:string;detail:string};
type CompactJob=z.infer<typeof jobSchema>;

type TailorInput={
 facts:CompactFact[];
 job:CompactJob;
 prompt:string;
 maxPages:number;
 previous:Pick<Tailored,'targetRole'|'summary'|'items'>|null;
};
const stopwords=new Set(['with','that','have','from','they','their','your','this','and','the','for','are','you','about','will','can','need','must','more','than','work','experience','knowledge','understanding','development','developer','using','based','such','including','technology','technologies','company']);

function words(value:string):Set<string>{
 const hits=value.toLowerCase().match(/[a-z0-9][a-z0-9.+#/-]{2,}|[\u0e00-\u0e7f]{3,}/g)||[];
 return new Set(hits.filter(v=>!stopwords.has(v)));
}
function overlap(value:string,needles:Set<string>){
 let hits=0;
 for(const word of words(value))if(needles.has(word))hits++;
 return hits;
}
function excerpt(detail:string,needles:Set<string>,maxChars=3000):string{
 if(detail.length<=maxChars)return detail;
 const lines=detail.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
 if(!lines.length)return detail.slice(0,maxChars);
 const ranked=lines.map((text,index)=>({index,text,score:overlap(text,needles)}))
  .sort((a,b)=>b.score-a.score||a.index-b.index);
 const selected:{index:number;text:string}[]=[];
 let remaining=maxChars;
 for(const line of ranked){
  if(remaining<60)break;
  const cut=line.text.length>remaining?line.text.slice(0,remaining).trimEnd():line.text;
  if(!cut)continue;
  selected.push({index:line.index,text:cut});
  remaining-=cut.length+1;
 }
 return selected.sort((a,b)=>a.index-b.index).map(l=>l.text).join('\n');
}
function factRank(f:CompactFact,needles:Set<string>){
 const sectionPriority=f.section==='work'?5:f.section==='projects'?4:f.section==='skills'?3:f.section==='education'?2:0;
 return overlap(f.heading+' '+f.detail,needles)*5+sectionPriority;
}

export function buildTailorPayload(
 profile:Profile,jobData:unknown,prompt:string,maxPages:number,previous:Tailored|null=null
):{data:TailorInput;warnings:string[];diagnostics:{inputTokens:number;tokenBudget:number;selectedFacts:number;availableFacts:number}}{
 const job=jobSchema.parse(jobData); // strips raw job.source, model metadata, duplicated JD text
 const verified=profile.facts.filter(f=>f.verified);
 if(!verified.length)throw new Error('Confirm at least one fact first');
 const facts=verified.map(({id,section,group,heading,detail})=>({id,section,group,heading,detail}));
 const prev=previous?{targetRole:previous.targetRole,summary:previous.summary,items:previous.items}:null;
 const warnings:string[]=[];
 const payload:TailorInput={facts,job,prompt,maxPages,previous:prev};
 let check=aiPreflight(tailoredSchema,TAILOR_INSTRUCTION,payload);
 if(check.fits)return {data:payload,warnings,diagnostics:{inputTokens:check.estimated,tokenBudget:check.budget,selectedFacts:facts.length,availableFacts:facts.length}};

 // Previous notes and complete older drafts are snapshots. If the context is too
 // small, prioritize the current user instruction and confirmed source facts.
 if(payload.previous){
  payload.previous=null;
  warnings.push('The previous resume draft was omitted from the AI prompt to fit the context; the original revision remains stored.');
  check=aiPreflight(tailoredSchema,TAILOR_INSTRUCTION,payload);
  if(check.fits)return {data:payload,warnings,diagnostics:{inputTokens:check.estimated,tokenBudget:check.budget,selectedFacts:facts.length,availableFacts:facts.length}};
 }

 const terms=words([job.title,...job.required,...job.preferred,...job.responsibilities].join(' '));
 const ranked=facts.map((fact,index)=>({fact,index,score:factRank(fact,terms)}))
  .sort((a,b)=>b.score-a.score||a.index-b.index);
 const kept:CompactFact[]=[];
 let excerpted=0;
 for(const {fact} of ranked){
  const proposed=[...kept,fact];
  const full={...payload,facts:proposed};
  if(aiPreflight(tailoredSchema,TAILOR_INSTRUCTION,full).fits){
   kept.push(fact);
   continue;
  }
  // Legacy imports may hold an entire PDF page as one verified "fact".
  // Select verbatim lines relevant to the job, never fabricate a summary.
  const shortened=excerpt(fact.detail,terms,1800);
  if(shortened!==fact.detail&&aiPreflight(tailoredSchema,TAILOR_INSTRUCTION,{...payload,facts:[...kept,{...fact,detail:shortened}]}).fits){
   kept.push({...fact,detail:shortened});excerpted++;
  }
 }
 if(!kept.length)throw new Error('Verified resume facts and job requirements exceed the Ollama context even after compacting. Re-import the resume to split large facts, or shorten the user prompt.');
 const omitted=facts.length-kept.length;
 if(excerpted)warnings.push('Used selected verbatim excerpts from '+excerpted+' long fact(s) to fit Ollama context. Review generated statements against the complete saved originals.');
 if(omitted)warnings.push('Selected '+kept.length+' of '+facts.length+' verified facts by job relevance to fit the local AI context. Other facts remain in Master Resume.');
 payload.facts=kept;
 check=aiPreflight(tailoredSchema,TAILOR_INSTRUCTION,payload);
 if(!check.fits)throw new Error('Unable to fit the verified facts into the configured AI context.');
 return {data:payload,warnings,diagnostics:{inputTokens:check.estimated,tokenBudget:check.budget,selectedFacts:kept.length,availableFacts:facts.length}};
}
