import {test} from 'node:test';
import assert from 'node:assert/strict';
import {templateSummary,importSummary,importDetail} from '../src/state';

test('frequent state omits original resume PDF geometry and previews',()=>{
 const raw={id:'template-1',kind:'template',createdAt:new Date().toISOString(),data:{
  config:{name:'Imported Resume',layout:'single'},
  measurements:{pages:[{spans:Array.from({length:1000},(_,i)=>({text:'test',bbox:[i,i,0,0]}))}]},
  warnings:['layout warning'],sourceAssetId:'asset-1',designMethod:'geometry'
 }};
 const projected=templateSummary(raw);
 assert.equal((projected.data as any).config.name,'Imported Resume');
 assert.equal((projected.data as any).sourceAssetId,'asset-1');
 assert.equal((projected.data as any).measurements,undefined);
 assert.ok(JSON.stringify(projected).length<JSON.stringify(raw).length/5);
});

test('import lists omit heavy extraction and profile details; detail endpoint retains preview',()=>{
 const raw={id:'import-1',kind:'import',createdAt:new Date().toISOString(),data:{
  profile:{name:'Example User',email:'secret@example.test',facts:[{id:'f1',detail:'Built APIs',source:'Built APIs'}]},
  templateId:'template-1',assetId:'asset-1',diagnostics:{contentChunks:2,fallbackChunks:1},
  warnings:['manual review'],extraction:{
   text:'Original selectable PDF content',textPages:['do not expose page collection'],
   previews:['image-as-base64'],warnings:['OCR uncertain'],
   layout:{pages:[{spans:[{text:'should never be returned'}]}]}
  }
 }};
 const summary=importSummary(raw);
 assert.deepEqual((summary.data as any).profile,{name:'Example User'});
 assert.equal((summary.data as any).extraction,undefined);
 assert.equal((summary.data as any).profile.email,undefined);
 const detail=importDetail(raw);
 assert.equal((detail.data as any).profile.name,'Example User');
 assert.equal((detail.data as any).extraction.text,'Original selectable PDF content');
 assert.deepEqual((detail.data as any).extraction.previews,['image-as-base64']);
 assert.equal((detail.data as any).extraction.layout,undefined);
 assert.equal((detail.data as any).extraction.textPages,undefined);
 assert.equal(JSON.stringify(summary).includes('secret@example.test'),false);
});
