import {freezePL} from './pl-adapter.js?v=71d8e82b0ece';
export const PL_AMOUNT_KEYS=Object.freeze(['sales','cogs','staff','part','labor','expense','cardFee','vat','incomeTax','grossProfit','opProfit','netProfit']);
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const round2=value=>Math.round((value+Number.EPSILON)*100)/100;
const sum=values=>values.length&&values.every(finite)?values.length===1?values[0]:round2(values.reduce((a,b)=>a+b,0)):null;
function calculated(amounts){return freezePL({...amounts,ratios:Object.fromEntries(PL_AMOUNT_KEYS.map(key=>[key,finite(amounts[key])&&finite(amounts.sales)&&amounts.sales!==0?amounts[key]/amounts.sales*100:null]))});}
export function periodMonths(unit,period){
  const month=/^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if(unit==='month')return Object.freeze(month?[period]:[]);
  if(unit==='ytd'&&month)return Object.freeze(Array.from({length:Number(month[2])},(_,i)=>`${month[1]}-${String(i+1).padStart(2,'0')}`));
  const range=unit==='quarter'?/^(\d{4})-Q([1-4])$/.exec(period):unit==='half'?/^(\d{4})-H([12])$/.exec(period):null;
  if(!range)return Object.freeze([]);const size=unit==='quarter'?3:6;
  return Object.freeze(Array.from({length:size},(_,i)=>`${range[1]}-${String((Number(range[2])-1)*size+i+1).padStart(2,'0')}`));
}
export function comparePL(currentCalc,priorCalc,key,status='closed'){
  const ratio=['cogs','labor','expense'].includes(key),unit=ratio?'%p':'%';
  const current=ratio?currentCalc?.ratios?.[key]:currentCalc?.[key],prior=ratio?priorCalc?.ratios?.[key]:priorCalc?.[key];
  if(status==='open'||!finite(current)||!finite(prior)||(!ratio&&prior===0))return Object.freeze({value:null,unit,tone:'neutral'});
  const value=ratio?current-prior:(current-prior)/Math.abs(prior)*100;
  const neutral=['cardFee','vat','incomeTax'].includes(key)||(ratio?Math.abs(value)<=1+Number.EPSILON*8:Math.abs(value)<0.000001);
  return Object.freeze({value,unit,tone:neutral?'neutral':(ratio?value<0:value>0)?'ok':'risk'});
}
export function createPLCalculations(model){
  const index=new Map(model.rows.map(row=>[`${row.month}:${row.store}`,row]));
  function selectionTargetsPL(store){
    if(Array.isArray(store)){const selected=new Set(store),targets=model.stores.filter(s=>selected.has(s.id)).map(s=>s.id);if(!targets.length)throw new RangeError('1곳 이상 선택');return targets;}
    if(store==='all')return model.stores.map(s=>s.id);
    return (store==='hq'&&model.hq)||model.stores.some(s=>s.id===store)?[store]:[];
  }
  function defaultPLIncludeHQ(store,value){return value==='1'?true:value==='0'?false:selectionTargetsPL(store).length===model.stores.length;}
  function aggregatePL(months,store='all',options){
    const selectedMonths=[...new Set(months)].sort(),targets=selectionTargetsPL(store),rows=[],missingCells=[],availableMonths=[],missingMonths=[],messages=new Set();
    const counts=new Map(targets.map(id=>[id,0]));
    for(const month of selectedMonths){let available=false;for(const id of targets){const row=index.get(`${month}:${id}`);if(row?.usable){rows.push(row);counts.set(id,counts.get(id)+1);available=true;}else{missingCells.push({month,store:id});if(row?.check.message)messages.add(row.check.message);}}(available?availableMonths:missingMonths).push(month);}
    const amount=key=>sum(rows.map(row=>row.values[key]));
    const raw=rows.length?Object.fromEntries([...new Set(rows.flatMap(row=>Object.keys(row.rawDetails)))].map(key=>[key,sum(rows.map(row=>row.rawDetails[key]))])):null;
    const calc=rows.length?calculated(Object.fromEntries(PL_AMOUNT_KEYS.map(key=>[key,amount(key)]))):null;
    const times=rows.map(row=>row.computedAt).filter(Boolean).sort();
    const result={raw,calc,rows,months:selectedMonths,availableMonths,missingMonths,includedStores:targets.filter(id=>counts.get(id)>0),missingStores:targets.filter(id=>counts.get(id)===0),partialStores:targets.filter(id=>counts.get(id)>0&&counts.get(id)<selectedMonths.length),missingCells,
      excludedStoreCount:new Set(missingCells.map(cell=>cell.store)).size,checkMessages:[...messages],status:!rows.length?'none':rows.some(row=>row.status==='open')?'open':'closed',complete:rows.length>0&&targets.length>0&&missingCells.length===0,monthsCount:availableMonths.length,
      source:rows.some(row=>row.source==='live')?'live':rows.some(row=>row.source==='snapshot')?'snapshot':null,computedAt:times[0]??null};
    if(options===undefined)return freezePL(result);
    const hq=options?.includeHQ===true?aggregatePL(selectedMonths,'hq'):null;
    return freezePL({...result,hq,finalNet:calc&&hq?.calc&&hq.complete?sum([calc.netProfit,hq.calc.netProfit]):null});
  }
  function previousMean(month,store='all',options){
    if(options!==undefined){const result=previousMean(month,store);if(options?.includeHQ!==true)return freezePL({...result,hq:null,finalNet:null});
      const hq=previousMean(month,'hq'),candidates=[...result.months,...result.missingMonths].sort(),monthly=candidates.map(month=>({month,result:aggregatePL([month],store,{includeHQ:true})}));
      const available=monthly.filter(item=>item.result.finalNet!==null&&item.result.status==='closed'&&item.result.hq?.status==='closed');
      return freezePL({...result,hq,finalNet:available.length?available.reduce((total,item)=>total+item.result.finalNet,0)/available.length:null,finalCount:available.length,finalMonths:available.map(item=>item.month),finalMissingMonths:monthly.filter(item=>!available.includes(item)).map(item=>item.month)});
    }
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return freezePL({calc:null,months:[],count:0,missingMonths:[],partial:false});
    const [year,m]=month.split('-').map(Number),candidates=Array.from({length:3},(_,i)=>{const date=new Date(Date.UTC(year,m-2-i,1));return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`;}).sort();
    const monthly=candidates.map(month=>({month,result:aggregatePL([month],store)})),available=monthly.filter(item=>item.result.calc&&item.result.status==='closed');
    const count=available.length,amounts=count?Object.fromEntries(PL_AMOUNT_KEYS.map(key=>[key,available.every(item=>finite(item.result.calc[key]))?available.reduce((total,item)=>total+item.result.calc[key],0)/count:null])):null;
    return freezePL({calc:amounts?calculated(amounts):null,months:available.map(item=>item.month),count,missingMonths:monthly.filter(item=>!available.includes(item)).map(item=>item.month),partial:available.some(item=>!item.result.complete)});
  }
  return Object.freeze({periodMonths,selectionTargetsPL,defaultPLIncludeHQ,aggregatePL,previousMean,comparePL});
}
