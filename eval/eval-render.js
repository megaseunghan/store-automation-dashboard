const SCORE_KEYS=['sales','cost','labor','ops','mkt','hit','rnd','ceo'];
const RATIO_KEYS=['sales','cost','labor','hit'];
const STORES=new Set(['haenggung','sindong','paldal','simgeum','sasek','yamiok']);
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const numeric=value=>finite(value)?value:null;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>finite(value)?value.toLocaleString('ko-KR',{maximumFractionDigits:2}):'—';
const percent=value=>finite(value)?`${number(value)}%`:'—';
const money=value=>finite(value)?`${number(value)}원`:'확인 필요';
const signed=value=>finite(value)?`${value>0?'+':''}${number(value)}`:'—';
const MISSING_LABELS={mkt:'마케팅',facility:'시설관리',cleaning:'요일별 청소'};
const UNAVAILABLE_LABELS={sales:'목표 산출 불가',cost:'원가율 확인 필요',labor:'인건비율 확인 필요',hit:'적중률 확인 필요'};

// Display tables are supplied by the server for this store and policy month.
const safeBand=band=>Array.isArray(band)&&band.length===3&&(band[0]===null||finite(band[0]))&&(band[1]===null||finite(band[1]))&&finite(band[2]);
const inBand=(value,[min,max])=>finite(value)&&(min===null||value>=min)&&(max===null||value<=max);
const bandLabel=([min,max],unit='%')=>min===null?`${number(max)}${unit} 이하`:max===null?`${number(min)}${unit} 이상`:`${number(min)}–${number(max)}${unit}`;
function nextBandNote(bands,value,score,position,unit='%p'){
 if(position?.next&&finite(position.next.delta)&&finite(position.next.score))return `다음 구간 ${number(position.next.score)}점까지 ${position.next.delta<0?'−':position.next.delta>0?'+':''}${number(Math.abs(position.next.delta))}${unit}`;
 if(!finite(value)||!finite(score))return '구간 확인 필요';
 return bands.length&&score===Math.max(...bands.map(b=>b[2]))?'최고 점수 구간':'다음 구간 확인 필요';
}

