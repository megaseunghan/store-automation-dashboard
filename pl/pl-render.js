export function createPLRenderer(model, calculations) {
const PL_STORES=model.stores, PL_MONTHS=model.months;
const {periodMonths,aggregatePL,previousMean,comparePL}=calculations;
const icon=()=>'<span aria-hidden="true">⌄</span>';
const plEsc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plNumber = v => v==null?'—':Number(v).toLocaleString('ko-KR',{maximumFractionDigits:2});
const plMoney = value => {
  if(value==null)return '확인 필요';
  const man=Math.round(Math.abs(value)/10000), sign=value<0&&man!==0?'−':'';
  return `${sign}${man>=10000?`${Math.floor(man/10000)}억 ${man%10000?`${(man%10000).toLocaleString('ko-KR')}만`:''}`:`${man.toLocaleString('ko-KR')}만`}`;
};
const plPercent = value => value==null?'—':`${Number(value).toFixed(1)}%`;
const plRawMoney = value => value==null?'미확인':`${plNumber(value)}원`;
const plSelectedIds = store => store==='all'?PL_STORES.map(s=>s.id):Array.isArray(store)?PL_STORES.filter(s=>store.includes(s.id)).map(s=>s.id):PL_STORES.some(s=>s.id===store)?[store]:[];
const plStoreName = id => Array.isArray(id)?(id.length===1?plStoreName(id[0]):`${id.length}곳 (${id.map(plStoreName).join(', ')})`):id==='all'?`전체 매장 ${PL_STORES.length}곳`:id===model.hq.id?'본부':PL_STORES.find(s=>s.id===id)?.name||'매장 미확인';
const plIncludesHQ = state => typeof state.includeHQ==='boolean'?state.includeHQ:plSelectedIds(state.store).length===PL_STORES.length;
const plStoreButtonLabel = (store,includeHQ=false) => {const ids=plSelectedIds(store);return ids.length===PL_STORES.length?`전체 ${PL_STORES.length}곳${includeHQ?' + 본부':''}`:ids.length===1?`${plStoreName(ids[0])}${includeHQ?' + 본부':''}`:`${ids.length}곳${includeHQ?' + 본부':' 선택'}${ids.length<=3?` · ${ids.join(', ')}`:''}`;};
const plStatementTitle = store => {const ids=plSelectedIds(store);return ids.length===PL_STORES.length?`전체 매장 ${PL_STORES.length}곳`:ids.length===1?plStoreName(ids[0]):`선택 매장 ${ids.length}곳`;};
const plPeriodLabel = (unit,period) => unit==='quarter'?`${period.slice(0,4)} ${period.slice(-1)}분기`:unit==='half'?`${period.slice(0,4)} ${period.endsWith('1')?'상반기':'하반기'}`:unit==='ytd'?`${period.slice(0,4)}년 1~${Number(period.slice(-2))}월`:`${period.slice(0,4)}년 ${Number(period.slice(-2))}월`;
const PL_DETAIL_FIELDS = Object.freeze({sales:[['cashSales','현금 매출'],['cardSales','카드 매출'],['discount','할인액 · 참고, 차감 안 함']],cogs:[['liquor','주류'],['food','식자재'],['supplies','비품']],labor:[['staffPay','직원 급여'],['staffWithholding','직원 원천징수'],['partPay','파트 급여'],['partWithholding','파트 원천징수'],['staffTaxDiff','직원 세무사 차액'],['partTaxDiff','파트 세무사 차액'],['helperPay','파출부 급여']],expense:[['rent','임대료'],['fixed','고정비'],['marketing','마케팅비'],['utilities','공과금/변동비'],['repair','시설보수비']],cardFee:[],vat:[],incomeTax:[]});
const PL_STATEMENT_ROWS=Object.freeze([{key:'sales',label:'매출',kind:'sales'},{key:'cogs',label:'매출원가 (총 매입)',kind:'deduct'},{key:'grossProfit',label:'매출이익',kind:'result'},{key:'labor',label:'인건비',kind:'deduct'},{key:'expense',label:'비용',kind:'deduct'},{key:'cardFee',label:'카드 수수료',kind:'deduct'},{key:'opProfit',label:'영업이익',kind:'result'},{key:'vat',label:'부가세 예수금',kind:'deduct',tax:true},{key:'incomeTax',label:'종합소득세 예수금',kind:'deduct',tax:true},{key:'netProfit',label:'점포순수익',kind:'net'}]);
function plPending(state) { return periodMonths(state.unit,state.period).includes(model.currentMonth); }
function plCoverage(data) {
 const n=data?.excludedStoreCount||0;
 return n?`${n}곳 확인 필요 · 합계에서 제외`:'';
}
function sourceLabel(data) {
 const rows=data.rows||[], times=rows.map(r=>r.computedAt).filter(Boolean).sort();
 const time=data.computedAt||times[0]||model.fetchedAt;
 const d=new Date(time), valid=Number.isFinite(d.getTime());
 const parts=valid?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d):[];
 const part=type=>parts.find(p=>p.type===type)?.value;
 const formatted=valid?`${part('month')}/${part('day')} ${part('hour')}:${part('minute')}`:'';
 return rows.some(r=>r.source==='live')?`노션 실시간${formatted?' · '+formatted+' 기준':''}`:`매일 새벽 4시 갱신${formatted?' · 마지막 갱신 '+formatted:''}`;
}
function integratedNote(state) {
 const integrated=Array.isArray(model.integrated)?model.integrated.find(r=>r.month===state.anchorMonth):model.integrated;
 const entry=integrated?.[state.anchorMonth]||integrated;
 const count=(entry?.includedStores||[]).filter(id=>(typeof id==='string'?id:id?.id)!==model.hq.id).length;
 return `<p class="pl-note pl-integrated-note">노션 통합 손익계산서는 ${count}곳 기준(사색 26년 12월, 야미옥 27년 1월부터 포함)</p>`;
}
function renderPLHeader(state,data) {
 let periods=PL_MONTHS;
 if(state.unit==='quarter')periods=[...new Set(PL_MONTHS.map(m=>`${m.slice(0,4)}-Q${Math.ceil(Number(m.slice(-2))/3)}`))];
 if(state.unit==='half')periods=[...new Set(PL_MONTHS.map(m=>`${m.slice(0,4)}-H${Number(m.slice(-2))<=6?1:2}`))];
 const open=data.status==='open';
 return `<div class="pl-controls"><div class="seg" role="group" aria-label="기간 단위">${[['month','월'],['quarter','분기'],['half','반기'],['ytd','연간 누적']].map(([key,label])=>`<button type="button" data-pl-unit="${key}" aria-pressed="${state.unit===key}">${label}</button>`).join('')}</div><div class="pl-selects"><label><span class="pl-sr-only">기간</span><select data-pl-select="period" aria-label="기간">${periods.map(p=>`<option value="${p}" ${p===state.period?'selected':''}>${plPeriodLabel(state.unit,p)}</option>`).join('')}</select></label><button type="button" class="pl-store-select-button" data-pl-action="stores" aria-haspopup="dialog" aria-expanded="false" aria-controls="pl-store-picker">${plEsc(plStoreButtonLabel(state.store,plIncludesHQ(state)))}</button></div></div><div class="pl-status-line"><span class="status" data-s="${open?'pend':data.complete?'ok':'none'}">${open?'집계 중':data.complete?'마감 완료':'확인 필요'}</span><span>${plEsc(sourceLabel(data))}</span>${plCoverage(data)?`<p class="pl-coverage">${plEsc(plCoverage(data))}</p>`:''}</div>`;
}
function renderPLComparison(value,prior,key,status='closed') {
  if(status==='open')return '<span class="pl-muted">마감 후 비교</span>';
  const diff=comparePL(value,prior,key,status);
  const rounded=diff.value==null?null:Math.round(diff.value*10)/10;
  const normalized=Object.is(rounded,-0)?0:rounded;
  return normalized==null?'<span class="pl-muted">비교 자료 없음</span>':`<span class="pl-delta" data-tone="${normalized===0?'neutral':diff.tone}">${normalized>0?'+':''}${normalized.toFixed(1)}${diff.unit}</span>`;
}
function renderPLStatement(state,data) {
  const calc=data.calc, openMonth=state.unit==='month'&&data.status==='open';
  const prior=state.unit==='month'&&!openMonth?previousMean(state.period,state.store):null;
  const monthsCount=data.availableMonths?.length||0;
  const row=(r)=>{
    const value=calc?.[r.key], expandable=Object.hasOwn(PL_DETAIL_FIELDS,r.key)&&(r.key!=='labor'||model.role==='admin'), expanded=Boolean(state.expanded[r.key]);
    const pending=plPending(state,r.key);
    const details=expandable?PL_DETAIL_FIELDS[r.key].filter(([key])=>data.raw?.[key]!=null):[];
    return `<div class="pl-statement-row pl-kind-${r.kind} ${pending?'pl-pending':''}"><div class="pl-row-main">${expandable?`<button type="button" class="pl-row-label" data-pl-expand="${r.key}" aria-expanded="${expanded}" title="${pending?'마감 전 · 변동 가능':'세부 항목 원값 보기'}"><span>${r.kind==='deduct'?'− ':''}${r.label}</span>${icon('down',13)}</button>`:`<span class="pl-row-label">${r.kind==='deduct'?'− ':r.kind==='sales'?'':'= '}${r.label}</span>`}<span class="pl-row-money ${value<0?'pl-negative':''}" title="${plEsc(plRawMoney(value))}">${plMoney(value)}</span><span class="pl-row-ratio">${plPercent(calc?.ratios?.[r.key])}</span><span class="pl-row-compare">${state.unit==='month'?(openMonth?'<span class="pl-muted">마감 후 비교</span>':renderPLComparison(calc,prior?.calc,r.key)):value==null||!monthsCount?'—':`${plMoney(value/monthsCount)} /월`}</span></div>${r.tax?'<span class="pl-tax-chip">따로 모아둘 돈 · 순수익에 이미 차감</span>':''}${expanded?`<dl class="pl-raw-detail">${details.length?details.map(([key,label])=>`<div><dt>${label}</dt><dd>${plRawMoney(data.raw?.[key])}</dd></div>`).join(''):`<div><dt>${r.key==='cardFee'?'카드 매출 × 1.25%':r.key==='vat'?'매출 × 5%':'매출 × 1%'}</dt><dd>${plRawMoney(value)}</dd></div>`}<div class="pl-raw-total"><dt>${r.label} 원값</dt><dd>${plRawMoney(value)}</dd></div></dl>`:''}</div>`;
  };
  const includeHQ=plIncludesHQ(state),combined=includeHQ?aggregatePL(data.months,state.store,{includeHQ:true}):null;
  const hq=combined?.hq,company=combined?.finalNet;
  const finalOpen=state.unit==='month'&&(data.status==='open'||hq?.status==='open');
  const finalPrior=state.unit==='month'&&includeHQ&&!finalOpen?previousMean(state.period,state.store,{includeHQ:true}):null;
  return `<section class="panel pl-statement"><div class="panel-head"><h2>${plEsc(plStatementTitle(state.store))} 손익계산서</h2><span class="meta">단위: 만원</span></div><div class="pl-statement-head"><span>항목</span><span>금액</span><span>매출 대비</span><span>${state.unit==='month'?(openMonth?'마감 후 비교':`직전 ${prior?.count||0}개월 평균 대비`):'기간 월평균'}</span></div>${PL_STATEMENT_ROWS.map(row).join('')}${includeHQ?`<div class="pl-company"><div><span>본부 순수익</span><strong class="${hq?.calc?.netProfit<0?'pl-negative':''}" title="${plRawMoney(hq?.calc?.netProfit)}">${plMoney(hq?.calc?.netProfit)}</strong></div><div class="pl-company-total"><span>${state.store==='all'?'= 회사 전체':'= 선택 매장 + 본부'}</span><strong class="pl-hq-final-net" title="${plRawMoney(company)}">${plMoney(company)}</strong></div>${state.unit==='month'?`<p class="pl-final-comparison">${finalOpen?'<span class="pl-muted">마감 후 비교</span>':renderPLComparison(company==null?null:{netProfit:company},finalPrior?.finalNet==null?null:{netProfit:finalPrior.finalNet},'netProfit')}<small>${finalOpen?'':`직전 ${finalPrior?.finalCount||0}개월 평균 대비`}</small></p>`:''}${integratedNote(state)}<p class="pl-note">선택 매장 순수익 + 본부 순수익 · 본부는 점포 합계에 넣지 않습니다.</p>${hq?.complete?'':`<p class="pl-coverage">본부 자료 일부 누락 · ${plEsc(plCoverage(hq)||'확인 필요')}</p>`}</div>`:'<p class="pl-store-scope-note pl-note">본부 미포함 · 선택 화면에서 켤 수 있습니다</p>'}<p class="pl-note">${state.unit==='month'?(openMonth?'마감 후 비교':`비교: ${prior?.months?.join(' · ')||'확인 필요'} (${prior?.count||0}개월 평균)${prior?.partial?' · 일부 매장/월 누락':''}`):`월평균은 자료가 있는 ${monthsCount}개월로 계산합니다. 비율은 원천 합산 후 재계산합니다.`}</p><p class="pl-note">할인액은 참고값으로만 표시합니다. 항목명을 눌러 펼치면 원 단위 근거를 확인할 수 있습니다.</p></section>`;
}
const plRatioTone=(key,value)=>value==null?'none':key==='cogs'?(value>38?'risk':value>35?'warn':'neutral'):key==='labor'?(value>=24.1&&value<=25?'ok':'warn'):'neutral';
function renderPLStoreComparison(state,months) {
  const items=PL_STORES.map(store=>({store,data:aggregatePL(months,store.id)}));
  const selectedIds=plSelectedIds(state.store),selection=aggregatePL(months,state.store);
  const total=selection.calc,totalOpen=state.unit==='month'&&selection.status==='open';
  const totalPrior=state.unit==='month'&&!totalOpen?previousMean(state.period,state.store):null;
  const combined=plIncludesHQ(state)?aggregatePL(months,state.store,{includeHQ:true}):null;
  const hq=combined?.hq;
  const openMonth=state.unit==='month'&&items.some(item=>item.data.status==='open');
  const valueFor=(item,key)=>key==='name'?item.store.name:key==='cogs'||key==='labor'||key==='expense'||key==='margin'?item.data.calc?.ratios?.[key==='margin'?'netProfit':key]:item.data.calc?.[key];
  const key=state.sort.key, dir=state.sort.dir==='asc'?1:-1;
  items.sort((a,b)=>{if(!a.data.calc)return b.data.calc?1:a.store.id.localeCompare(b.store.id);if(!b.data.calc)return -1;const av=valueFor(a,key),bv=valueFor(b,key);return typeof av==='string'?av.localeCompare(bv)*dir:((av??0)-(bv??0))*dir;});
  const cols=[['name','매장'],['sales','매출'],['cogs','원가율'],['labor','인건비율'],['expense','비용률'],['netProfit','점포순수익'],['margin','이익률']];
  return `<section class="panel pl-comparison"><div class="panel-head"><h2>매장별 비교</h2>${state.store!=='all'?'<button type="button" class="btn btn-text" data-pl-action="all">전체로 돌아가기</button>':''}</div><div class="pl-mobile-sort"><label>정렬 <select data-pl-select="sort" aria-label="매장 정렬">${cols.map(([k,l])=>`<option value="${k}" ${k===key?'selected':''}>${l}</option>`).join('')}</select></label><button type="button" class="btn btn-text" data-pl-action="sort-direction">${dir===1?'낮은 순':'높은 순'}</button></div><div class="table-scroll"><table class="pl-store-table"><thead><tr>${cols.map(([k,l])=>`<th scope="col" aria-sort="${key===k?(dir===1?'ascending':'descending'):'none'}"><button type="button" data-pl-sort="${k}">${l}${key===k?dir===1?' ↑':' ↓':''}</button></th>`).join('')}<th scope="col">${state.unit==='month'?(openMonth?'마감 후 비교':'직전 3개월 대비'):'기간 월평균'}</th><th scope="col">연결</th></tr></thead><tbody>${items.map(({store,data})=>{
    const c=data.calc,storeOpen=state.unit==='month'&&data.status==='open',prior=state.unit==='month'&&!storeOpen?previousMean(state.period,store.id):null,expanded=Boolean(state.expanded[`store-${store.id}`]),included=selectedIds.includes(store.id);
    return `<tr data-pl-store="${plEsc(store.id)}" tabindex="0" aria-label="${plEsc(store.name)} 계산서 선택" aria-selected="${included}" class="${included?(state.store==='all'?'':'is-selected '):'pl-store-unselected '}${expanded?'pl-store-expanded':''}"><th scope="row" class="pl-store-name"><label class="pl-store-row-check"><input type="checkbox" data-pl-toggle-store="${plEsc(store.id)}" ${included?'checked':''} aria-label="${plEsc(store.name)} 합산 선택" /><span>${plEsc(store.name)}</span></label>${model.role==='admin'&&data.rows?.some(r=>r.check?.corrected?.length)?'<small class="pl-corrected">일일 급여 합산</small>':''}${!c?'<span class="status" data-s="none">확인 필요</span>':data.complete?'':`<small class="pl-coverage">${plEsc(plCoverage(data)||'일부 자료 누락')}</small>`}</th><td class="pl-store-sales" data-label="매출">${plMoney(c?.sales)}</td>${['cogs','labor','expense'].map(k=>`<td class="pl-store-ratio" data-label="${k==='cogs'?'원가율':k==='labor'?'인건비율':'비용률'}" data-tone="${plRatioTone(k,c?.ratios?.[k])}">${plPercent(c?.ratios?.[k])}</td>`).join('')}<td class="pl-store-net ${c?.netProfit<0?'pl-negative':''}" data-label="점포순수익" title="${plRawMoney(c?.netProfit)}">${plMoney(c?.netProfit)}</td><td class="pl-store-margin" data-label="이익률">${plPercent(c?.ratios?.netProfit)}</td><td class="pl-store-delta" data-label="${state.unit==='month'?'직전 평균 대비':'기간 월평균'}">${state.unit==='month'?(storeOpen?'<span class="pl-muted">마감 후 비교</span>':`${renderPLComparison(c,prior?.calc,'netProfit')}<small>${prior?.count||0}개월 평균</small>`):c?`${plMoney(c.netProfit/data.availableMonths.length)}/월`:'—'}</td><td class="pl-store-link"><button type="button" class="pl-text-link" data-pl-action="select-store" data-store="${plEsc(store.id)}">계산서 보기</button><button type="button" class="pl-mobile-expand" data-pl-expand="store-${store.id}" aria-expanded="${expanded}">${expanded?'비율 접기':'비율 펼치기'}</button></td></tr>`;
  }).join('')}</tbody><tfoot class="pl-selection-total"><tr><th scope="row">선택 ${selectedIds.length}곳 합계</th><td data-label="매출">${plMoney(total?.sales)}</td>${['cogs','labor','expense'].map(k=>`<td data-label="${k==='cogs'?'원가율':k==='labor'?'인건비율':'비용률'}">${plPercent(total?.ratios?.[k])}</td>`).join('')}<td data-label="점포순수익">${plMoney(total?.netProfit)}</td><td data-label="이익률">${plPercent(total?.ratios?.netProfit)}</td><td data-label="${state.unit==='month'?'직전 평균 대비':'기간 월평균'}">${state.unit==='month'?(totalOpen?'<span class="pl-muted">마감 후 비교</span>':renderPLComparison(total,totalPrior?.calc,'netProfit')):total?`${plMoney(total.netProfit/selection.availableMonths.length)}/월`:'—'}</td><td></td></tr>${combined?`<tr class="pl-hq-row"><th scope="row">본부 순수익</th><td colspan="4"></td><td data-label="본부 순수익">${plMoney(hq?.calc?.netProfit)}</td><td colspan="3"></td></tr><tr class="pl-hq-final-row"><th scope="row">${state.store==='all'?'회사 전체':'선택 매장 + 본부'}</th><td colspan="4"></td><td class="pl-hq-final-net" data-label="최종 순수익">${plMoney(combined.finalNet)}</td><td colspan="3"></td></tr>`:''}</tfoot></table></div><p class="pl-store-scope-note pl-note">합산 범위: ${plEsc(plStoreName(state.store))}${plCoverage(selection)?` · ${plEsc(plCoverage(selection))}`:''}</p><p class="pl-note">원가율: 35% 초과 주의 · 38% 초과 위험. 인건비율: 평가 만점 24.10~25.00% 정상, 나머지 주의(위험색 경계 미확정). 비용률은 기준 미확정으로 중립 표시.</p></section>`;
}
function plTrendMonths(anchor) {
  const [year,month]=anchor.split('-').map(Number);
  return Array.from({length:12},(_,i)=>{const d=new Date(Date.UTC(year,month-12+i,1));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;});
}
// Both axes use 1/2/5 × 10^n steps and three or four ticks, including zero.
function plNiceAxis(values) {
  const finite=values.filter(value=>value!=null&&Number.isFinite(value));
  const low=Math.min(0,...finite),high=Math.max(0,...finite);
  if(low===0&&high===0)return {min:0,max:2,step:1,ticks:[0,1,2]};
  const exponent=Math.floor(Math.log10(high-low));
  for(let power=exponent-2;power<=exponent+2;power++)for(const factor of [1,2,5]) {
    const step=factor*10**power;
    let min=Math.floor(low/step)*step,max=Math.ceil(high/step)*step;
    let count=Math.round((max-min)/step)+1;
    if(count===2){max+=step;count++;}
    if(count>=3&&count<=4)return {min,max,step,ticks:Array.from({length:count},(_,i)=>Number((min+i*step).toPrecision(12)))};
  }
  throw new Error('Cannot derive chart axis');
}
function renderPLTrend(state,device,months) {
  const all=plTrendMonths(state.anchorMonth||state.period.slice(0,7)),shown=device==='mobile'&&!state.trendFull?all.slice(-6):all;
  const includeHQ=plIncludesHQ(state);
  const values=shown.map(month=>{
    const data=aggregatePL([month],state.store,{includeHQ});
    const profit=includeHQ?data.finalNet:data.calc?.netProfit;
    const profitMissing=profit==null,profitStatus=profitMissing?'none':data.status==='open'||data.hq?.status==='open'?'open':'closed';
    return {month,data,profit,profitMissing,profitStatus};
  });
  const selectedMonth=shown.includes(state.chartMonth)?state.chartMonth:shown.at(-1),selected=aggregatePL([selectedMonth],state.store,{includeHQ});
  const selectedProfit=includeHQ?selected.finalNet:selected.calc?.netProfit;
  const selectedStatus=selected.status==='open'||selected.hq?.status==='open'?'open':selected.status;
  const stepX=1000/shown.length;
  const salesAxis=plNiceAxis(values.map(v=>v.data.calc?.sales==null?null:v.data.calc.sales/10000));
  const closedProfitValues=values.filter(v=>v.profitStatus==='closed'&&!v.profitMissing).map(v=>v.profit/10000);
  const profitAxis=plNiceAxis(closedProfitValues);
  const monthTicks=`<div class="pl-chart-month-ticks" aria-hidden="true" data-pl-style="grid-template-columns:repeat(${shown.length},minmax(0,1fr))">${shown.map(m=>`<span data-month="${m}">${Number(m.slice(-2))}</span>`).join('')}</div>`;
  const plot=(kind,axis,height)=>{
    const plotValues=values.map(v=>({...v,missing:kind==='sales'?!v.data.calc:v.profitMissing,status:kind==='sales'?v.data.status:v.profitStatus}));
    const y=value=>height-8-(value-axis.min)/(axis.max-axis.min)*(height-16);
    const pointY=value=>y(kind==='profit'?Math.max(axis.min,Math.min(axis.max,value)):value);
    const grid=axis.ticks.map(t=>`<line x1="0" x2="1000" y1="${y(t)}" y2="${y(t)}" class="${kind==='profit'&&t===0?'pl-chart-zero':'pl-chart-grid'}"/>`).join('');
    const bands=plotValues.map(({month,data,missing},i)=>`<g>${months.includes(month)?`<rect x="${i*stepX}" y="0" width="${stepX}" height="${height}" class="pl-chart-selected"/>`:''}${month===selectedMonth?`<rect x="${i*stepX+2}" y="1" width="${stepX-4}" height="${height-2}" class="pl-chart-chosen"/>`:''}${missing?`<rect x="${i*stepX+stepX*.2}" y="0" width="${stepX*.6}" height="${height}" fill="url(#pl-hatch-${device}-${kind})" class="pl-chart-missing"/>`:''}</g>`).join('');
    const marks=plotValues.map(({month,data,profit,missing,status},i)=>{
      const c=data.calc;if(missing)return '';
      const x=(i+.5)*stepX,open=status==='open';
      const accessible=open?', 집계 중, 마감 전 일부 값':'';
      if(kind==='sales')return `<rect x="${i*stepX+stepX*.25}" y="${y(c.sales/10000)}" width="${stepX*.5}" height="${Math.max(0,y(0)-y(c.sales/10000))}" class="pl-chart-sales ${open?'pl-chart-open':''}" data-month="${month}" data-status="${data.status}" aria-label="${month} 매출 ${plRawMoney(c.sales)}${accessible}"/>`;
      return `<ellipse cx="${x}" cy="${pointY(profit/10000)}" rx="8" ry="3" class="${open?'pl-chart-dot-open':profit<0?'pl-chart-negative':'pl-chart-dot'}" data-month="${month}" data-status="${status}" aria-label="${month} ${includeHQ?'점포+본부 순수익':'점포순수익'} ${plRawMoney(profit)}${accessible}"/>`;
    }).join('');
    const path=kind==='profit'?plotValues.slice(1).map((v,i)=>{
      const prev=plotValues[i];if(v.missing||prev.missing)return '';
      return `<path d="M${(i+.5)*stepX},${pointY(prev.profit/10000)} L${(i+1.5)*stepX},${pointY(v.profit/10000)}" class="pl-chart-profit ${prev.status==='open'||v.status==='open'?'pl-chart-profit-open':''}" data-month="${v.month}" data-from="${prev.month}" data-to="${v.month}" data-status="${v.status}"/>`;
    }).join(''):'';
    const ticks=axis.ticks.map(t=>`<span class="pl-chart-axis-tick" data-pl-tick="${t}" data-step="${axis.step}" data-pl-style="top:${y(t)}px">${plNumber(t)}</span>`).join('');
    const missing=plotValues.map(({missing,data},i)=>missing?`<span class="pl-chart-no-data" data-pl-style="left:${(i+.5)/shown.length*100}%">${'확인<br>필요'}</span>`:'').join('');
    const openLabels=plotValues.map(({month,status,missing},i)=>status==='open'&&!missing?`<span class="pl-chart-open-label" data-month="${month}" data-status="open" data-pl-style="left:clamp(18px,${(i+.5)/shown.length*100}%,calc(100% - 18px))">집계 중</span>`:'').join('');
    const clampedLabels=kind==='profit'?plotValues.map(({month,status,profit},i)=>{
      const amount=profit;
      if(status!=='open'||amount==null||amount/10000>=axis.min&&amount/10000<=axis.max)return '';
      return `<span class="pl-chart-clamped-value" data-month="${month}" data-pl-style="${i<shown.length/2?'left:0;text-align:left':'right:0;text-align:right'};top:${pointY(amount/10000)}px">${plMoney(amount)}</span>`;
    }).join(''):'';
    return `<div class="pl-chart-region" data-pl-region="${kind}" data-pl-axis="${kind}" data-min="${axis.min}" data-max="${axis.max}"><h3>${kind==='sales'?'매출':includeHQ?'점포+본부 순수익':'점포순수익'} <small>만원</small></h3><div class="pl-chart-plot" data-pl-style="height:${height}px"><svg viewBox="0 0 1000 ${height}" preserveAspectRatio="none" role="img" aria-label="${kind==='sales'?'월별 매출 막대':'월별 점포순수익 선과 0 기준선'}"><defs><pattern id="pl-hatch-${device}-${kind}" width="24" height="6" patternUnits="userSpaceOnUse"><path d="M0 6L24 0" class="pl-chart-grid"/></pattern></defs>${bands}${grid}${path}${marks}</svg>${ticks}${missing}${openLabels}${clampedLabels}</div>${monthTicks}${kind==='profit'&&!closedProfitValues.length?'<p class="pl-note">마감 월 자료 없음 · 순수익 축 미확정</p>':''}</div>`;
  };
  const compact=device==='mobile'&&!state.trendFull;
  const labels=shown.map((m,i)=>{
    const status=includeHQ?values[i].profitStatus:values[i].data.status;
    const year=i===0||m.slice(0,4)!==shown[i-1].slice(0,4)?m.slice(0,4):null;
    return `<button type="button" class="pl-chart-month-button" data-pl-chart="${m}" aria-label="${m.slice(0,4)}년 ${Number(m.slice(-2))}월 원자료 확인${status==='open'?', 집계 중, 마감 전 일부 값':''}" title="${status==='open'?'집계 중, 마감 전 일부 값':'월별 원자료 확인'}" aria-pressed="${selectedMonth===m}" data-pl-style="--month-x:${(i+.5)/shown.length*100}%;--month-top:${device==='mobile'?Math.floor(i/5)*44:0}px;--month-width:${100/shown.length}%"><span class="pl-chart-month-label">${Number(m.slice(-2))}월</span></button>${year?`<span class="pl-chart-year" data-pl-style="left:${(i+.5)/shown.length*100}%;--year-top:${device==='mobile'?(Math.ceil(shown.length/5)*44+5):46}px">${year}</span>`:''}`;
  }).join('');
  return `<section class="panel pl-trend"><div class="panel-head"><h2>${shown.length}개월 추이</h2>${device==='mobile'?`<button type="button" class="btn btn-text" data-pl-action="trend">${state.trendFull?'6개월 보기':'12개월 보기'}</button>`:''}</div><p class="pl-chart-key"><span>막대 매출</span><span>선 ${includeHQ?'점포+본부 순수익':'점포순수익'}</span><small>단위: 만원 · 위아래 별도 축 · 선택 기간 배경 강조</small><small class="pl-chart-open-legend">흐린 막대·빈 점 = 집계 중(마감 전 일부 값)</small></p><div class="pl-chart-scroll ${state.trendFull?'pl-chart-full':''}"><div class="pl-chart-layout ${compact?'pl-chart-compact':''}" data-device="${device}">${plot('sales',salesAxis,95)}${plot('profit',profitAxis,150)}<p class="pl-chart-month-picker-label">원자료 볼 달 <small>${shown[0]} ~ ${shown.at(-1)}</small></p><div class="pl-chart-xaxis" role="group" aria-label="원자료 볼 달">${labels}</div></div></div><div class="pl-chart-evidence" aria-live="polite"><strong>${selectedMonth} · ${selectedStatus==='open'?'집계 중':selected.calc?'확인 자료':'확인 필요'}</strong><dl><div><dt>매출</dt><dd>${plRawMoney(selected.calc?.sales)}</dd></div><div><dt>${includeHQ?'점포+본부 순수익':'순수익'}</dt><dd>${plRawMoney(selectedProfit)}</dd></div><div><dt>이익률</dt><dd>${plPercent(includeHQ?(selectedProfit==null||!selected.calc?.sales?null:selectedProfit/selected.calc.sales*100):selected.calc?.ratios?.netProfit)}${selectedStatus==='open'?' (일부 값)':''}</dd></div></dl>${includeHQ?`<p class="pl-note">이익률 = 점포+본부 순수익 ÷ 선택 점포 매출${selectedProfit==null?(!selected.hq?.complete?' · 본부 자료 없음':' · 점포 자료 없음'):''}</p>${selected.hq&&!selected.hq.complete?`<p class="pl-coverage">본부 ${plEsc(plCoverage(selected.hq)||'확인 필요')}</p>`:''}`:''}${plCoverage(selected)?`<p class="pl-coverage">${plEsc(plCoverage(selected))}</p>`:''}</div></section>`;
}
function renderPLDataStatus(state,data) {
  return `<section class="panel pl-data-status"><div class="panel-head"><h2>데이터 상태</h2><span class="status" data-s="${data.status==='open'?'pend':data.complete?'ok':'none'}">${data.status==='open'?'집계 중':data.complete?'마감 완료':'일부 자료 없음'}</span></div><dl><div><dt>기간</dt><dd>${plPeriodLabel(state.unit,state.period)}</dd></div><div><dt>자료 있는 달</dt><dd>${data.availableMonths.length}/${data.months.length}개월</dd></div><div><dt>합산 범위</dt><dd>${plEsc(plStoreName(state.store))}</dd></div></dl>${plCoverage(data)?`<p class="pl-coverage">${plEsc(plCoverage(data))}</p>`:''}${data.missingCells?.length?`<details><summary>누락 근거 ${data.missingCells.length}건</summary><ul>${data.missingCells.map(c=>`<li>${c.month} · ${plEsc(plStoreName(c.store))}</li>`).join('')}</ul></details>`:''}<p class="pl-note">원자료가 없는 매장·월은 합계와 평균에서 제외합니다.</p>${[...(data.checkMessages||[]),...model.integrated.filter(r=>data.months.includes(r.month)&&r.message).map(r=>r.message)].length?`<p class="pl-coverage">${model.role==='admin'?[...new Set([...(data.checkMessages||[]),...model.integrated.filter(r=>data.months.includes(r.month)&&r.message).map(r=>r.message)])].map(plEsc).join(' · '):'일부 매장 자료 확인 중'}</p>`:''}</section>`;
}
function renderPLApp(device,state) {
 const months=periodMonths(state.unit,state.period),data=aggregatePL(months,state.store);
 return `<div class="pl-shell" data-pl-theme="${state.theme==='dark'?'dark':'light'}">${renderPLHeader(state,data)}<div class="pl-content">${renderPLStatement(state,data)}${renderPLStoreComparison(state,months)}${renderPLTrend(state,device,months)}${renderPLDataStatus(state,data)}</div></div>`;
}
return {renderPLApp,plEsc,plMoney,plSelectedIds,plTrendMonths,plPeriodLabel};
}
