import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {Store} from '../src/service';
import {defaultTemplate} from '../src/schema';
class MemoryStore extends Store{
 records=new Map<string,any>();
 async put(kind:string,data:any):Promise<any>{const r={id:randomUUID(),kind,data:structuredClone(data),createdAt:new Date()};this.records.set(r.id,r);return r;}
 async get(id:string,kind?:string):Promise<any>{const r=this.records.get(id);if(!r||kind&&r.kind!==kind)throw Error('Not found');return structuredClone(r);}
 async enqueue(type:string,input:any):Promise<any>{return {type,input};}
}
test('local AI workflow retains snapshots, versions and evidence refs',async()=>{
 const server=createServer(async(req,res)=>{let body='';for await(const c of req)body+=c;if(req.url==='/api/tags'){res.end(JSON.stringify({models:[{name:'test',digest:'sha256:test'}]}));return;}
 if(req.url?.startsWith('/jobs')){res.end(JSON.stringify({id:'watch-1',title:'Full Stack Developer',company:'Test Co',description:'Build Node.js APIs and React',technologies:['Node.js','React'],url:'https://example.com/job'}));return;}
 const data=JSON.parse(body);const incoming=JSON.parse(data.messages[1].content);let value:any;
 if(incoming.facts)value={targetRole:'Full Stack Developer',summary:{text:'Built Node.js APIs',sourceFactIds:['f1']},items:[{sourceFactId:'f1',text:'Built Node.js APIs'}],notes:['React experience missing']};
 else value={company:'Test Co',title:'Full Stack Developer',location:'Remote',responsibilities:['Build apps'],required:['Node.js','React'],preferred:[]};
 res.end(JSON.stringify({message:{content:JSON.stringify(value)}}));
 });await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=(server.address() as any).port;process.env.OLLAMA_BASE_URL=`http://127.0.0.1:${port}`;process.env.OLLAMA_MODEL='test';process.env.JOB_WATCHER_BASE_URL=`http://127.0.0.1:${port}`;
 const store=new MemoryStore();
 try{
  const p=await store.confirmProfile({confirmed:true,profile:{name:'Test User',email:'',phone:'',location:'',links:[],facts:[{id:'f1',section:'work',group:'Old Co',heading:'Backend Engineer',detail:'Built Node.js APIs',source:'CV',verified:true}]}});
  const template=await store.template({config:defaultTemplate});
  const j=await store.execute('analyze',{text:'Need Node.js and React'});
  const input={profileId:p.id,jobId:j.jobId,templateId:template.id,prompt:'English',maxPages:2};
  const first=await store.execute('tailor',input);const r=await store.get(first.resumeId);
  assert.equal(r.data.digest,'sha256:test');assert.deepEqual(r.data.matching.missing,['React']);assert.equal(r.data.profile.facts[0].heading,'Backend Engineer');
  const revision=await store.revise(first.resumeId,{prompt:'Shorten'});const next=await store.execute(revision.type,revision.input);assert.notEqual(first.resumeId,next.resumeId);assert.equal((await store.get(next.resumeId)).data.parentId,first.resumeId);
  await store.confirmProfile({confirmed:true,parentId:p.id,profile:{...p.data.profile,name:'Changed Name'}});
  assert.equal((await store.get(first.resumeId)).data.profile.name,'Test User');
  const approval=await store.approve(first.resumeId,{reviewedAllClaims:true});assert.equal(approval.data.resumeId,first.resumeId);
  const application=await store.application({resumeId:first.resumeId,status:'prepared',notes:'Ready to review'});assert.equal(application.data.company,'Test Co');
  const watcherResult=await store.execute('watcher-tailor',{externalId:'watch-1',profileId:p.id,templateId:template.id,prompt:'Tailor',maxPages:2});
  const watched=await store.get(watcherResult.resumeId);assert.equal(watched.data.job.origin,'job-watcher');assert.equal(watched.data.job.externalId,'watch-1');
  const locked=await store.template({config:{...defaultTemplate,locked:true}});
  await assert.rejects(store.template({parentId:locked.id,config:defaultTemplate}),/Unlock/);
  const unlocked=await store.template({parentId:locked.id,config:defaultTemplate,unlock:true});assert.ok(unlocked.id);
 }finally{await store.db.$disconnect();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