/** Keep only presentation fields, even if an admin-shaped response reaches a viewer. */
export function adaptEvaluationResponse(response,{role='viewer'}={}){
 if(!response||!/^\d{4}-(0[1-9]|1[0-2])$/.test(response.month)||!Array.isArray(response.rows))throw new Error('평가 자료 형식을 확인해 주세요.');
 const admin=role==='admin',names=new Map((response.stores||[]).filter(s=>STORES.has(s.id)).map(s=>[s.id,s.name]));
 const seen=new Set();
 const rows=response.rows.filter(row=>STORES.has(row.store)&&!seen.has(row.store)&&seen.add(row.store)).map(row=>{
  const scores=Object.fromEntries(SCORE_KEYS.map(key=>[key,numeric(row.scores?.[key])]));
  const ratios=Object.fromEntries(RATIO_KEYS.map(key=>[key,numeric(row.ratios?.[key])]));
  const result={store:row.store,name:String(row.name||names.get(row.store)||row.store),month:response.month,scores,ratios,
   manual:{facility:numeric(row.inputs?.facility),cleaning:numeric(row.inputs?.cleaning)},
   total:numeric(row.total),adjustments:numeric(row.adjustments),tier:Object.fromEntries((admin?['total','goFo','o','p']:['total']).map(key=>[key,numeric(row.tier?.[key])])),
   missing:(Array.isArray(row.missing)?row.missing:[]).filter(key=>Object.hasOwn(MISSING_LABELS,key)),
   unavailable:(Array.isArray(row.unavailable)?row.unavailable:[]).filter(key=>Object.hasOwn(UNAVAILABLE_LABELS,key)),
   invalidInputs:(Array.isArray(row.invalidInputs)?row.invalidInputs:[]).filter(key=>['facility','cleaning'].includes(key)),
   positions:Object.fromEntries(RATIO_KEYS.map(key=>[key,{value:numeric(row.positions?.[key]?.value),score:numeric(row.positions?.[key]?.score),next:row.positions?.[key]?.next?{score:numeric(row.positions[key].next.score),value:numeric(row.positions[key].next.value),delta:numeric(row.positions[key].next.delta)}:null}])),
   policy:{id:row.policy?.id==='revised-2026-10'?'revised-2026-10':'legacy',label:row.policy?.id==='revised-2026-10'?'2026.10 개정 기준':'이전 기준'},
   ruleBands:Object.fromEntries(RATIO_KEYS.map(key=>[key,(Array.isArray(row.ruleBands?.[key])?row.ruleBands[key]:[]).filter(safeBand).map(band=>band.slice())])),
   incentiveStart:typeof row.incentiveStart==='string'&&/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(row.incentiveStart)?row.incentiveStart:null,
   beforeIncentiveStart:row.beforeIncentiveStart===true,
   costAgreed:row.costAgreed===true,
   costAgreement:{required:row.costAgreement?.required===true,completed:row.costAgreement?.completed===true,pending:row.costAgreement?.pending===true},
   provisionalReasons:(Array.isArray(row.provisionalReasons)?row.provisionalReasons:[]).filter(reason=>reason==='cost-agreement'),
   status:['ok','provisional','incomplete','missing','mapping','duplicate'].includes(row.status)?row.status:'incomplete',
   check:{state:['ok','provisional','incomplete','missing','mapping','duplicate'].includes(row.check?.state)?row.check.state:'incomplete'},
   incentive:{state:['ok','provisional','incomplete'].includes(row.incentive?.state)?row.incentive.state:'incomplete'},
   ...(row.message?{message:admin?String(row.message):'일부 매장 자료 확인 중'}:{})};
  if(admin){result.targetSales=numeric(row.targetSales);result.financials=Object.fromEntries(['sales','cogs','labor','netProfit'].map(key=>[key,numeric(row.financials?.[key])]));result.incentive={...result.incentive,total:numeric(row.incentive?.total),allocations:Object.fromEntries(['goFo','o','p'].map(key=>[key,numeric(row.incentive?.allocations?.[key])]))};}
  return result;
 });
 return {month:response.month,rows,role:admin?'admin':'viewer',fetchedAt:typeof response.fetchedAt==='string'?response.fetchedAt:null};
}
const missing=value=>value===null?'<span class="eval-missing">—<span class="visually-hidden"> 미입력 또는 확인 필요</span></span>':number(value);
const rowState=row=>row.status==='provisional'?'잠정':row.status==='ok'?'계산 완료':row.check.state==='mapping'?'연결 필요':'확인 필요';
const rowIssues=row=>[...row.missing.map(key=>`${MISSING_LABELS[key]} 미입력`),...row.unavailable.map(key=>UNAVAILABLE_LABELS[key]),...row.invalidInputs.map(key=>`${MISSING_LABELS[key]} 입력 범위 확인 필요`),...(row.message?[row.message]:[])];
function tierText(row){if(row.beforeIncentiveStart&&row.incentiveStart)return `${['sasek','yamiok'].includes(row.store)?'오픈 6개월 후부터':'인센티브 시작 전'} (${row.incentiveStart.slice(0,7)})`;return finite(row.tier.total)?`${percent(row.tier.total)} 구간`:'구간 확인 필요';}
function marketingLink(row){return `?${new URLSearchParams({view:'dashboard',month:row.month,marketingStore:row.store})}`;}

