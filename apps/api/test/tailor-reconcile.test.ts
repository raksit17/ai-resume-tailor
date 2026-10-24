import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reconcileTailoredDraft} from '../src/tailor-reconcile';
import {profileSchema,tailoredSchema,truthGuard,defaultTemplate} from '../src/schema';
import {renderHTML,renderDOCX} from '../src/render';

const profile=profileSchema.parse({
 name:'Example User',email:'',phone:'',location:'',links:[],
 facts:[
  {id:'verified-1',section:'work',group:'Example Co',heading:'Backend Engineer',
   detail:'Built 12 NestJS endpoints and improved latency by 20%.',source:'Resume',verified:true},
  {id:'not-verified',section:'skills',group:'',heading:'React',
   detail:'Worked with React.',source:'Resume',verified:false}
 ]
});

test('consolidates repeated sourceFactId into one item without discarding distinct claims',()=>{
 const draft=tailoredSchema.parse({targetRole:'Full Stack Developer',
  summary:{text:'Built 12 NestJS endpoints.',sourceFactIds:['verified-1','verified-1']},
  items:[
   {sourceFactId:'verified-1',text:'Built 12 NestJS endpoints.'},
   {sourceFactId:'verified-1',text:'Improved latency by 20%.'},
   {sourceFactId:'verified-1',text:'Built 12 NestJS endpoints.'}
  ],notes:[]});
 const result=reconcileTailoredDraft(profile,draft);
 assert.deepEqual(result.tailored.summary.sourceFactIds,['verified-1']);
 assert.equal(result.tailored.items.length,1);
 assert.ok(result.tailored.items[0].text.includes('Built 12 NestJS endpoints.'));
 assert.ok(result.tailored.items[0].text.includes('Improved latency by 20%.'));
 assert.ok(result.warnings.some(w=>w.includes('Consolidated 2 distinct claims')));
 assert.doesNotThrow(()=>truthGuard(profile,result.tailored));
 const html=renderHTML(profile,result.tailored,defaultTemplate);
 assert.ok(html.includes('Built 12 NestJS endpoints.'));
 assert.ok(html.includes('Improved latency by 20%.'));
});

test('unverified fact references cannot be repaired into valid references',()=>{
 const draft=tailoredSchema.parse({targetRole:'Developer',
  summary:{text:'React',sourceFactIds:['not-verified']},
  items:[{sourceFactId:'not-verified',text:'React'}],notes:[]});
 assert.throws(()=>reconcileTailoredDraft(profile,draft),/Unverified/);
});

test('unsupported achievement numbers are still blocked after deduplication',()=>{
 const draft=tailoredSchema.parse({targetRole:'Developer',
  summary:{text:'Built 12 NestJS endpoints.',sourceFactIds:['verified-1']},
  items:[
   {sourceFactId:'verified-1',text:'Built 12 NestJS endpoints.'},
   {sourceFactId:'verified-1',text:'Improved performance by 99%.'}
  ],notes:[]});
 assert.throws(()=>reconcileTailoredDraft(profile,draft),/Unsupported number: 99%/);
});

test('confirmed raw PDF facts get a review warning and remain visible in PDF and DOCX',async()=>{
 const rawProfile=profileSchema.parse({name:'Example',email:'',phone:'',location:'',links:[],facts:[
  {id:'fact_2',section:'summary',group:'Page 2',heading:'Unparsed original text — review required',
   detail:'Education: Example school.\nExperience: Built 4 APIs.',source:'Education: Example school.\nExperience: Built 4 APIs.',verified:true}
 ]});
 const result=reconcileTailoredDraft(rawProfile,tailoredSchema.parse({
  targetRole:'Developer',summary:{text:'Built 4 APIs.',sourceFactIds:['fact_2']},
  items:[{sourceFactId:'fact_2',text:'Education: Example school.'},
   {sourceFactId:'fact_2',text:'Experience: Built 4 APIs.'}],notes:[]
 }));
 assert.equal(result.tailored.items.length,1);
 assert.ok(result.warnings.some(w=>w.includes('unparsed PDF')));
 assert.doesNotThrow(()=>truthGuard(rawProfile,result.tailored));
 const html=renderHTML(rawProfile,result.tailored,defaultTemplate);
 assert.ok(html.includes('Built 4 APIs.'));
 assert.ok(!html.includes('Unparsed original text — review required'));
 assert.ok(!html.includes('Experience: Built 4 APIs.'))
 const docx=await renderDOCX(rawProfile,result.tailored,defaultTemplate);
 assert.ok(docx.length>1000);
});
