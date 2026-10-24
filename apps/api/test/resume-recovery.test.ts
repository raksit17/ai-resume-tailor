import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recoverResumeFromText} from '../src/resume-recovery';
import {profileSchema} from '../src/schema';
import {Store} from '../src/service';

const page1=[
 'Example Engineer',
 'Address: Main Street',
 'Email Address: example@example.test',
 'Profile',
 'Backend Developer with hands-on NestJS experience.',
 'Professional Experience',
 'Backend Developer',
 'Realtech Company Limited',
 '07/2020 – 04/2024',
 'Developed and maintained backend services using NestJS.',
 'Improved performance using Redis caching.',
 'Web Developer Intern',
 'Bangkok Web Solution',
 '04/2019 – 08/2019 Bangkok',
 'Delivered bug fixes using a PHP web framework.'
].join('\n');
const page2=[
 'Education',
 'Information Technology | Bachelor of Technology (B.Tech)',
 'Example University',
 '08/2016 – 05/2020',
 'Studied database management and network security.',
 'Key Skills',
 '– SOFTWARE',
 'NestJS                     PostgreSQL                 Redis',
 'Expert                     Expert                     Proficient',
 'Laravel                    Docker                     Vue.js'
].join('\n');

test('original PDF pages recover work, education and skills, not one unparsed full page',()=>{
 const {profile,warnings}=recoverResumeFromText(page1+'\n'+page2,[page1,page2]);
 assert.equal(profile.name,'Example Engineer');
 assert.equal(profile.email,'example@example.test');
 assert.ok(profile.facts.length>=7);
 assert.ok(profile.facts.some(f=>f.section==='work'&&f.group==='Realtech Company Limited'&&f.heading.includes('07/2020')));
 assert.ok(profile.facts.some(f=>f.section==='work'&&f.group==='Bangkok Web Solution'));
 assert.ok(profile.facts.some(f=>f.section==='education'&&f.group==='Example University'));
 assert.ok(profile.facts.some(f=>f.section==='skills'&&f.detail.startsWith('NestJS')));
 assert.ok(profile.facts.some(f=>f.section==='skills'&&f.detail.startsWith('PostgreSQL')));
 assert.ok(profile.facts.every(f=>!f.verified));
 assert.ok(profile.facts.every(f=>f.source&&f.source.length<300));
 assert.ok(warnings.some(w=>w.includes('unverified')));
});

test('old PDF single page fallback can be restructured and retains literal sources',()=>{
 const text='Profile\nBackend Developer.\nProfessional Experience\nBuilt 20+ API endpoints.\nImproved Redis performance by 20-30%.';
 const result=recoverResumeFromText(text);
 assert.ok(result.profile.facts.some(f=>f.detail.includes('20+ API endpoints')));
 assert.ok(result.profile.facts.every(f=>!f.verified));
 assert.equal(new Set(result.profile.facts.map(f=>f.id)).size,result.profile.facts.length);
 assert.doesNotThrow(()=>profileSchema.parse(result.profile));
});

test('legacy verified page-sized fact cannot be directly tailored',async()=>{
 class MemoryStore extends Store{
  records=new Map<string,any>();
  async get(id:string,kind?:string):Promise<any>{
   const row=this.records.get(id);if(!row||kind&&row.kind!==kind)throw Error('not found');
   return row;
  }
 }
 const store=new MemoryStore();
 const profile=profileSchema.parse({name:'Example Engineer',email:'',phone:'',location:'',links:[],facts:[
  {id:'fact_1',section:'summary',group:'Page 1',heading:'Unparsed original text — review required',
   detail:'Long page source text',source:'Long page source text',verified:true}
 ]});
 store.records.set('p',{kind:'profile',data:{profile}});
 store.records.set('j',{kind:'job',data:{title:'Engineer'}});
 store.records.set('t',{kind:'template',data:{config:{}}});
 try{
  await assert.rejects(store.execute('tailor',{profileId:'p',jobId:'j',templateId:'t',prompt:'',maxPages:2}),/Only unparsed PDF-page evidence is verified/);
 }finally{await store.db.$disconnect();}
});