export function renderEvaluation(model,state){
 const sort=['total','sales','cost','labor','ops','mkt'].includes(state.sort)?state.sort:'total';
 const rows=model.rows.map((row,index)=>({row,index})).sort((a,b)=>{
  const x=sort==='total'?a.row.total:a.row.scores[sort],y=sort==='total'?b.row.total:b.row.scores[sort];return x===null&&y!==null?1:y===null&&x!==null?-1:((y??0)-(x??0)||a.index-b.index);
 }).map(item=>item.row);
 const missingStores=model.rows.filter(row=>row.missing.length).length,problemStores=model.rows.filter(row=>rowIssues(row).length||row.status!=='ok').length;
 const calculated=model.rows.length>0&&model.rows.every(row=>finite(row.total));
 const review=missingStores?`검토 중 · 미입력 ${missingStores}곳`:problemStores?`검토 중 · 자료 확인 ${problemStores}곳`:'검토 완료';
 const ruleNote=model.rows[0]?.policy.id==='revised-2026-10'?"점수·인센티브는 노션 'DB. 종합 평가' 규칙(HR북 기준 통일)으로 계산합니다.":"점수·인센티브는 해당 월 매장의 이전 노션 'DB. 종합 평가' 규칙으로 계산합니다.";
 const heading=calculated?review:'산출 확인 필요';
 const totalRows=rows.map(row=>{
  const pending=row.status!=='ok',rank=finite(row.total)&&!pending?rows.filter(other=>other.status==='ok'&&finite(other.total)&&other.total>row.total).length+1:null;
  const adj=row.adjustments;
  return `<tr data-eval-store="${esc(row.store)}" tabindex="0" aria-label="${esc(row.name)} 종합평가 상세" class="${pending?'is-pending':''}"><th scope="row"><span class="eval-store-name">${esc(row.name)}</span><span class="eval-row-state">${rank?`${rank}위 · `:''}${rowState(row)}</span>${row.missing.length?`<span class="eval-input-badge">미입력 ${row.missing.length}</span>`:''}${row.costAgreement.pending?'<span class="eval-input-badge eval-cost-agreement-badge">본부 협의 필요</span>':''}</th>${[['sales','매출'],['cost','원가'],['labor','인건'],['ops','운영']].map(([key,label])=>`<td data-label="${label}" class="eval-number">${missing(row.scores[key])}</td>`).join('')}<td data-label="마케팅" class="eval-number"><a class="eval-marketing-link" href="${esc(marketingLink(row))}" data-view-link="dashboard" aria-label="${esc(row.name)} 마케팅 상세">${missing(row.scores.mkt)}<span class="eval-link-hint">상세</span></a></td><td data-label="가감" class="eval-number">${adj===null?missing(null):signed(adj)}</td><td data-label="총점" class="eval-total"><strong>${missing(row.total)}</strong><span>${esc(tierText(row))}</span>${pending?'<small>잠정 · 자료 확인</small>':''}</td></tr>`;
 }).join('');
 return `<div class="eval-shell"><div class="eval-controls"><label>평가 월<input type="month" data-eval-month value="${esc(state.month)}" aria-label="평가 월"></label><label>정렬<select data-eval-sort aria-label="종합평가 정렬">${[['total','종합 점수'],['sales','매출'],['cost','원가'],['labor','인건'],['ops','운영'],['mkt','마케팅']].map(([key,label])=>`<option value="${key}" ${key===sort?'selected':''}>${label}</option>`).join('')}</select></label></div><section class="eval-panel eval-status" aria-labelledby="eval-status-heading"><div class="eval-status-top"><div><p class="eval-kicker">${esc(model.month)} 종합평가</p><h2 id="eval-status-heading">${esc(heading)}</h2><p class="eval-status-why">${problemStores?`자료 확인 ${problemStores}곳 · 확인되지 않은 항목은 0으로 채우지 않습니다.`:'연결된 자료와 필수 입력을 확인했습니다.'}</p></div><ol class="eval-stepper" aria-label="평가 단계">${['산출','검토','대표 승인','확정'].map((label,index)=>`<li class="${index===0?(calculated?'is-done':'is-current'):index===1&&calculated?(problemStores?'is-current':'is-done'):'is-future'}" ${index>1?'aria-disabled="true"':''}><span>${index+1}</span>${label}${index>1?'<small>다음 단계</small>':''}</li>`).join('')}</ol></div><p class="eval-rule-note">${esc(ruleNote)}</p></section><section class="eval-panel eval-table" aria-labelledby="eval-table-heading"><div class="eval-panel-head"><h2 id="eval-table-heading">매장별 점수 <small>${rows.length}곳</small></h2><span>높은 순</span></div>${rows.length?`<table class="eval-score-table"><thead><tr><th scope="col">매장</th>${[['매출','20+5'],['원가','15+3'],['인건','15'],['운영','20'],['마케팅','30']].map(([label,max])=>`<th scope="col">${label}<small>${max}</small></th>`).join('')}<th scope="col">가감</th><th scope="col">총점·구간</th></tr></thead><tbody>${totalRows}</tbody></table>`:'<p class="eval-empty">이 달의 종합평가 자료를 확인해 주세요.</p>'}<p class="eval-table-foot">가감 = 매출 적중 + R&D + 대표 지시 차감. 잠정 점수는 확인된 항목의 소계이며, 미입력 항목이 있는 매장은 순위를 확정하지 않습니다.</p></section></div>`;
}

