import {test} from 'node:test';
import assert from 'node:assert/strict';
import {profileSchema,jobSchema,tailoredSchema} from '../src/schema';
import {buildTailorPayload,TAILOR_INSTRUCTION} from '../src/tailor-payload';
import {aiPreflight} from '../src/ai';

const job=jobSchema.parse({
 company:'Lawcluster Co., Ltd.',title:'Full-Stack Developer',location:'Bangkok',
 responsibilities:['Design and integrate REST APIs','Maintain web portal','Develop backend services'],
 required:['Backend APIs','Laravel','React','MySQL','Git','Linux'],
 preferred:[]
});
const legacyDetail='Professional Experience\n'+('Built NestJS APIs and improved PostgreSQL query performance.\n').repeat(31)+
 'Education\nBachelor of Technology\n'+('Built RESTful backend APIs.\n').repeat(15);

test('Tailor does not transmit original PDF fact source or duplicated raw job advertisement',()=>{
 const profile=profileSchema.parse({name:'Example User',email:'',phone:'',location:'',links:[],facts:[
  {id:'fact_1',section:'work',group:'Page 1',heading:'Backend Developer',detail:legacyDetail,
   source:legacyDetail.repeat(2),verified:true},
  {id:'fact_2',section:'skills',group:'',heading:'Git',
   detail:'Used Git and MySQL.',source:'Used Git and MySQL.'.repeat(100),verified:true}
 ]});
 const storedJob={...job,source:'Job listing '.repeat(1000),model:'qwen3.5:4b-q4_K_M',
  digest:'sha256:test',sourceURL:'https://example.com'};
 const result=buildTailorPayload(profile,storedJob,'Professional English resume',2);
 assert.ok(result.data.facts.length>=1);
 assert.equal('source' in result.data.job,false);
 assert.equal('source' in result.data.facts[0],false);
 assert.equal(JSON.stringify(result.data).includes('Job listing Job listing'),false);
 assert.equal(JSON.stringify(result.data).includes('sha256:test'),false);
 assert.ok(aiPreflight(tailoredSchema,TAILOR_INSTRUCTION,result.data).fits);
 assert.ok(result.diagnostics.inputTokens<=result.diagnostics.tokenBudget);
});

test('large confirmed profiles fit by selecting relevant facts without modifying stored source',()=>{
 const facts=Array.from({length:200},(_,i)=>({
  id:'fact_'+i,section:i%2?'work':'projects',group:'Company',heading:'Role',
  detail:'Worked with NestJS, PostgreSQL, backend APIs and TypeScript. '.repeat(10)+i,
  source:'Original source '.repeat(200),verified:true
 }));
 const profile=profileSchema.parse({name:'Example User',email:'',phone:'',location:'',links:[],facts});
 const result=buildTailorPayload(profile,job,'Emphasize backend experience',2);
 assert.ok(result.data.facts.length>0);
 assert.ok(result.data.facts.length<facts.length);
 assert.ok(result.warnings.some(w=>w.includes('Selected')));
 assert.ok(result.data.facts.every(f=>profile.facts.some(saved=>saved.id===f.id)));
 assert.equal(profile.facts.length,200);
 assert.equal(profile.facts[0].source,'Original source '.repeat(200));
 assert.ok(aiPreflight(tailoredSchema,TAILOR_INSTRUCTION,result.data).fits);
});

test('legacy single-page verified source can be excerpted without fabricating new content',()=>{
 const detail=('Front-end Design of PHP applications and Laravel projects.\n'+
 'Backend Developer managed REST APIs and MySQL queries.\n').repeat(85);
 const profile=profileSchema.parse({name:'Example User',email:'',phone:'',location:'',links:[],facts:[
  {id:'legacy-page',section:'summary',group:'Page 2',heading:'Unparsed original text — review required',
   detail,source:detail,verified:true}
 ]});
 const result=buildTailorPayload(profile,job,'English resume',2);
 assert.equal(result.data.facts[0].id,'legacy-page');
 assert.ok(result.data.facts[0].detail.length<detail.length);
 assert.ok(result.data.facts[0].detail.includes('Backend Developer managed REST APIs'));
 assert.ok(result.warnings.some(w=>w.includes('verbatim excerpts')));
 assert.ok(aiPreflight(tailoredSchema,TAILOR_INSTRUCTION,result.data).fits);
});

test('unverified facts are never included in local model prompt',()=>{
 const profile=profileSchema.parse({name:'Example User',email:'',phone:'',location:'',links:[],facts:[
  {id:'verified',section:'work',group:'Example Co',heading:'Backend',detail:'Used NestJS.',source:'Used NestJS.',verified:true},
  {id:'not-verified',section:'skills',group:'',heading:'React',detail:'Used React.',source:'Resume',verified:false}
 ]});
 const result=buildTailorPayload(profile,job,'English',2);
 assert.deepEqual(result.data.facts.map(f=>f.id),['verified']);
 assert.equal(JSON.stringify(result.data).includes('Used React.'),false);
});
