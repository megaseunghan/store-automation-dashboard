import {marketingScore,SCORE_BANDS,bonusReason} from './scoring.js?v=71d8e82b0ece';
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const num=n=>Number.isFinite(n)?n.toLocaleString('ko-KR',{maximumFractionDigits:2}):'미확인';
const signed=n=>n>0?'+'+n:String(n);
const day=t=>{const d=new Date(t);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit'}).format(d):'게시일 미확인';};
const postType=p=>p.platform==='instagram'?(p.reason==='Instagram 릴스'?'Instagram 릴스':p.photoCount>=5?'Instagram 캐러셀':'Instagram 게시물'):'Threads';
const canRank=s=>Number.isFinite(s.total)&&s.complete&&s.bonusComplete;
function composition(score){
 const values=[['review','네이버',score.reviewPoints],['sns','SNS',score.sns],['bonus','가산점',score.complete?score.bonus:null]];
 const group=node('div',undefined,'score-composition');
 group.setAttribute('aria-label','점수 구성: '+values.map(([key,label,value])=>`${label} ${value===null?'확인 중':signed(value)+'점'+(key==='bonus'&&!score.bonusComplete?' (확인분, 추가 확인)':'')}`).join(', '));
 const track=node('div',undefined,'score-composition-track');track.setAttribute('aria-hidden','true');
 if(values.some(([, ,value])=>value===null)||!score.bonusComplete)track.className+=' is-unknown';
 const positive=values.reduce((sum,[,,value])=>sum+(Number.isFinite(value)?Math.max(0,value):0),0),scale=Math.max(30,positive);
 for(const [key,,value]of values){
  const segment=node('span',undefined,'score-meter-fill');segment.dataset.scorePart=key;
  segment.dataset.scoreState=value===null?'unknown':key==='bonus'&&!score.bonusComplete?'partial':value<0?'negative':'known';
  segment.style.width=`${Number.isFinite(value)?Math.max(0,value)/scale*100:0}%`;track.append(segment);
 }
 group.append(track);
 const negative=values.filter(([, ,value])=>Number.isFinite(value)&&value<0);
 group.append(node('p',negative.length?`감점 ${negative.map(([,label,value])=>`${label} ${signed(value)}점`).join(' · ')} · 막대는 확인된 양수 구성`:'막대는 확인된 점수 구성 · 미확인 항목은 제외','score-composition-note'));
 return group;
}
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
  const scored=stores().map((store,index)=>({store,index,score:marketingScore(store,month,results,inputs)}));
  const ranked=scored.filter(({score})=>canRank(score)).sort((a,b)=>b.score.total-a.score.total||a.index-b.index);
  const rankByStore=new Map(ranked.map(({store,score})=>[store.id,ranked.filter(item=>item.score.total>score.total).length+1]));
  scored.sort((a,b)=>canRank(a.score)&&canRank(b.score)?b.score.total-a.score.total||a.index-b.index:canRank(a.score)?-1:canRank(b.score)?1:a.index-b.index);
  const grid=node('div',undefined,'score-grid');
  for(const {store,score:s} of scored){
   const card=node('article',undefined,'score-card');card.dataset.scoreStore=store.id;
   const head=node('div',undefined,'score-card-head'),title=node('div',undefined,'score-title');title.append(node('p','마케팅 30+α','score-kind'),node('h3',store.name));
   const rank=rankByStore.get(store.id),badge=node('span',rank?`${rank}위`:'순위 보류','score-rank'+(rank?'':' is-pending'));badge.setAttribute('aria-label',rank?`확인 자료 기준 ${rank}위`:'미확인 항목이 있어 순위 보류');
   head.append(title,badge);card.append(head,node('span',s.state,'score-state'));
   const score=node('div',undefined,'score-number');score.append(node('strong',s.total===null?'—':num(s.total)),node('span','점'));card.append(score);
   card.append(node('p',s.total===null?'확인 후 점수를 표시해요.':'기본 30점 + 가산 / 미확인 항목 제외','score-caption'));
   card.append(node('p','네이버 리뷰 10 + SNS 20 = 기본 30점 · 가산 별도','score-formula'),composition(s));
   const breakdown=node('dl',undefined,'score-breakdown');for(const [label,value] of [['네이버',s.reviewPoints],['SNS',s.sns],['가산점',s.complete?s.bonus:null]]){const item=node('div',undefined,'score-component');item.append(node('dt',label),node('dd',value===null?'확인 중':(label==='가산점'?signed(value):num(value))+'점'));if(label==='가산점'&&s.complete&&!s.bonusComplete)item.append(node('span','추가 확인','score-note'));breakdown.append(item);}card.append(breakdown);
   const details=node('details',undefined,'score-detail');details.open=opened.has(store.id);details.addEventListener('toggle',()=>{if(details.isConnected){if(details.open)opened.add(store.id);else opened.delete(store.id);}});const summary=node('summary');summary.setAttribute('aria-label',store.name+' 점수 근거와 게시물');summary.append(node('span','점수 근거와 게시물'),node('span',s.count===null?'확인 중':s.count+'건','score-count'));details.append(summary);
   const why=node('div',undefined,'score-reasons');why.append(node('h4','30+α 구성 근거','score-detail-heading'));
   why.append(node('p',s.reviewPoints===null?'네이버 리뷰: 해당 월 자료 확인 필요':`네이버 리뷰 ${s.reviewCount}건 → ${s.reviewCount>=100?'100건 이상':s.reviewCount>=80?'80~99건':s.reviewCount>=60?'60~79건':s.reviewCount>=40?'40~59건':s.reviewCount>=20?'20~39건':s.reviewCount>=10?'10~19건':'0~9건'} 구간 ${s.reviewPoints}점`));why.append(node('p',s.reason));
   const band=SCORE_BANDS.find(b=>b.grade===s.performanceGrade);if(band)why.append(node('p',`성과 ${band.grade} 기준: 평균 조회 ${num(band.views)}회 이상 / 저장+공유 ${num(band.actions)}회 이상`,'score-note'));
   if(s.count>0){why.append(node('p',`조회 평균 ${num(s.viewAverage)}회`));why.append(node('p',`저장+공유 평균 ${num(s.actionAverage)}회${s.actionMissing?' 이상 (확인된 수치 기준)':''}`));}
   why.append(node('p',s.complete?`콘텐츠별 가산점 합계 ${signed(s.bonus)}점${!s.bonusComplete?' / 미확인 항목 있음':''}`:'콘텐츠 목록 확인 후 가산점 계산'));
   for(const note of s.notes)why.append(node('p',note,'score-note'));if(facts.status==='rejected')why.append(node('p','리뷰 점수 근거를 불러오지 못했습니다. 새로고침해 주세요.','score-note'));
   const contributions=s.posts.filter(p=>p.bonus.points>0).sort((a,b)=>b.bonus.points-a.bonus.points).slice(0,3);
   if(contributions.length){
    why.append(node('h4','가산 기여 콘텐츠 · 상위 3건'));
    const list=node('ul',undefined,'score-bonus-contributions');for(const p of contributions){const item=node('li');item.append(node('span',`${day(p.timestamp)} · ${postType(p)}`),node('strong',(p.bonus.complete?'':'최소 ')+signed(p.bonus.points)+'점'),node('p',bonusReason(p.bonus),'score-note'));list.append(item);}why.append(list);
   }
   details.append(why);
   const posts=node('div',undefined,'score-posts');posts.append(node('h4','점수에 포함한 게시물'));
   if(!s.posts.length)posts.append(node('p',s.count===0?'인정된 게시물이 없습니다.':'목록을 확인하지 못했습니다.','score-note'));
   for(const p of s.posts){const entry=node('article',undefined,'score-post');const meta=node('div',undefined,'score-post-meta');meta.append(node('span',day(p.timestamp)),node('span',postType(p)));if(p.bonus.points)meta.append(node('strong','+'+p.bonus.points+'점'));entry.append(meta,node('p',(p.caption||'본문 없음').split('\n')[0],'score-post-title'));const metrics=node('p',`조회 ${num(p.metrics?.views)} / 저장 ${num(p.metrics?.saved)} / 공유 ${num(p.metrics?.shares)}`,'score-note');entry.append(metrics);if(p.bonus.points)entry.append(node('p',bonusReason(p.bonus),'score-note'));posts.append(entry);}
   details.append(posts);card.append(details);grid.append(card);
  }
  target.replaceChildren(grid,node('p','조회 시점의 누적 실적입니다. 최종 확정·노션 반영 전 확인 점수예요. 순위는 구성 항목이 모두 확인된 매장끼리 비교합니다.','score-footnote'));target.setAttribute('aria-busy','false');
 }
 return {render,cancel(){sequence++;}};
}