function renderBand(key,row,label){
 const value=row.ratios[key],score=row.scores[key],max={sales:25,cost:18,labor:15,hit:5}[key],bands=row.ruleBands[key];
 const legacyHit=key==='hit'&&row.policy.id==='legacy',costPending=key==='cost'&&row.costAgreement.pending;
 const rawValue=legacyHit?(finite(value)?`비율 원값 ${number(value)}`:'—'):percent(value);
 const agreement=key==='cost'&&row.policy.id==='revised-2026-10'?`<p class="eval-agreement-status"><span aria-hidden="true">${row.costAgreed?'☑':'☐'}</span> 원가 본부 협의 완료: ${row.costAgreed?'체크':'미체크'}${row.costAgreement.pending?' · 본부 협의 필요 · 15점(기본 만점), 협의 완료 시 18점(15+3)':''}</p>`:'';
 return `<section class="eval-detail-block"><h3>${label} <strong>${missing(score)}<small>/${max}</small></strong></h3><p class="eval-basis-value">${rawValue} → ${finite(score)?`${number(score)}점`:'확인 필요'}</p>${agreement}${legacyHit?'<p class="eval-next-band">이전 기준은 적중 비율 원값을 그대로 구간과 비교합니다.</p>':''}<p class="eval-next-band">${costPending?'본부 협의 완료 시 가산 3점을 적용합니다.':esc(nextBandNote(bands,value,score,row.positions[key],legacyHit?' (비율 원값)':'%p'))}</p><details class="eval-band-details"><summary>${label} 구간표</summary>${bands.length?`<table><thead><tr><th>${legacyHit?'비율 원값 구간':'비율 구간'}</th><th>점수</th></tr></thead><tbody>${bands.map(b=>`<tr class="${inBand(value,b)&&score===b[2]?'is-applied':''}"><td>${bandLabel(b,legacyHit?'':'%')}</td><td>${b[2]}${inBand(value,b)&&score===b[2]?' · 적용':''}</td></tr>`).join('')}<tr class="${score===0?'is-applied':''}"><td>그 밖</td><td>0${score===0?' · 적용':''}</td></tr></tbody></table>`:'<p class="eval-next-band">구간표 확인 필요</p>'}</details></section>`;
}
function renderAdmin(row){
 const incentiveState=row.beforeIncentiveStart?'인센티브 시작 전 · 지급액은 0원입니다.':row.incentive.state==='provisional'?'잠정 · 필수 입력 확인 전 계산값입니다.':row.incentive.state==='incomplete'?'자료 확인 필요':'계산값 · 대표 승인·확정 전';
 return `<section class="eval-detail-block eval-admin"><h3>손익 원값</h3><dl>${[['목표 매출액',row.targetSales],['당월 총 매출',row.financials.sales],['당월 총 매입',row.financials.cogs],['당월 인건비',row.financials.labor],['당월 순수익',row.financials.netProfit]].map(([label,value])=>`<div><dt>${label}</dt><dd>${money(value)}</dd></div>`).join('')}</dl></section><section class="eval-detail-block eval-admin"><h3>인센티브 · ${esc(tierText(row))}</h3><p class="eval-incentive-state">${incentiveState}</p><dl><div class="eval-incentive-total"><dt>총액</dt><dd>${money(row.incentive.total)}</dd></div>${[['goFo','GO/FO'],['o','O · 직원'],['p','P · 파트']].map(([key,label])=>`<div><dt>${label} ${percent(row.tier[key])}</dt><dd>${money(row.incentive.allocations[key])}</dd></div>`).join('')}</dl></section>`;
}
export function renderEvaluationDetail(model,row){
 const issues=rowIssues(row),admin=model.role==='admin';
 return `<header class="eval-detail-head"><div><p class="eval-kicker">${esc(row.month)} 종합평가</p><p class="eval-policy-label">${esc(row.policy.label)}</p><h2 id="eval-detail-title">${esc(row.name)}</h2></div><button type="button" data-eval-action="close" aria-label="종합평가 상세 닫기">닫기</button></header><div class="eval-detail-score"><strong>${missing(row.total)}<small>점</small></strong><span class="eval-state">${rowState(row)} · ${esc(tierText(row))}</span></div>${issues.length?`<ul class="eval-issues">${issues.map(text=>`<li>${esc(text)}</li>`).join('')}</ul>`:''}<div class="eval-detail-basis">${renderBand('sales',row,'목표 매출 달성률')}${renderBand('cost',row,'매출원가율')}${renderBand('labor',row,'인건비율')}${renderBand('hit',row,'예상 매출 적중률')}<section class="eval-detail-block"><h3>운영·마케팅·가감 근거</h3><dl class="eval-manual-basis">${[['시설관리',row.manual.facility,'/10'],['요일별 청소',row.manual.cleaning,'/10'],['운영',row.scores.ops,'/20'],['마케팅',row.scores.mkt,'/30'],['R&D',row.scores.rnd,''],['대표 지시 차감',row.scores.ceo,'']].map(([label,value,max])=>`<div><dt>${label}</dt><dd>${missing(value)}<small>${max}</small></dd></div>`).join('')}</dl>${row.policy.id==='legacy'&&['sasek','yamiok'].includes(row.store)?'<p class="eval-next-band">이전 기준 원본 수식은 R&D를 총점에 포함하지 않습니다.</p>':''}<a class="eval-marketing-link" href="${esc(marketingLink(row))}" data-view-link="dashboard">${esc(row.name)} 마케팅 상세 보기</a></section></div>${admin?renderAdmin(row):'<p class="eval-viewer-note">조회 화면에서는 점수·비율·구간만 표시합니다.</p>'}`;
}
