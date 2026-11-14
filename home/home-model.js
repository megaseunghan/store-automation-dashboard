const finite=value=>typeof value==='number'&&Number.isFinite(value);
const KEYS=[['sales','목표매출 달성률',20],['cost','매출원가율',15],['labor','인건비율',15]];
// Severity follows the HR-book descriptions for existing score bands, not a new percentage rule.
const RISK={sales:4,cost:3,labor:5},WARN={sales:14,cost:9,labor:9};
export const severityRank={risk:0,warn:1,mild:2,consult:3};
export function homeStore(row){
 const result={store:row.store,name:row.name,issues:[],pending:[],state:'ready',confirmation:row.confirmation};
 if(['mapping','missing','duplicate'].includes(row.check?.state)||row.check?.retryable){return {...result,state:'pending',pending:['평가 자료 연결 확인 필요']};}
 for(const [key,label,baseline] of KEYS){
  const value=row.positions?.[key]?.value??row.ratios?.[key],score=row.scores?.[key],bands=row.ruleBands?.[key]??[];
  if(!finite(value)||!finite(score)||!bands.length){result.pending.push(label);continue;}
  const consultation=key==='cost'&&row.costAgreement?.required===true;
  if(score>=baseline&&!consultation)continue;
  const level=score>=baseline?'consult':score<=RISK[key]?'risk':score<=WARN[key]?'warn':'mild';
  const target=bands.filter(b=>b[2]===baseline),bounds=target.flatMap(([min,max])=>[min,max]).filter(finite);
  const nearest=bounds.reduce((best,n)=>Math.abs(n-value)<Math.abs(best-value)?n:best,bounds[0]);
  result.issues.push({key,label,value,score,baseline,level,consultation,consulted:row.costAgreement?.completed===true,target,delta:finite(nearest)?Math.round((value-nearest)*100)/100:null});
 }
 result.issues.sort((a,b)=>severityRank[a.level]-severityRank[b.level]);return result;
}
export function sortHomeStores(stores){return [...stores].sort((a,b)=>{
 const rank=x=>x.issues.length?Math.min(...x.issues.map(i=>severityRank[i.level])):99;
 const ar=rank(a),br=rank(b),count=(x,r)=>x.issues.filter(i=>severityRank[i.level]===r).length;
 return ar-br||count(b,br)-count(a,ar)||b.issues.length-a.issues.length;
});}
