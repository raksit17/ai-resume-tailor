import https from 'node:https';
import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
export async function publicGet(raw:string,headers:Record<string,string>={}){
 const url=new URL(raw);
 if(url.protocol!=='https:' || url.username || url.password || (url.port && url.port!=='443'))throw new Error('Only public HTTPS URLs on port 443 are supported');
 const addresses=await dns.lookup(url.hostname,{all:true});
 if(!addresses.length || addresses.some(a=>!ipaddr.isValid(a.address)||ipaddr.process(a.address).range()!=='unicast'))throw new Error('Private or special network address blocked');
 const a=addresses[0];
 return new Promise<{body:string;headers:import('node:http').IncomingHttpHeaders}>((resolve,reject)=>{
  const req=https.get(url,{headers:{'User-Agent':'LocalResumeTailor/1.0',...headers},lookup:((_host:any,_opts:any,cb:any)=>{if(_opts?.all)cb(null,[a]);else cb(null,a.address,a.family)}) as any},res=>{
   if(res.statusCode!==200){res.resume();reject(new Error(`HTTP ${res.statusCode}; redirects/login walls are not followed. Paste the text instead.`));return;}
   const chunks:Buffer[]=[];let size=0;
   res.on('data',c=>{size+=c.length;if(size>2*1024*1024)req.destroy(new Error('Response too large'));else chunks.push(c)});
   res.on('end',()=>resolve({body:Buffer.concat(chunks).toString('utf8'),headers:res.headers}));res.on('error',reject);
  });req.setTimeout(20000,()=>req.destroy(new Error('URL timeout')));req.on('error',reject);
 });
}
