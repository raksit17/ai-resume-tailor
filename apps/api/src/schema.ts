import {z} from 'zod';
const text=z.string().max(10000);
export const factSchema=z.object({id:z.string().min(1),section:z.enum(['summary','skills','work','projects','education','certificates','languages']),group:text,heading:text,detail:text,source:text,verified:z.boolean()});
export const profileSchema=z.object({name:text,email:text,phone:text,location:text,links:z.array(text).max(10),facts:z.array(factSchema).max(200)});
export const templateSchema=z.object({name:z.string().min(1).max(100),layout:z.enum(['single','sidebar']),paper:z.enum(['A4','Letter']),accent:z.string().regex(/^#[0-9a-fA-F]{6}$/),background:z.string().regex(/^#[0-9a-fA-F]{6}$/),font:z.enum(['Arial','Georgia','Noto Sans Thai']),bodySize:z.number().min(9).max(14),nameSize:z.number().min(16).max(36),margin:z.number().min(8).max(25),sidebarWidth:z.number().min(25).max(40),gap:z.number().min(2).max(12),sections:z.array(factSchema.shape.section).min(1).max(7),locked:z.boolean()}).refine(v=>new Set(v.sections).size===v.sections.length,'Duplicate sections');
export const jobSchema=z.object({company:text,title:text,responsibilities:z.array(text).max(30),required:z.array(text).max(40),preferred:z.array(text).max(40),location:text});
export const tailoredSchema=z.object({targetRole:text,summary:z.object({text,sourceFactIds:z.array(z.string()).min(1)}),items:z.array(z.object({sourceFactId:z.string(),text})).min(1).max(150),notes:z.array(text).max(30)});
export type Profile=z.infer<typeof profileSchema>;
export type Template=z.infer<typeof templateSchema>;
export type Tailored=z.infer<typeof tailoredSchema>;
export const defaultTemplate:Template={name:'Clean ATS',layout:'single',paper:'A4',accent:'#0f766e',background:'#f0fdfa',font:'Arial',bodySize:10.5,nameSize:26,margin:14,sidebarWidth:32,gap:5,sections:['summary','skills','work','projects','education','certificates','languages'],locked:false};
export function truthGuard(profile:Profile,tailored:Tailored){
 const facts=new Map(profile.facts.filter(f=>f.verified).map(f=>[f.id,f]));
 const refs=[...tailored.summary.sourceFactIds,...tailored.items.map(i=>i.sourceFactId)];
 for(const id of refs) if(!facts.has(id)) throw new Error(`Unverified or unknown evidence: ${id}`);
 if(new Set(tailored.items.map(i=>i.sourceFactId)).size!==tailored.items.length)throw new Error('Duplicate fact reference');
 const warnings:string[]=[];
 const check=(out:string,source:string)=>{
  const sourceNumbers=new Set(source.match(/\d+(?:[.,]\d+)*%?/g)||[]);
  for(const n of out.match(/\d+(?:[.,]\d+)*%?/g)||[])if(!sourceNumbers.has(n))throw new Error(`Unsupported number: ${n}`);
  if(out.trim()!==source.trim())warnings.push('Rewritten claim requires human semantic review');
 };
 for(const item of tailored.items)check(item.text,facts.get(item.sourceFactId)!.detail);
 check(tailored.summary.text,tailored.summary.sourceFactIds.map(id=>facts.get(id)!.detail).join(' '));
 return [...new Set(warnings)];
}
export function matchSkills(profile:Profile,job:z.infer<typeof jobSchema>){
 const corpus=profile.facts.filter(f=>f.verified).map(f=>`${f.heading} ${f.detail}`).join(' ').toLowerCase();
 const matches=(s:string)=>{const needle=s.toLowerCase().trim();const escaped=needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`,'i').test(corpus)};
 return {matched:job.required.filter(matches),missing:job.required.filter(s=>!matches(s)),method:'Exact phrase evidence lookup; not an ATS score'};
}
