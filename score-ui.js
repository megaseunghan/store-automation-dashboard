import {marketingScore,SCORE_BANDS,bonusReason} from './scoring.js?v=9e9bcb948d44';
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const num=n=>Number.isFinite(n)?n.toLocaleString('ko-KR',{maximumFractionDigits:2}):'미확인';
const signed=n=>n>0?'+'+n:String(n);
const day=t=>{const d=new Date(t);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit'}).format(d):'게시일 미확인';};
export function createScoreWorkspace({api,stores}){
 let sequence=0;const cache=new Map(),opened=new Set();
 async function report(id){if(!cache.has(id))cache.set(id,api('/api/report/'+id).catch(e=>{cache.delete(id);throw e;}));return cache.get(id);}
 async function render(snapshot,month,target){
  const current=++sequence;target.replaceChildren(node('p','점수와 게시물을 확인하고 있어요.','loading-text'));target.setAttribute('aria-busy','true');
  const periodReports=snapshot.reports.filter(r=>r.month===month).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const latest=new Map();for(const r of periodReports)for(const x of r.results){const key=x.store+':'+x.platform;if(!latest.has(key))latest.set(key,{id:r.id,platform:x.platform,store:x.store});}
  if(!latest.size){target.replaceChildren(node('p','이 달의 수집 자료가 아직 없습니다.','empty'));target.setAttribute('aria-busy','false');return;}
  const ids=[...new Set([...latest.values()].map(x=>x.id))];
  const [facts,...runs]=await Promise.allSettled([api('/api/score-inputs?month='+encodeURIComponent(month)),...ids.map(report)]);
  if(current!==sequence)return;
  const inputs=facts.status==='fulfilled'?facts.value:{month,reviews:{},previousActivity:{}};
  const full=new Map();runs.forEach((r,index)=>{if(r.status==='fulfilled')full.set(ids[index],r.value);});
  const results=[...latest.values()].flatMap(x=>{const run=full.get(x.id);const row=run?.results.find(r=>r.store===x.store&&r.platform===x.platform);return row?[{...row,month:run.month}]:[];});
  const grid=node('div',undefined,'score-grid');
  for(const store of stores()){
   const s=marketingScore(store,month,results,inputs);const card=node('article',undefined,'score-card');
   const head=node('div',undefined,'score-card-head');head.append(node('h3',store.name),node('span',s.state,'score-state'));card.append(head);
   const score=node('div',undefined,'score-number');score.append(node('strong',s.total===null?'—':num(s.total)),node('span','점'));card.append(score);
   card.append(node('p',s.total===null?'확인 후 점수를 표시해요.':'기본 30점 + 가산 / 미확인 항목 제외','score-caption'));
   const breakdown=node('dl',undefined,'score-breakdown');for(const [label,value] of [['네이버',s.reviewPoints],['SNS',s.sns],['가산점',s.complete?s.bonus:null]]){const item=node('div');item.append(node('dt',label),node('dd',value===null?'확인 중':(label==='가산점'?signed(value):num(value))+'점'));if(label==='가산점'&&s.complete&&!s.bonusComplete)item.append(node('span','추가 확인','score-note'));breakdown.append(item);}card.append(breakdown);
   const details=node('details',undefined,'score-detail');details.open=opened.has(store.id);details.addEventListener('toggle',()=>{if(details.isConnected){if(details.open)opened.add(store.id);else opened.delete(store.id);}});const summary=node('summary');summary.setAttribute('aria-label',store.name+' 점수 근거와 게시물');summary.append(node('span','점수 근거와 게시물'),node('span',s.count===null?'확인 중':s.count+'건','score-count'));details.append(summary);
   const why=node('div',undefined,'score-reasons');why.append(node('h4','이렇게 계산했어요'));
   why.append(node('p',s.reviewPoints===null?'네이버 리뷰: 해당 월 자료 확인 필요':`네이버 리뷰 ${s.reviewCount}건 → ${s.reviewCount>=100?'100건 이상':s.reviewCount>=80?'80~99건':s.reviewCount>=60?'60~79건':s.reviewCount>=40?'40~59건':s.reviewCount>=20?'20~39건':s.reviewCount>=10?'10~19건':'0~9건'} 구간 ${s.reviewPoints}점`));why.append(node('p',s.reason));
   const band=SCORE_BANDS.find(b=>b.grade===s.performanceGrade);if(band)why.append(node('p',`성과 ${band.grade} 기준: 평균 조회 ${num(band.views)}회 이상 / 저장+공유 ${num(band.actions)}회 이상`,'score-note'));
   if(s.count>0){why.append(node('p',`조회 평균 ${num(s.viewAverage)}회`));why.append(node('p',`저장+공유 평균 ${num(s.actionAverage)}회${s.actionMissing?' 이상 (확인된 수치 기준)':''}`));}
   why.append(node('p',s.complete?`콘텐츠별 가산점 합계 ${signed(s.bonus)}점${!s.bonusComplete?' / 미확인 항목 있음':''}`:'콘텐츠 목록 확인 후 가산점 계산'));
   for(const note of s.notes)why.append(node('p',note,'score-note'));if(facts.status==='rejected')why.append(node('p','리뷰 점수 근거를 불러오지 못했습니다. 새로고침해 주세요.','score-note'));details.append(why);
   const posts=node('div',undefined,'score-posts');posts.append(node('h4','점수에 포함한 게시물'));
   if(!s.posts.length)posts.append(node('p',s.count===0?'인정된 게시물이 없습니다.':'목록을 확인하지 못했습니다.','score-note'));
   for(const p of s.posts){const entry=node('article',undefined,'score-post');const meta=node('div',undefined,'score-post-meta');meta.append(node('span',day(p.timestamp)),node('span',p.platform==='instagram'?(p.reason==='Instagram 릴스'?'Instagram 릴스':p.photoCount>=5?'Instagram 캐러셀':'Instagram 게시물'):'Threads'));if(p.bonus.points)meta.append(node('strong','+'+p.bonus.points+'점'));entry.append(meta,node('p',(p.caption||'본문 없음').split('\n')[0],'score-post-title'));const metrics=node('p',`조회 ${num(p.metrics?.views)} / 저장 ${num(p.metrics?.saved)} / 공유 ${num(p.metrics?.shares)}`,'score-note');entry.append(metrics);if(p.bonus.points)entry.append(node('p',bonusReason(p.bonus),'score-note'));posts.append(entry);}
   details.append(posts);card.append(details);grid.append(card);
  }
  target.replaceChildren(grid,node('p','조회 시점의 누적 실적입니다. 최종 확정·노션 반영 전 확인 점수예요.','score-footnote'));target.setAttribute('aria-busy','false');
 }
 return {render,cancel(){sequence++;}};
}
