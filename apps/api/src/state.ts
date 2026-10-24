// Never expose raw PDF geometry, original file previews or full import text
// through the frequently refreshed workspace state endpoint.
// Immutable source records remain in PostgreSQL and are not modified.
type Row = {id:string;kind:string;data:unknown;createdAt:Date|string};
const obj=(value:unknown):Record<string,any> =>
 value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};

export function templateSummary<T extends Row>(record:T):T{
 const d=obj(record.data);
 return {...record,data:{
  config:d.config,
  sourceAssetId:d.sourceAssetId??null,
  designMethod:d.designMethod??null,
  warningCount:Array.isArray(d.warnings)?d.warnings.length:0
 }} as T;
}

export function importSummary<T extends Row>(record:T):T{
 const d=obj(record.data);
 const warnings=Array.isArray(d.warnings)?d.warnings:[];
 return {...record,data:{
  // Only the display name belongs in the list; details load when selected.
  profile:{name:obj(d.profile).name||'Unnamed import'},
  templateId:d.templateId??null,
  assetId:d.assetId??null,
  warnings:warnings.slice(0,30),
  warningCount:warnings.length,
  diagnostics:d.diagnostics||{}
 }} as T;
}

export function importDetail<T extends Row>(record:T):T{
 const d=obj(record.data);
 const extraction=obj(d.extraction);
 return {...record,data:{
  profile:d.profile,
  templateId:d.templateId??null,
  assetId:d.assetId??null,
  warnings:Array.isArray(d.warnings)?d.warnings:[],
  diagnostics:d.diagnostics||{},
  extraction:{
   text:typeof extraction.text==='string'?extraction.text:'',
   previews:Array.isArray(extraction.previews)?extraction.previews.slice(0,2):[],
   warnings:Array.isArray(extraction.warnings)?extraction.warnings:[]
  }
 }} as T;
}
