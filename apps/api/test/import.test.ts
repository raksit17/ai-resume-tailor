import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {splitResume,importResumeFacts,fallbackFacts,MAX_CHUNK_BYTES} from '../src/document-import';
import {templateFromLayout} from '../src/template-extraction';
import {ai} from '../src/ai';
import {jobSchema} from '../src/schema';

test('splitting a large unicode CV preserves every byte and page boundary',()=>{
 const first='NestJS · งานระบบหลังบ้าน\n'.repeat(350);
 const second='React · Frontend\n'.repeat(150);
 const chunks=splitResume('',[first,second]);
 assert.ok(chunks.length>2);
 assert.equal(chunks.filter(c=>c.page===1).map(c=>c.text).join(''),first);
 assert.equal(chunks.filter(c=>c.page===2).map(c=>c.text).join(''),second);
 assert.ok(chunks.every(c=>Buffer.byteLength(c.text,'utf8')<=MAX_CHUNK_BYTES));
});

test('PDF measurements reconstruct a template without invoking AI',()=>{
 const layout={pages:[{width:595,height:842,
  spans:[
   {text:'EXAMPLE PERSON',font:'Times-Roman',size:23,color:0x224488,bbox:[35,40,280,65]},
   {text:'Backend Engineer with NestJS',font:'Times-Roman',size:11,color:0,bbox:[35,100,400,114]},
   {text:'Experience with APIs',font:'Times-Roman',size:11,color:0,bbox:[35,120,250,134]}
  ],
  drawings:[{rect:[0,0,185,842],fill:[0.92,0.95,0.98]}]
 }]};
 const {config,metrics}=templateFromLayout(layout);
 assert.equal(config.paper,'A4');
 assert.equal(config.layout,'sidebar');
 assert.equal(config.font,'Georgia');
 assert.equal(config.bodySize,11);
 assert.equal(config.nameSize,23);
 assert.equal(config.accent,'#224488');
 assert.equal(config.background,'#ebf2fa');
 assert.equal(metrics.spanCount,3);
});

test('a failed model call retains unverified resume text for review',async()=>{
 const server=createServer((_req,res)=>{res.writeHead(400);res.end('model unavailable');});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const old=process.env.OLLAMA_BASE_URL;
 process.env.OLLAMA_BASE_URL=`http://127.0.0.1:${(server.address() as any).port}`;
 try{
  const text='Worked with Node.js and PostgreSQL in the original CV.';
  const result=await importResumeFacts(text);
  assert.equal(result.fallbackCount,1);
  assert.equal(result.profile.facts.length,1);
  assert.equal(result.profile.facts[0].verified,false);
  assert.equal(result.profile.facts[0].source,text);
  assert.ok(result.warnings.some(w=>w.includes('manual review')));
 }finally{
  if(old===undefined)delete process.env.OLLAMA_BASE_URL;else process.env.OLLAMA_BASE_URL=old;
  await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
 }
});

test('valid quoted claims are accepted and unsupported claims are rejected',async()=>{
 const server=createServer(async(req,res)=>{
  if(req.url==='/api/tags'){res.end(JSON.stringify({models:[]}));return;}
  const value={name:'Example Person',email:'',phone:'',location:'',links:[],facts:[
   {id:'tmp1',section:'work',group:'Example Co',heading:'Developer',detail:'Built REST APIs',source:'Built REST APIs',verified:false},
   {id:'tmp2',section:'skills',group:'',heading:'Kubernetes',detail:'Used Kubernetes',source:'Kubernetes',verified:false}
  ]};
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify({message:{content:JSON.stringify(value)},prompt_eval_count:200,eval_count:90}));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const old=process.env.OLLAMA_BASE_URL;
 process.env.OLLAMA_BASE_URL=`http://127.0.0.1:${(server.address() as any).port}`;
 try{
  const result=await importResumeFacts('Example Person\nBuilt REST APIs');
  assert.equal(result.profile.name,'Example Person');
  assert.equal(result.profile.facts.length,1);
  assert.equal(result.profile.facts[0].detail,'Built REST APIs');
  assert.equal(result.fallbackCount,0);
  assert.ok(result.warnings.some(w=>w.includes('discarded claim')));
 }finally{
  if(old===undefined)delete process.env.OLLAMA_BASE_URL;else process.env.OLLAMA_BASE_URL=old;
  await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
 }
});

test('oversized AI requests are rejected before network I/O',async()=>{
 await assert.rejects(
  ai(jobSchema,'Extract job requirements',{source:'x'.repeat(200000)},[],'oversize-test'),
  /input is too large/
 );
});

test('fallback splits a failed PDF-page extraction into granular unverified source lines',()=>{
 const lines=[
  'Profile',
  'Backend Engineer with NestJS experience.',
  'Professional Experience',
  'Built 12 backend API endpoints.',
  'Implemented database caching.',
  'Education',
  'Bachelor of Technology'
 ];
 const facts=fallbackFacts({page:2,part:1,text:lines.join('\n')});
 assert.equal(facts.length,4);
 assert.deepEqual(facts.map(f=>f.section),['summary','work','work','education']);
 assert.ok(facts.every(f=>f.verified===false&&f.source===f.detail));
 assert.ok(facts.every(f=>f.group==='Page 2'));
});
