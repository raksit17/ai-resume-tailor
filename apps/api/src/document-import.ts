import {ai} from './ai';
import {Profile,profileSchema} from './schema';

export const MAX_CHUNK_BYTES = 3600;
export const MAX_IMPORT_CHUNKS = 48;

export type ImportChunk = {page:number;part:number;text:string};

function chunkByBytes(text:string,maxBytes:number):string[]{
 const result:string[]=[];
 let current='';
 let bytes=0;
 for(const char of text){
  const size=Buffer.byteLength(char,'utf8');
  if(bytes+size>maxBytes&&current){result.push(current);current='';bytes=0;}
  current+=char;bytes+=size;
 }
 if(current)result.push(current);
 return result;
}

// Keep all source text, including scanned/OCR pages. Never silently truncate a CV.
export function splitResume(text:string,textPages?:string[]):ImportChunk[]{
 const pages=textPages?.length?textPages:[text];
 const result:ImportChunk[]=[];
 pages.forEach((page,index)=>{
  let buffer='';
  let part=0;
  const flush=()=>{if(buffer.trim()){result.push({page:index+1,part:++part,text:buffer});buffer='';}};
  for(const line of page.match(/[^\n]*\n|[^\n]+$/g)||[]){
   for(const piece of chunkByBytes(line,MAX_CHUNK_BYTES)){
    if(Buffer.byteLength(buffer,'utf8')+Buffer.byteLength(piece,'utf8')>MAX_CHUNK_BYTES)flush();
    buffer+=piece;
   }
  }
  flush();
 });
 if(result.length>MAX_IMPORT_CHUNKS)throw new Error(`Resume contains ${result.length} chunks (maximum ${MAX_IMPORT_CHUNKS}); please split this document before importing. No data was discarded.`);
 return result;
}

function fallbackFact(chunk:ImportChunk){
 const excerpt=chunk.text.trim().slice(0,9000);
 return {id:'',section:'summary' as const,group:`Page ${chunk.page}`,heading:'Unparsed original text — review required',detail:excerpt,source:excerpt,verified:false};
}
function normalized(value:string){return value.replace(/\s+/g,' ').trim().toLowerCase();}

export async function importResumeFacts(text:string,textPages?:string[]){
 const chunks=splitResume(text,textPages);
 if(!chunks.length)throw new Error('No readable resume text');
 const warnings:string[]=[];
 const facts:Profile['facts']=[];
 const seen=new Set<string>();
 const profile:Profile={name:'',email:'',phone:'',location:'',links:[],facts};
 let fallbackCount=0;

 for(const chunk of chunks){
  let accepted=0;
  try{
   const output=await ai(profileSchema,
    'Extract only facts stated verbatim in this resume fragment. Preserve actual roles and dates. The source field MUST be an exact contiguous quote of the supplied fragment. Never invent facts. Use verified=false. Maximum 20 concise facts per fragment. Contact details may appear on only one page.',
    {page:chunk.page,part:chunk.part,text:chunk.text},[],'resume-import');
   const value=output.value;
   for(const key of ['name','email','phone','location'] as const)if(!profile[key]&&value[key])profile[key]=value[key];
   for(const link of value.links)if(!profile.links.includes(link)&&profile.links.length<10)profile.links.push(link);
   for(const fact of value.facts){
    if(!fact.source.trim()||!normalized(chunk.text).includes(normalized(fact.source))){
     warnings.push(`Page ${chunk.page}, part ${chunk.part}: discarded claim without a matching original quotation`);
     continue;
    }
    const key=normalized([fact.section,fact.group,fact.heading,fact.detail].join('|'));
    if(seen.has(key))continue;
    seen.add(key);
    facts.push({...fact,id:`fact_${facts.length+1}`,verified:false});
    accepted++;
    if(facts.length>=200)break;
   }
  }catch(e){
   warnings.push(`Page ${chunk.page}, part ${chunk.part}: AI extraction failed (${(e as Error).message.slice(0,180)}); original text was retained for manual review`);
  }
  if(accepted===0&&facts.length<200){
   const raw=fallbackFact(chunk);
   facts.push({...raw,id:`fact_${facts.length+1}`});
   fallbackCount++;
  }
 }
 if(facts.length>=200)warnings.push('Reached 200 facts: review source document for additional claims.');
 if(fallbackCount)warnings.push(`${fallbackCount} text fragment(s) need manual review; nothing in those fragments was silently discarded.`);
 return {profile:profileSchema.parse(profile),warnings,chunksProcessed:chunks.length,fallbackCount};
}
