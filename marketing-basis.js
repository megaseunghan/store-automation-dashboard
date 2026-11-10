// Selection metadata only. Scoring remains in scoring.js; observations never refresh implicitly.
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const REPORT_ID=/^[a-zA-Z0-9_-]{1,80}$/;
const MONTH=/^20\d{2}-(0[1-9]|1[0-2])$/;
const DATE=/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const DAY=86400000;
const fail=()=>{throw Error('마케팅 수집 기준을 확인해 주세요.');};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const keys=(value,allowed)=>object(value)&&Object.keys(value).every(key=>allowed.includes(key));
const storeId=store=>typeof store==='string'?store:store?.id;
const timestamp=value=>typeof value==='string'&&TIME.test(value)&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
function calendar(value){if(typeof value!=='string'||!DATE.test(value))return null;const time=Date.parse(value+'T00:00:00Z');return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value?time:null;}
function normalizedRange(value){
 if(!keys(value,['start','endExclusive']))fail();const start=calendar(value.start),end=calendar(value.endExclusive);
 if(start===null||end===null||end<=start||(end-start)/DAY>31)fail();return {start:value.start,endExclusive:value.endExclusive};
}
function reference(value,supplement=false){
 if(!keys(value,supplement?['reportId','collectedAt','range','targetMonth']:['reportId','collectedAt'])||!UUID.test(value.reportId??''))fail();
 const collectedAt=timestamp(value.collectedAt);if(!collectedAt)fail();
 const clean={reportId:value.reportId.toLowerCase(),collectedAt};
 if(supplement){if(!MONTH.test(value.targetMonth??''))fail();clean.range=normalizedRange(value.range);clean.targetMonth=value.targetMonth;}
 return clean;
}
export function validateMarketingBasis(value){
 if(!keys(value,['regular','supplements','pinnedAt'])||!Array.isArray(value.supplements))fail();
 const regular=reference(value.regular),supplements=value.supplements.map(item=>reference(item,true)),seen=new Set([regular.reportId]);
 for(const item of supplements){if(seen.has(item.reportId))fail();seen.add(item.reportId);}
 const pinnedAt=value.pinnedAt===null?null:timestamp(value.pinnedAt);if(value.pinnedAt!==null&&!pinnedAt)fail();
 return {regular,supplements,pinnedAt};
}
/** Reference-only projection; never carry source body, URLs or financial details. */
export function projectMarketingBasis(value){
 if(value===undefined)return undefined;
 const empty={state:'unavailable',regular:null,supplements:[],pinnedAt:null,warningDays:0};
 if(value?.state==='not-applicable')return {...empty,state:'not-applicable'};
 try{const clean=validateMarketingBasis({regular:value.regular,supplements:value.supplements,pinnedAt:value.pinnedAt});
  const spread=clean.supplements.reduce((max,ref)=>Math.max(max,Math.abs(Date.parse(ref.collectedAt)-Date.parse(clean.regular.collectedAt))),0);
  return {state:['auto','pinned'].includes(value.state)?value.state:'unavailable',...clean,warningDays:spread>72*3600000?Math.ceil(spread/DAY):0};
 }catch{return empty;}
}
export function marketingAuditSuffix(value){
 const clean=projectMarketingBasis(value)??{state:'unavailable',regular:null,supplements:[]};
 const refs=[...(clean.regular?[['regular',clean.regular]]:[]),...clean.supplements.map(ref=>['supplement',ref])];
 return `marketing_state=${clean.state};marketing_refs=${refs.length?refs.map(([kind,ref])=>`${kind}:${ref.reportId.slice(0,8)}@${ref.collectedAt}`).join(','):'none'}`;
}
/** Canonical store reference uses the latest valid account observation, then run start. */
export function referenceForReport(report,store){
 const id=storeId(store),rows=(Array.isArray(report?.results)?report.results:[]).filter(row=>row?.store===id);
 if(!(UUID.test(report?.id??'')||REPORT_ID.test(report?.id??''))||!rows.length||report.deletedAt||report.deleted_at)fail();
 const observed=rows.map(row=>timestamp(row.collectedAt)).filter(Boolean).sort();
 const collectedAt=observed.at(-1)??timestamp(report.createdAt);if(!collectedAt)fail();
 const result={reportId:report.id.toLowerCase(),collectedAt};
 if(report.scope==='custom-range'){
  if(report.range?.timezone&&report.range.timezone!=='Asia/Seoul')fail();
  result.range=normalizedRange({start:report.range?.start,endExclusive:report.range?.endExclusive});
  result.targetMonth=report.targetMonth??report.month;if(!MONTH.test(result.targetMonth??''))fail();
 }
 return result;
}
function sameReference(left,right){return !!left&&!!right&&left.reportId===right.reportId&&left.collectedAt===right.collectedAt&&left.targetMonth===right.targetMonth&&JSON.stringify(left.range??null)===JSON.stringify(right.range??null);}
function observedReport(reports,ref,month,store,supplement){
 const matches=reports.filter(report=>report?.id?.toLowerCase()===ref.reportId);
 if(matches.length!==1)return null;const report=matches[0];
 if(report.month!==month||(report.scope==='custom-range')!==supplement)return null;
 try{const actual=referenceForReport(report,store);if(supplement&&actual.targetMonth!==month)return null;return sameReference(actual,ref)?report:null;}catch{return null;}
}
function unavailable(basis=null){return {state:'unavailable',regular:basis?.regular??null,supplements:basis?.supplements??[],pinnedAt:basis?.pinnedAt??null,newer:null,warningDays:0,evidenceText:basis?`기준 수집본 확인 불가 · ${marketingBasisText(basis)}`:'마케팅 수집 기준을 확인하지 못했습니다.'};}
export function resolveMarketingBasis({month,store,reports=[],basis}={}){
 if(!MONTH.test(month??'')||!storeId(store)||!Array.isArray(reports))return unavailable();
 const regulars=[];
 for(const report of reports){if(report?.month!==month||report.scope==='custom-range')continue;try{regulars.push(referenceForReport(report,store));}catch{/* An invalid observation cannot become a scoring basis. */}}
 regulars.sort((a,b)=>b.collectedAt.localeCompare(a.collectedAt)||b.reportId.localeCompare(a.reportId));
 let selected;
 if(basis!==undefined&&basis!==null){
  try{selected=validateMarketingBasis(basis);}catch{return unavailable();}
  if(!observedReport(reports,selected.regular,month,store,false)||selected.supplements.some(ref=>!observedReport(reports,ref,month,store,true)))return unavailable(selected);
 }else if(regulars.length)selected={regular:regulars[0],supplements:[],pinnedAt:null};
 else return unavailable();
 const latest=regulars[0],newer=latest&&latest.collectedAt>selected.regular.collectedAt?latest:null;
 const spread=selected.supplements.reduce((max,ref)=>Math.max(max,Math.abs(Date.parse(ref.collectedAt)-Date.parse(selected.regular.collectedAt))),0);
 const result={state:basis?'pinned':'auto',month,store:storeId(store),...selected,newer,warningDays:spread>72*3600000?Math.ceil(spread/DAY):0};
 result.evidenceText=marketingBasisText(result);return result;
}
function kst(value){const date=new Date(Date.parse(value)+9*3600000);return `${date.toISOString().slice(0,10)} ${date.toISOString().slice(11,16)} KST`;}
export function marketingBasisText(resolution,{includeIds=false}={}){
 if(resolution?.state==='not-applicable')return '마케팅 자동 수집 대상 아님 · 노션 입력 점수 기준';
 if(!resolution?.regular)return '마케팅 수집 기준을 확인하지 못했습니다.';
 const label=ref=>`${includeIds?ref.reportId.slice(0,8)+' · ':''}${kst(ref.collectedAt)}`;
 return `수집 기준: 정규 ${label(resolution.regular)}${(resolution.supplements??[]).map(ref=>`, 보충(${ref.range.start}~${new Date(Date.parse(ref.range.endExclusive+'T00:00:00Z')-DAY).toISOString().slice(0,10)}) ${label(ref)}`).join('')}${resolution.state==='auto'?' · 자동 선택':''}`;
}
function summarize(items){
 const included=items.filter(item=>item.eligibility==='included');
 return {included:included.length,pending:items.filter(item=>item.eligibility==='review').length,excluded:items.filter(item=>item.eligibility==='excluded').length,metrics:Object.fromEntries(['views','saved','shares'].map(name=>{
  const values=included.map(item=>item.metrics?.[name]).filter(value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0),total=values.length?values.reduce((sum,value)=>sum+value,0):null;
  return [name,{total,observed:values.length,missing:included.length-values.length,average:values.length?total/values.length:null}];
 }))};
}
/** Priority is immutable selection order: regular first, then supplements array order. */
export function combineMarketingBasis({month,store,resolution,runs=[]}={}){
 const failure={available:false,results:[],evidenceText:resolution?.evidenceText??'마케팅 수집 기준을 확인하지 못했습니다.',state:'unavailable'};
 if(!resolution||!['auto','pinned'].includes(resolution.state)||!Array.isArray(runs))return failure;
 const id=storeId(store),refs=[resolution.regular,...resolution.supplements],selected=[];
 for(const [index,ref]of refs.entries()){const run=observedReport(runs,ref,month,id,index>0);if(!run)return failure;selected.push(run);}
 const platforms=new Map(),seen=new Map();
 for(const [index,run]of selected.entries()){
  const observedPlatforms=new Set();
  for(const row of run.results.filter(row=>row.store===id)){
  if(!['instagram','threads'].includes(row.platform)||!['collected','partial','failed'].includes(row.status)||!Array.isArray(row.items)||observedPlatforms.has(row.platform))return failure;
  observedPlatforms.add(row.platform);
  const actual=summarize(row.items),countsValid=['included','pending','excluded'].every(key=>row.summary?.[key]===actual[key]);
  let merged=platforms.get(row.platform);
  if(!merged){merged={store:id,storeName:row.storeName,platform:row.platform,month,collectedAt:row.collectedAt,followers:row.followers??null,status:row.status,listComplete:index===0&&row.listComplete===true&&countsValid,items:[],issues:[...(Array.isArray(row.issues)?row.issues:[])]};platforms.set(row.platform,merged);seen.set(row.platform,new Set());}
  else{merged.listComplete=merged.listComplete&&row.listComplete===true&&countsValid;if(row.status==='failed')merged.status='failed';else if(row.status!=='collected'&&merged.status==='collected')merged.status='partial';merged.issues.push(...(Array.isArray(row.issues)?row.issues:[]));}
  for(const item of row.items){
   if(typeof item?.id!=='string'||!item.id)return failure;
   if(index>0){const stamp=Date.parse(item.timestamp),start=Date.parse(refs[index].range.start+'T00:00:00+09:00'),end=Date.parse(refs[index].range.endExclusive+'T00:00:00+09:00');if(!Number.isFinite(stamp)||stamp<start||stamp>=end)continue;}
   if(seen.get(row.platform).has(item.id))continue;seen.get(row.platform).add(item.id);merged.items.push({...item,metrics:{...(item.metrics??{})}});
  }
  }
 }
 const results=[...platforms.values()].map(row=>({...row,summary:summarize(row.items)}));
 return {available:true,results,evidenceText:marketingBasisText(resolution),state:resolution.state};
}
export function newerGrowth(resolution,runs=[]){
 if(!resolution?.regular||!resolution.newer||!Array.isArray(runs))return null;
 const old=runs.find(run=>run.id?.toLowerCase()===resolution.regular.reportId),next=runs.find(run=>run.id?.toLowerCase()===resolution.newer.reportId);
 if(!old||!next)return null;
 // The same store is identified by the canonical references, not a body-provided label.
 const stores=resolution.store?[resolution.store]:[...new Set((old.results??[]).map(row=>row.store))];let store;
 for(const candidate of stores){try{if(sameReference(referenceForReport(old,candidate),resolution.regular)&&sameReference(referenceForReport(next,candidate),resolution.newer)){if(store)return null;store=candidate;}}catch{/* Not the selected store. */}}
 if(!store)return null;
 const observe=run=>{
  const rows=run.results.filter(row=>row.store===store),platforms=rows.map(row=>row.platform).sort();if(new Set(platforms).size!==platforms.length)return null;
  const values=new Map();for(const row of rows){if(row.status!=='collected'||row.listComplete!==true||!Array.isArray(row.items))return null;for(const item of row.items.filter(item=>item.eligibility==='included')){const value=item.metrics?.views,key=row.platform+':'+item.id;if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||values.has(key))return null;values.set(key,value);}}
  return {platforms:platforms.join(','),values};
 };
 const a=observe(old),b=observe(next);if(!a||!b||a.platforms!==b.platforms||a.values.size!==b.values.size||[...a.values.keys()].some(key=>!b.values.has(key)))return null;
 const previous=[...a.values.values()].reduce((sum,value)=>sum+value,0),current=[...b.values.values()].reduce((sum,value)=>sum+value,0);return previous>0?(current-previous)/previous*100:null;
}
