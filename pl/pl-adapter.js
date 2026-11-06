const MONTH=/^\d{4}-(0[1-9]|1[0-2])$/;
const COMMON=['sales','discount','cogs','expense','labor','laborRate','withholding','cardFee','vat','incomeTax','grossProfit','opProfit','netProfit','cashSales','cardSales','liquor','food','supplies','repair','rent','fixed','marketing','utilities'];
const ADMIN=['staff','part','staffPay','staffTaxDiff','partPay','partTaxDiff','staffWithholding','partWithholding','helperPay','laborExtra'];
const finite=value=>typeof value==='number'&&Number.isFinite(value);
export function freezePL(value){if(value&&typeof value==='object'){Object.values(value).forEach(freezePL);Object.freeze(value);}return value;}
/** Normalize only public financial fields; never retain a raw API payload. */
export function adaptPLResponse(response,{role='viewer',now=new Date()}={}) {
  const admin=role==='admin',date=new Date(typeof now==='function'?now():now);
  const currentMonth=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'}).format(date);
  const stores=[...new Map((response?.stores??[]).filter(s=>typeof s.id==='string'&&typeof s.name==='string').map(s=>[s.id,{id:s.id,name:s.name}])).values()];
  const ids=new Set(stores.map(s=>s.id)),fields=[...COMMON,...(admin?ADMIN:[])];
  const months=[...new Set((response?.months??[]).filter(m=>MONTH.test(m)))].sort();
  const cells=new Map();
  for(const row of response?.rows??[])if(ids.has(row.store)&&MONTH.test(row.month)){
    const key=`${row.month}:${row.store}`;cells.set(key,(cells.get(key)??0)+1);
  }
  const rows=(response?.rows??[]).filter(row=>ids.has(row.store)&&MONTH.test(row.month)).map(row=>{
    const values=Object.fromEntries(fields.filter(key=>Object.hasOwn(row.values??{},key)).map(key=>[key,finite(row.values[key])?row.values[key]:null]));
    const duplicate=cells.get(`${row.month}:${row.store}`)>1;
    const state=duplicate?'duplicate':row.check?.state??'missing';
    const usable=['ok','notion-truncated'].includes(state)&&finite(values.netProfit);
    const check={state,corrected:admin&&Array.isArray(row.check?.corrected)?row.check.corrected.filter(key=>fields.includes(key)):[],
      ...(row.check?.message||!usable?{message:admin?(duplicate?'중복 행 확인 필요':row.check?.message??'자료 확인 필요'):'일부 매장 자료 확인 중'}:{})};
    return {month:row.month,store:row.store,status:row.month>=currentMonth?'open':'closed',usable,values,
      rawDetails:{...values},check,source:['snapshot','live'].includes(row.source)?row.source:null,
      computedAt:typeof row.computedAt==='string'?row.computedAt:null};
  });
  const integrated=(Array.isArray(response?.integrated)?response.integrated:[]).filter(item=>MONTH.test(item.month)).map(item=>({month:item.month,state:item.state,
    includedStores:(item.includedStores??[]).filter(id=>ids.has(id)),recalculated:finite(item.recalculated)?item.recalculated:null,
    source:item.source??null,computedAt:item.computedAt??null,
    ...(item.message||!['ok','notion-truncated'].includes(item.state)?{message:admin?String(item.message||'통합 자료 확인 필요'):'일부 매장 자료 확인 중'}:{})}));
  return freezePL({stores:stores.filter(s=>s.id!=='hq'),hq:stores.find(s=>s.id==='hq')??null,months,rows,integrated,currentMonth,
    role:admin?'admin':'viewer',fetchedAt:typeof response?.fetchedAt==='string'?response.fetchedAt:null});
}
