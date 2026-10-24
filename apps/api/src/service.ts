import {Injectable,OnModuleInit,OnModuleDestroy,NotFoundException,BadRequestException} from '@nestjs/common';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import * as cheerio from 'cheerio';
import {ai} from './ai';
import {importResumeFacts} from './document-import';
import {templateFromLayout} from './template-extraction';
import {reconcileTailoredDraft} from './tailor-reconcile';
import {defaultTemplate,profileSchema,factSchema,templateSchema,jobSchema,tailoredSchema,truthGuard,matchSkills} from './schema';
import {renderHTML,renderPDF,renderDOCX} from './render';
import {publicGet} from './net';
const uid=z.string().uuid();
const storeRoot=path.resolve(process.env.STORAGE_DIR||'../../storage');
const documentURL=(process.env.DOCUMENT_URL||'http://localhost:8002').replace(/\/$/,'');
@Injectable()
export class Store implements OnModuleInit,OnModuleDestroy{
 db=new PrismaClient();timer?:NodeJS.Timeout;working=false;stopping=false;
 async onModuleInit(){await mkdir(storeRoot,{recursive:true});await this.db.$connect();
  // One API/worker instance per database. Interrupted work is explicitly failed, never silently duplicated.
  await this.db.task.updateMany({where:{status:'running'},data:{status:'failed',error:'Process restarted during task; retry from the UI.'}});
  if(!(await this.list('template')).length)await this.put('template',{config:defaultTemplate});
  this.timer=setInterval(()=>void this.tick().catch(console.error),1000);
 }
 async onModuleDestroy(){this.stopping=true;if(this.timer)clearInterval(this.timer);await this.db.$disconnect();}
 async put(kind:string,data:unknown){return this.db.record.create({data:{kind,data:JSON.parse(JSON.stringify(data))}})}
 async get(id:string,kind?:string){uid.parse(id);const r=await this.db.record.findUnique({where:{id}});if(!r||kind&&r.kind!==kind)throw new NotFoundException('Record not found');return {...r,data:r.data as any};}
 async list(kind:string){return this.db.record.findMany({where:{kind},orderBy:{createdAt:'desc'},take:200});}
 async enqueue(type:string,input:unknown){if(await this.db.task.count({where:{status:{in:['queued','running']}}})>=20)throw new BadRequestException('Queue is full');return this.db.task.create({data:{type,input:JSON.parse(JSON.stringify(input))}})}
 async task(id:string){uid.parse(id);const task=await this.db.task.findUnique({where:{id}});if(!task)throw new NotFoundException();return task;}
 async retry(id:string){const t=await this.task(id);if(t.status!=='failed')throw new BadRequestException('Only failed tasks can be retried');return this.enqueue(t.type,t.input);}
 async tick(){if(this.working||this.stopping)return;this.working=true;try{
  const task=await this.db.task.findFirst({where:{status:'queued'},orderBy:{createdAt:'asc'}});if(!task)return;
  const claim=await this.db.task.updateMany({where:{id:task.id,status:'queued'},data:{status:'running'}});if(!claim.count)return;
  try{const output=await this.execute(task.type,task.input as any);await this.db.task.update({where:{id:task.id},data:{status:'succeeded',output:JSON.parse(JSON.stringify(output))}})}catch(e){await this.db.task.update({where:{id:task.id},data:{status:'failed',error:String((e as Error).message).slice(0,2000)}})}
 }finally{this.working=false;}}
 async upload(file:Express.Multer.File){
  if(!file)throw new BadRequestException('File required');
  const ext=path.extname(file.originalname).toLowerCase();if(!['.pdf','.docx','.png','.jpg','.jpeg'].includes(ext))throw new BadRequestException('PDF, DOCX, PNG, JPG only');
  const id=randomUUID();await writeFile(path.join(storeRoot,id+ext),file.buffer);
  return this.put('asset',{file:id+ext,originalName:path.basename(file.originalname),mime:ext==='.pdf'?'application/pdf':ext==='.docx'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':ext==='.png'?'image/png':'image/jpeg'});
 }
 async bytes(id:string){const r=await this.get(id,'asset');return {buffer:await readFile(path.join(storeRoot,r.data.file)),name:r.data.originalName,mime:r.data.mime};}
 async parseAsset(id:string){const f=await this.bytes(id);const form=new FormData();form.append('file',new Blob([new Uint8Array(f.buffer)],{type:f.mime}),f.name);
  const res=await fetch(`${documentURL}/extract`,{method:'POST',body:form,signal:AbortSignal.timeout(180000)});if(!res.ok)throw new Error(`Document extraction: ${await res.text()}`);return res.json() as Promise<any>;
 }
 async template(body:unknown){const b=z.object({config:templateSchema,parentId:uid.optional(),unlock:z.boolean().optional()}).parse(body);
  if(b.parentId){const parent=await this.get(b.parentId,'template');if(parent.data.config.locked&&!b.unlock)throw new BadRequestException('Unlock the template explicitly before saving a new version');}
  return this.put('template',b);
 }
 async confirmProfile(body:unknown){const b=z.object({profile:profileSchema,confirmed:z.literal(true),parentId:uid.optional(),importId:uid.optional()}).parse(body);
  if(b.parentId)await this.get(b.parentId,'profile');if(b.importId)await this.get(b.importId,'import');
  const ids=b.profile.facts.map(f=>f.id);if(new Set(ids).size!==ids.length)throw new BadRequestException('Fact IDs must be unique');
  return this.put('profile',{...b,confirmedAt:new Date().toISOString()});
 }
 async queueImport(body:unknown){const b=z.object({assetId:uid}).parse(body);await this.get(b.assetId,'asset');return this.enqueue('import',b);}
 async queueJob(body:unknown){const b=z.object({text:z.string().max(40000).default(''),url:z.string().url().optional(),assetId:uid.optional()}).parse(body);if(!b.text.trim()&&!b.url&&!b.assetId)throw new BadRequestException('Provide a job ad');if(b.assetId)await this.get(b.assetId,'asset');return this.enqueue('analyze',b);}
 async queueTailor(body:unknown){const b=z.object({profileId:uid,jobId:uid,templateId:uid,prompt:z.string().max(4000).default('Write a professional English resume'),maxPages:z.number().int().min(1).max(5).default(2)}).parse(body);
  await this.get(b.profileId,'profile');await this.get(b.jobId,'job');await this.get(b.templateId,'template');return this.enqueue('tailor',b);
 }
 async revise(id:string,body:unknown){const b=z.object({prompt:z.string().min(1).max(4000),templateId:uid.optional()}).parse(body);const old=await this.get(id,'resume');if(b.templateId)await this.get(b.templateId,'template');return this.enqueue('tailor',{...old.data.request,prompt:b.prompt,templateId:b.templateId||old.data.request.templateId,parentId:id,previous:old.data.tailored});}
 async approve(id:string,body:unknown){z.object({reviewedAllClaims:z.literal(true)}).parse(body);const r=await this.get(id,'resume');truthGuard(r.data.profile,r.data.tailored);return this.put('approval',{resumeId:id,reviewedAt:new Date().toISOString()});}
 async export(id:string,body:unknown){const b=z.object({format:z.enum(['pdf','docx'])}).parse(body);await this.get(id,'resume');const approvals=await this.db.record.findFirst({where:{kind:'approval',data:{path:['resumeId'],equals:id}}});if(!approvals)throw new BadRequestException('Review and approve this exact resume revision before export');return this.enqueue('export',{resumeId:id,...b});}
 async preview(id:string){const r=await this.get(id,'resume');return {html:renderHTML(r.data.profile,r.data.tailored,r.data.template.config)};}
 async watcherList(query:Record<string,string>){const q=z.object({search:z.string().max(100).default(''),page:z.coerce.number().int().min(1).default(1)}).parse(query);return this.watcher(`/jobs?hours=720&limit=25&page=${q.page}&search=${encodeURIComponent(q.search)}`);}
 async watcher(route:string){const base=process.env.JOB_WATCHER_BASE_URL;if(!base)throw new BadRequestException('Set JOB_WATCHER_BASE_URL in .env');const res=await fetch(base.replace(/\/$/,'')+route,{headers:process.env.JOB_WATCHER_TOKEN?{Authorization:`Bearer ${process.env.JOB_WATCHER_TOKEN}`}:{},signal:AbortSignal.timeout(20000)});if(!res.ok)throw new Error(`Job-Watcher HTTP ${res.status}`);return res.json() as Promise<any>;}
 async watcherImport(body:unknown){const b=z.object({externalId:z.string().min(1).max(200)}).parse(body);const job=await this.watcher('/jobs/'+encodeURIComponent(b.externalId));
  // Never fabricate missing description from the job title or technologies list.
  if(!job.description?.trim())throw new BadRequestException('Job-Watcher has no description. Open the original ad and paste its text.');
  return this.enqueue('analyze',{text:JSON.stringify({title:job.title,company:job.company,location:job.location,description:job.description,technologies:job.technologies}),externalId:b.externalId,url:job.url,skipURLFetch:true,source:'job-watcher'});
 }
 async watcherTailor(body:unknown){const b=z.object({externalId:z.string().min(1).max(200),profileId:uid,templateId:uid,prompt:z.string().max(4000),maxPages:z.number().int().min(1).max(5)}).parse(body);await this.get(b.profileId,'profile');await this.get(b.templateId,'template');return this.enqueue('watcher-tailor',b);}
 async github(body:unknown){const b=z.object({repository:z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)}).parse(body);return this.enqueue('github',b);}
 async application(body:unknown){const b=z.object({resumeId:uid,status:z.enum(['prepared','applied','interview','offer','rejected']),notes:z.string().max(4000),previousId:uid.optional()}).parse(body);const r=await this.get(b.resumeId,'resume');if(b.previousId)await this.get(b.previousId,'application');return this.put('application',{...b,jobId:r.data.request.jobId,company:r.data.job.company,title:r.data.job.title,recordedAt:new Date().toISOString()});}
 async execute(type:string,input:any):Promise<any>{
  if(type==='watcher-tailor'){
   const job=await this.watcher('/jobs/'+encodeURIComponent(input.externalId));if(!job.description?.trim())throw new Error('Job-Watcher has no description. Paste the original ad.');
   const result=await this.execute('analyze',{text:JSON.stringify(job),externalId:input.externalId,url:job.url,skipURLFetch:true,source:'job-watcher'});
   return this.execute('tailor',{...input,jobId:result.jobId});
  }
  if(type==='import'){
   const extracted=await this.parseAsset(input.assetId);
   if(!extracted.text?.trim())throw new Error('No readable text. Check OCR language or supply a clearer file.');
   // Read each document fragment in its own bounded AI call. A failure on one
   // fragment retains its original words as an unverified manual-review fact.
   const content=await importResumeFacts(extracted.text,extracted.textPages);
   // Layout reconstruction is deterministic by default: no full geometry or
   // page screenshot is ever sent to Ollama.
   const baseline=templateFromLayout(extracted.layout);
   let design=baseline.config;
   let designMethod='geometry';
   const warnings=[...(extracted.warnings||[]),...content.warnings,...baseline.warnings];
   if(process.env.TEMPLATE_AI_REFINEMENT==='true'){
    try{
     const refinement=await ai(templateSchema,
      'Adjust ONLY the editable template fields using these compact measured metrics; locked=false. Do not generate CSS or HTML.',
      {measurements:baseline.metrics,baseline:design},[],'template-refinement');
     design=templateSchema.parse({...refinement.value,locked:false});
     designMethod='ai-assisted';
    }catch(e){
     warnings.push(`Template AI refinement failed: ${(e as Error).message.slice(0,200)}. Geometry-based template was retained.`);
    }
   }
   const t=await this.put('template',{config:design,sourceAssetId:input.assetId,measurements:extracted.layout,warnings,designMethod});
   const imported=await this.put('import',{
    profile:content.profile,templateId:t.id,assetId:input.assetId,extraction:extracted,
    warnings,diagnostics:{contentChunks:content.chunksProcessed,fallbackChunks:content.fallbackCount,designMethod},
    promptVersion:'chunked-import-v2'
   });
   return {importId:imported.id,templateId:t.id,warnings: warnings.length};
  }
  if(type==='analyze'){
   let source=input.text||'';let images:string[]=[];
   if(input.url&&!input.skipURLFetch){const res=await publicGet(input.url);const $=cheerio.load(res.body);$('script,style,nav,footer').remove();source+='\n'+$('body').text().replace(/\s+/g,' ').slice(0,35000);}
   if(input.assetId){const parsed=await this.parseAsset(input.assetId);source+='\n'+parsed.text;images=parsed.previews?.slice(0,2)||[];}
   const out=await ai(jobSchema,'Extract explicit job requirements. Distinguish required/preferred. Do not infer missing requirements.',{source:source.slice(0,35000)},images);
   const job=await this.put('job',{...out.value,source,sourceURL:input.url||null,externalId:input.externalId||null,origin:input.source||'manual',model:out.model,digest:out.digest});return {jobId:job.id};
  }
  if(type==='tailor'){
   const p=await this.get(input.profileId,'profile');const j=await this.get(input.jobId,'job');const t=await this.get(input.templateId,'template');
   const profile=profileSchema.parse(p.data.profile);const verified=profile.facts.filter(f=>f.verified);if(!verified.length)throw new Error('Confirm at least one fact first');
   const out=await ai(tailoredSchema,'Select and rewrite ONLY verified facts to suit this job. Use every sourceFactId at most once in items; combine related claims for the same fact into one newline-separated item. Summary must cite supporting fact IDs. Keep scope, seniority, dates, numbers and meaning unchanged. You may omit/reorder facts, not add technologies from the JD. targetRole is a desired role, never rewrite historical job titles. Include gaps in notes. User editing instructions apply only when consistent with facts.',{facts:verified,job:j.data,prompt:input.prompt,maxPages:input.maxPages,previous:input.previous||null});
   const {tailored,warnings}=reconcileTailoredDraft(profile,out.value);const matching=matchSkills(profile,jobSchema.parse(j.data));
   const resume=await this.put('resume',{request:{profileId:input.profileId,jobId:input.jobId,templateId:input.templateId,prompt:input.prompt,maxPages:input.maxPages},parentId:input.parentId||null,profile,job:j.data,template:t.data,tailored,warnings,matching,model:out.model,digest:out.digest,promptVersion:'tailor-v2-citation-consolidation',generatedAt:new Date().toISOString()});return {resumeId:resume.id};
  }
  if(type==='export'){
   const r=await this.get(input.resumeId,'resume');const data=r.data;truthGuard(data.profile,data.tailored);
   const buffer=input.format==='pdf'?await renderPDF(renderHTML(data.profile,data.tailored,data.template.config)):await renderDOCX(data.profile,data.tailored,data.template.config);
   if(input.format==='pdf'){const form=new FormData();form.append('file',new Blob([new Uint8Array(buffer)],{type:'application/pdf'}),'resume.pdf');const res=await fetch(`${documentURL}/inspect`,{method:'POST',body:form,signal:AbortSignal.timeout(30000)});if(!res.ok)throw new Error('Could not validate PDF');const check=await res.json() as any;if(check.pages>data.request.maxPages)throw new Error(`PDF is ${check.pages} pages; requested maximum ${data.request.maxPages}. Shorten content or adjust the template.`);if(!check.text.trim())throw new Error('Generated PDF has no selectable text');}
   const file=randomUUID()+'.'+input.format;await writeFile(path.join(storeRoot,file),buffer);
   const safe=(s:string)=>s.replace(/[^\p{L}\p{N}_-]/gu,'_').slice(0,60);
   const asset=await this.put('asset',{file,originalName:`${safe(data.profile.name)}_${safe(data.job.company)}_${safe(data.job.title)}.${input.format}`,mime:input.format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',resumeId:r.id});return {assetId:asset.id,format:input.format};
  }
  if(type==='github'){
   const headers:Record<string,string>={Accept:'application/vnd.github+json'};if(process.env.GITHUB_TOKEN)headers.Authorization=`Bearer ${process.env.GITHUB_TOKEN}`;
   const repo=JSON.parse((await publicGet(`https://api.github.com/repos/${input.repository}`,headers)).body);
   const commit=JSON.parse((await publicGet(`https://api.github.com/repos/${input.repository}/commits/${encodeURIComponent(repo.default_branch)}`,headers)).body);
   const readme=JSON.parse((await publicGet(`https://api.github.com/repos/${input.repository}/readme?ref=${commit.sha}`,headers)).body);
   const readmeText=Buffer.from(readme.content||'','base64').toString('utf8').slice(0,30000);
   const extracted=await ai(z.object({facts:z.array(factSchema).max(20)}),'Extract project capabilities explicitly described in this README as UNCONFIRMED candidate facts. Never assert the user authored code, worked for this repository, or achieved measured results. section=projects. source must be an exact quote. verified=false.',{repository:input.repository,readme:readmeText});
   const candidateFacts=extracted.value.facts.map((f:any)=>({...f,id:randomUUID(),section:'projects',verified:false,source:`${repo.html_url} @ ${commit.sha}: ${f.source}`}));
   const record=await this.put('evidence',{candidateFacts,model:extracted.model,digest:extracted.digest,repository:input.repository,commit:commit.sha,url:repo.html_url,description:repo.description,readme:readmeText,verified:false,warning:'Repository contents do not prove authorship or professional use. Confirm your contribution before adding facts.'});return {evidenceId:record.id};
  }
  if(type==='compare'){
   const r=await this.get(input.resumeId,'resume');const source=r.data.template.sourceAssetId;if(!source)throw new Error('Template has no original document');
   const original=await this.bytes(source);const pdf=await renderPDF(renderHTML(r.data.profile,r.data.tailored,r.data.template.config));const form=new FormData();form.append('original',new Blob([new Uint8Array(original.buffer)]),original.name);form.append('generated',new Blob([new Uint8Array(pdf)]),'resume.pdf');
   const res=await fetch(`${documentURL}/compare`,{method:'POST',body:form,signal:AbortSignal.timeout(30000)});if(!res.ok)throw new Error(await res.text());return res.json();
  }
  throw new Error('Unknown task type');
 }
}
