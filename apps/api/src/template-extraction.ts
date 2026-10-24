import {defaultTemplate,Template,templateSchema} from './schema';

function clamp(n:number,lo:number,hi:number){return Math.min(hi,Math.max(lo,n));}
function number(value:unknown):number|undefined{const n=Number(value);return Number.isFinite(n)?n:undefined;}
function color(value:unknown):string|undefined{
 if(typeof value==='number'&&Number.isFinite(value)){
  return '#'+(Math.round(value)>>>0&0xffffff).toString(16).padStart(6,'0');
 }
 if(Array.isArray(value)&&value.length>=3){
  const parts=value.slice(0,3).map(number);
  if(parts.some(v=>v===undefined))return;
  return '#'+parts.map(n=>Math.round(clamp(n!,0,1)*255).toString(16).padStart(2,'0')).join('');
 }
 if(typeof value==='string'&&/^#[0-9a-fA-F]{6}$/.test(value))return value;
 return undefined;
}
function chroma(hex:string){
 const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
 return (Math.max(...rgb)-Math.min(...rgb))/255;
}
function isAccent(hex:string){
 const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
 return chroma(hex)>.12&&Math.min(...rgb)<195&&Math.max(...rgb)>45;
}
function isLight(hex:string){
 const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
 return rgb.reduce((a,b)=>a+b,0)/3>145;
}
function mostCommon<T>(items:T[]):T|undefined{
 const counts=new Map<T,number>();
 for(const item of items)counts.set(item,(counts.get(item)||0)+1);
 return [...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0];
}
function fontChoice(names:string[],sample:string):Template['font']{
 const font=mostCommon(names)||'';
 if(/thai/i.test(font)||/[ก-๙]/.test(sample))return 'Noto Sans Thai';
 if(/georgia|times|serif|garamond|cambria/i.test(font))return 'Georgia';
 return 'Arial';
}
function roundedSize(values:number[],defaultSize:number,lo:number,hi:number){
 return clamp(Math.round((mostCommon(values)||defaultSize)*2)/2,lo,hi);
}

export function templateFromLayout(input:unknown):{
 config:Template;warnings:string[];metrics:Record<string,unknown>;
}{
 const layout=(input&&typeof input==='object'?input:{}) as any;
 const warnings:string[]=[];
 const config:Template={...defaultTemplate,name:'Imported Resume',background:'#ffffff',accent:'#24527a'};
 const pages=Array.isArray(layout.pages)?layout.pages:[];
 const page=pages[0];
 const spans=pages.flatMap((p:any)=>Array.isArray(p.spans)?p.spans:[])
  .filter((s:any)=>typeof s.text==='string'&&s.text.trim());
 const paragraphs=Array.isArray(layout.paragraphs)?layout.paragraphs:[];
 const runs=paragraphs.flatMap((p:any)=>Array.isArray(p.runs)?p.runs:[])
  .filter((r:any)=>typeof r.text==='string'&&r.text.trim());
 const samples=spans.length?spans:runs;
 const rawFontNames=samples.map((s:any)=>String(s.font||'')).filter(Boolean);
 const fontWeights=rawFontNames.flatMap((font:string,i:number)=>
  Array(Math.min(80,String(samples[i]?.text||'').length)).fill(font));
 const textualSample=samples.slice(0,200).map((s:any)=>String(s.text||'')).join(' ');
 config.font=fontChoice(fontWeights,textualSample);
 const sizes=samples.filter((s:any)=>{
  const size=number(s.size);return size!==undefined&&size>=8&&size<=16;
 }).flatMap((s:any)=>Array(Math.min(40,String(s.text).length)).fill(Math.round(Number(s.size)*2)/2));
 config.bodySize=roundedSize(sizes,defaultTemplate.bodySize,9,14);
 const allSizes=samples.map((s:any)=>number(s.size)).filter((s:unknown):s is number=>typeof s==='number');
 config.nameSize=clamp(Math.round(allSizes.length?Math.max(...allSizes):defaultTemplate.nameSize),16,36);

 const textColors=spans.map((s:any)=>color(s.color))
  .concat(runs.map((r:any)=>color(typeof r.color==='string'?r.color?.startsWith('#')?r.color:'#'+r.color:undefined)))
  .filter((v:unknown):v is string=>typeof v==='string'&&isAccent(v));
 if(textColors.length)config.accent=mostCommon(textColors)!;
 if(page&&number(page.width)&&number(page.height)){
  const width=Number(page.width),height=Number(page.height);
  config.paper=Math.abs(width/height-1/Math.sqrt(2))<.035?'A4':'Letter';
  const left=spans.filter((s:any)=>Array.isArray(s.bbox)&&number(s.bbox[0])!==undefined)
   .map((s:any)=>Number(s.bbox[0]));
  if(left.length){
   const min=Math.min(...left);
   config.margin=clamp(Math.round(min*25.4/72),8,25);
  }
  const drawings=Array.isArray(page.drawings)?page.drawings:[];
  const sidebar=drawings.find((d:any)=>{
   if(!Array.isArray(d.rect)||d.rect.length!==4)return false;
   const [x0,y0,x1,y1]=d.rect.map(Number);
   const w=x1-x0,h=y1-y0;
   return x0>=-5&&x0<=width*.15&&w>=width*.23&&w<=width*.48&&h>=height*.45&&!!color(d.fill);
  });
  if(sidebar){
   config.layout='sidebar';
   config.sidebarWidth=clamp(Math.round((Number(sidebar.rect[2])-Number(sidebar.rect[0]))/width*100),25,40);
   const bg=color(sidebar.fill);
   if(bg&&isLight(bg))config.background=bg;
   else warnings.push('Dark sidebar backgrounds are not reproduced; using a light accessible background.');
  }
 }else if(number(layout.width)&&number(layout.height)){
  const w=Number(layout.width),h=Number(layout.height);
  config.paper=Math.abs(w/h-1/Math.sqrt(2))<.035?'A4':'Letter';
  if(number(layout.margin))config.margin=clamp(Math.round(Number(layout.margin)),8,25);
 }else{
  warnings.push('No reliable document geometry was available; using an editable clean layout.');
 }
 if(!spans.length&&!runs.length)warnings.push('Font and accent could not be measured; defaults were used.');
 warnings.push('Original full geometry is retained; photo, logos, custom shapes and exact pixel placement require manual review.');
 return {
  config:templateSchema.parse(config),
  warnings,
  metrics:{
   pages:pages.length||1,
   pageSize:page?{width:page.width,height:page.height}:null,
   spanCount:spans.length,
   paragraphCount:paragraphs.length,
   dominantFonts:[...new Set(rawFontNames)].slice(0,5),
   bodySize:config.bodySize,
   nameSize:config.nameSize,
   accent:config.accent,
   background:config.background,
   margin:config.margin,
   layout:config.layout,
   sidebarWidth:config.sidebarWidth
  }
 };
}
