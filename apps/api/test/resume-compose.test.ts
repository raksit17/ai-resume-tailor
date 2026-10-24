import {test} from 'node:test';
import assert from 'node:assert/strict';
import {composeResume} from '../src/resume-compose';
import {profileSchema,tailoredSchema,defaultTemplate,truthGuard} from '../src/schema';
import {renderHTML,renderDOCX} from '../src/render';

const facts:any[]=[];
const add=(section:string,group:string,heading:string,detail:string)=>{
 const id='fact_'+(facts.length+1);
 facts.push({id,section,group,heading,detail,source:detail,verified:true});
 return id;
};
const company='Realtech Company Limited';
const title='Backend Developer | 07/2020 – 04/2024';
const workIds=[
 add('work',company,title,'Developed NestJS backend services, delivering 20+ API endpoints.'),
 add('work',company,title,'Improved Redis caching performance by 20-30%.'),
 add('work',company,title,'Optimized data workflows using PostgreSQL, MySQL and MongoDB.'),
 add('work',company,title,'Built GitLab CI/CD pipelines reducing deployment steps by 50%.'),
 add('work',company,title,'Added Jest automated tests.'),
 add('work',company,title,'Supported Vue.js frontend integration with backend APIs.'),
 add('work',company,title+' | Architecture','Designed scalable REST APIs for front-end applications.'),
 add('work',company,title+' | Operations','Improved service availability by 25%.'),
 add('work',company,title+' | Operations','Improved microservices latency by 35%.')
];
const internship='Bangkok Web Solution', internHeading='Web Developer Intern | 04/2019 – 08/2019';
const internIds=[
 add('work',internship,internHeading,'Delivered 10+ PHP framework feature updates and bug fixes.'),
 add('work',internship,internHeading,'Optimized MySQL queries and application logic.'),
 add('work',internship,internHeading,'Built responsive frontend pages for clients.'),
 add('work',internship,internHeading,'Reduced website loading time by 25%.')
];
const skillIds=['NestJS — Expert','PostgreSQL — Expert','Redis — Proficient','Laravel — Competent','Django — Competent','.NET Framework — Competent','Vue.js — Proficient','Docker — Proficient','Google Cloud Console — Proficient','GitHub — Competent','Postman — Proficient','VS Code — Expert','Lens — Proficient']
 .map(text=>add('skills','Software','',text));
const educationIds=[
 add('education','King Mongkut University','Bachelor of Technology | 2016 – 2020','Studied programming, databases and network security.'),
 add('education','King Mongkut University','Bachelor of Technology | 2016 – 2020','Developed an analytics project improving processing speed by 30%.'),
 add('education','QQEnglish Language School','English Communication | 2025 – 2026','Completed an intensive international English program.')
];
const langIds=[add('languages','','','Thai — Expert'),add('languages','','','English — Competent')];
const profile=profileSchema.parse({name:'Example Engineer',email:'example@test.invalid',phone:'',location:'',links:[],facts});
const job={
 company:'Example Co',title:'Full-Stack Developer',location:'',
 required:['PHP and Laravel','React or Angular','JavaScript','MySQL and MariaDB','Git','REST API','Linux'],
 preferred:['FastAPI'],responsibilities:['Develop full-stack web applications']
};

test('full-stack 2-page resume restores verified skills and education despite AI choosing only work',async()=>{
 const output=tailoredSchema.parse({
  targetRole:job.title,
  summary:{text:'Developed NestJS backend services.',sourceFactIds:[workIds[0]]},
  items:[...workIds,...internIds].map(id=>({sourceFactId:id,text:facts.find(f=>f.id===id)!.detail})),
  notes:[]
 });
 const {tailored,warnings}=composeResume(profile,output,job,2);
 assert.doesNotThrow(()=>truthGuard(profile,tailored));
 assert.ok(tailored.items.some(i=>skillIds.includes(i.sourceFactId)));
 assert.ok(tailored.items.some(i=>educationIds.includes(i.sourceFactId)));
 assert.ok(tailored.items.some(i=>educationIds[2]===i.sourceFactId));
 assert.ok(tailored.items.some(i=>internIds.includes(i.sourceFactId)));
 assert.ok(tailored.items.filter(i=>workIds.includes(i.sourceFactId)).length<=6);
 assert.ok(tailored.items.filter(i=>internIds.includes(i.sourceFactId)).length<=3);
 assert.ok(warnings.some(w=>w.includes('Restored verified skills')));
 assert.ok(warnings.some(w=>w.includes('Restored verified education')));
 const html=renderHTML(profile,tailored,defaultTemplate);
 assert.equal(html.split('Backend Developer | 07/2020 – 04/2024').length-1,1);
 assert.equal(html.split('Web Developer Intern | 04/2019 – 08/2019').length-1,1);
 assert.equal(html.split('Realtech Company Limited').length-1,1);
 assert.ok(html.includes('Technical Skills'));
 assert.ok(html.includes('NestJS — Expert'));
 assert.ok(html.includes('Education'));
 assert.ok(html.includes('QQEnglish Language School'));
 assert.ok(html.includes('English — Competent'));
 assert.ok(html.includes('<ul class="bullets">'));
 const doc=await renderDOCX(profile,tailored,defaultTemplate);
 assert.equal(doc.subarray(0,2).toString(),'PK');
});

test('unverified technology cannot leak into result to match a vacancy',()=>{
 const partial=profileSchema.parse({...profile,facts:[...profile.facts,
  {id:'unverified-react',section:'skills',group:'Software',heading:'',detail:'React — Expert',source:'No document evidence',verified:false}]});
 const output=tailoredSchema.parse({
  targetRole:'Full-Stack Developer',
  summary:{text:facts[0].detail,sourceFactIds:[workIds[0]]},
  items:[{sourceFactId:workIds[0],text:facts[0].detail}],notes:[]
 });
 const result=composeResume(partial,output,job,2).tailored;
 assert.ok(!result.items.some(item=>item.sourceFactId==='unverified-react'));
 assert.ok(!result.items.some(item=>item.text.includes('React')));
 assert.doesNotThrow(()=>truthGuard(partial,result));
});

test('one-page selection is more selective than two-page without removing factual citations',()=>{
 const output=tailoredSchema.parse({
  targetRole:job.title,
  summary:{text:facts[0].detail,sourceFactIds:[workIds[0]]},
  items:workIds.map(sourceFactId=>({sourceFactId,text:facts.find(f=>f.id===sourceFactId)!.detail})),notes:[]
 });
 const one=composeResume(profile,output,job,1).tailored;
 const two=composeResume(profile,output,job,2).tailored;
 assert.ok(one.items.length<two.items.length);
 assert.ok(one.items.some(i=>skillIds.includes(i.sourceFactId)));
 assert.doesNotThrow(()=>truthGuard(profile,one));
});