test('restructure keeps the original import and creates a new unverified version',async()=>{
 class MemoryStore extends Store{
  records=new Map<string,any>();
  async get(id:string,kind?:string):Promise<any>{
   const record=this.records.get(id);
   if(!record||kind&&record.kind!==kind)throw Error('not found');
   return structuredClone(record);
  }
  async put(kind:string,data:any):Promise<any>{
   const id='new-'+(this.records.size+1);
   const record={id,kind,data:structuredClone(data)};
   this.records.set(id,record);
   return record;
  }
  async parseAsset(_id:string):Promise<any>{return {profilePhoto:'aGVsbG8='};}
 }
 const store=new MemoryStore();
 store.records.set('old-template',{id:'old-template',kind:'template',data:{config:{name:'Imported Resume'},measurements:{pages:[]}}});
 store.records.set('old-import',{id:'old-import',kind:'import',data:{templateId:'old-template',assetId:'asset-1',extraction:{text:page1+'\n'+page2,textPages:[page1,page2]}}});
 try{
  const next=await store.restructureImport('old-import');
  const saved=await store.get(next.importId,'import');
  assert.equal(saved.data.parentImportId,'old-import');
  assert.ok(saved.data.profile.facts.length>5);
  assert.ok(saved.data.profile.facts.every((f:any)=>f.verified===false));
  assert.equal(store.records.get('old-import').data.profile,undefined);
  assert.equal((await store.get(next.templateId,'template')).data.profilePhoto,'aGVsbG8=');
 }finally{await store.db.$disconnect();}
});

test('hard-wrapped work claims are one fact and software is not classified as language',()=>{
 const p1=[
 'Example Engineer','Profile',
 'Backend Developer with strong backend experience. Skilled in',
 'NestJS and PostgreSQL for reliable APIs.',
 'Professional Experience','Backend Developer','Realtech Company Limited',
 '07/2020 – 04/2024',
 'Improved performance by adding Redis caching, reducing repeated database queries and improving response time by',
 '20-30%.',
 'Designed reliable data workflows across PostgreSQL, MySQL, and MongoDB to support reliable production',
 'operations.',
 'System Architecture & Development:',
 'Designed REST APIs for internal applications.',
 'Performance Optimization & Maintenance:',
 'Reduced server costs by 25% through database indexing.',
 'Education','Information Technology','Example University',
 '08/2016 – 05/2020','Developed a school project that improved speed',
 'by 30%'
 ].join('\n');
 const p2=[
 'Key Skills','– LANGUAGES',
 'Thai                                  English',
 'Expert                                Competent',
 '– SOFTWARE',
 'NestJS                            PostgreSQL                         Redis',
 'Expert                            Expert                             Proficient',
 'Laravel                            Django                            .NET Framework',
 'Competent                          Competent                         Competent',
 'Vue.js                             Docker                            Google Cloud Console',
 'Proficient                         Proficient                        Proficient',
 'Lens','Proficient'
 ].join('\n');
 const {profile}=recoverResumeFromText(p1+'\n'+p2,[p1,p2]);
 const first=profile.facts.find(f=>f.section==='work'&&f.detail.includes('Redis caching'));
 assert.ok(first);
 assert.match(first!.detail,/time by 20-30%\./);
 assert.match(first!.source,/time by\n20-30%\./);
 assert.equal(profile.facts.filter(f=>f.detail==='20-30%.').length,0);
 assert.ok(profile.facts.some(f=>f.section==='work'&&f.detail.includes('production operations.')));
 assert.ok(profile.facts.some(f=>f.section==='education'&&f.detail.includes('speed by 30%')));
 assert.ok(profile.facts.some(f=>f.section==='summary'&&f.detail.includes('Skilled in NestJS')));
 assert.ok(profile.facts.some(f=>f.section==='skills'&&f.detail==='NestJS — Expert'));
 assert.ok(profile.facts.some(f=>f.section==='skills'&&f.detail==='Docker — Proficient'));
 assert.ok(profile.facts.some(f=>f.section==='skills'&&f.detail==='Lens — Proficient'));
 assert.ok(profile.facts.some(f=>f.section==='languages'&&f.detail==='Thai — Expert'));
 assert.ok(profile.facts.some(f=>f.section==='languages'&&f.detail==='English — Competent'));
 assert.ok(!profile.facts.some(f=>f.section==='languages'&&/NestJS|Docker/.test(f.detail)));
 assert.ok(!profile.facts.some(f=>f.detail==='Expert'||f.detail==='Competent'||f.detail==='Proficient'));
 const architecture=profile.facts.find(f=>f.detail==='Designed REST APIs for internal applications.');
 const performance=profile.facts.find(f=>f.detail.startsWith('Reduced server costs'));
 assert.ok(architecture?.heading.includes('System Architecture'));
 assert.ok(performance?.heading.includes('Performance Optimization'));
 assert.ok(!performance?.heading.includes('System Architecture'));
 assert.ok(profile.facts.every(f=>f.verified===false));
});
