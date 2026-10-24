import {Profile,Tailored,tailoredSchema,truthGuard} from './schema';

function normalized(text:string){return text.replace(/\s+/g,' ').trim().toLocaleLowerCase();}

// A verified fact may justify several distinct bullet points. Keep the strict
// truthGuard invariant (one item per fact ID), but consolidate the model's
// many-to-one citations into one item that retains every distinct claim.
export function reconcileTailoredDraft(profile:Profile,input:Tailored){
 const draft=tailoredSchema.parse(input);
 const warnings:string[]=[];
 if(profile.facts.some(f=>f.verified&&/Unparsed original text|original text.*review/i.test(f.heading))){
  warnings.push('This Master Resume contains a confirmed, unparsed PDF-page fact. Re-import the original PDF and verify the new individual evidence lines for a better tailored resume.');
 }
 const available=new Set(profile.facts.filter(f=>f.verified).map(f=>f.id));
 const sourceFactIds=[...new Set(draft.summary.sourceFactIds)];
 if(sourceFactIds.length!==draft.summary.sourceFactIds.length){
  warnings.push('Duplicate summary citations were consolidated.');
 }
 const groups=new Map<string,string[]>();
 for(const item of draft.items){
  // Do not turn a hallucinated / unverified ID into a valid ID.
  if(!available.has(item.sourceFactId))throw new Error(`Unverified or unknown evidence: ${item.sourceFactId}`);
  if(!groups.has(item.sourceFactId))groups.set(item.sourceFactId,[]);
  const text=item.text.trim();
  if(!text)continue;
  const seen=groups.get(item.sourceFactId)!;
  if(!seen.some(x=>normalized(x)===normalized(text)))seen.push(text);
 }
 const items:Tailored['items']=[];
 for(const [sourceFactId,texts] of groups){
  if(!texts.length)continue;
  // A multiline list remains readable with renderHTML's white-space:pre-line
  // and is still traceable to exactly one verified source fact.
  const combined=texts.length===1?texts[0]:texts.map(t=>'• '+t).join('\n');
  if(combined.length>10000){
   throw new Error('AI produced too many claims for one verified fact. Split and confirm the original Resume into individual facts before generating.');
  }
  if(texts.length>1){
   warnings.push(`Consolidated ${texts.length} distinct claims supported by ${sourceFactId}. Review each claim against its source.`);
  }
  items.push({sourceFactId,text:combined});
 }
 if(!items.length)throw new Error('AI did not select any usable verified evidence. Review your Master Resume facts.');
 const normalizedDraft=tailoredSchema.parse({...draft,summary:{...draft.summary,sourceFactIds},items});
 // The existing truth guard still rejects invalid citations and unsupported
 // numeric assertions. Do not "repair" those by silently changing claims.
 const guardWarnings=truthGuard(profile,normalizedDraft);
 return {tailored:normalizedDraft,warnings:[...new Set([...warnings,...guardWarnings])]};
}
