// HR book plus user-confirmed upload cap, combined averages and single-content bonuses.
export const SCORE_RULE_VERSION='2026-11-05-content-bonus-pending-performance';
export const SCORE_BANDS=[{grade:'S',count:10,views:30000,actions:200,points:20},{grade:'A',count:8,views:20000,actions:150,points:15},{grade:'B',count:6,views:10000,actions:100,points:10},{grade:'C',count:4,views:5000,actions:50,points:6},{grade:'D',count:2,views:1000,actions:10,points:3}];
const finite=n=>Number.isFinite(n)&&n>=0;
export const reviewPoints=count=>!Number.isSafeInteger(count)||count<0?null:count>=100?10:count>=80?8:count>=60?7:count>=40?5:count>=20?3:count>=10?1:0;
const band=(n,key)=>SCORE_BANDS.find(b=>n>=b[key])||{grade:'F',points:-3};
const viewBonus=n=>!finite(n)?null:n>=500000?5:n>=300000?3:n>=100000?2:0;
const actionBonus=n=>n>=3000?3:n>=2000?2:n>=1000?1:0;
export function contentBonus(item){
 const views=viewBonus(item.metrics?.views),saved=item.metrics?.saved,shares=item.metrics?.shares;
 const knownActions=(finite(saved)?saved:0)+(finite(shares)?shares:0);
 const actions=actionBonus(knownActions),actionsComplete=finite(saved)&&finite(shares)||actions===3;
 return {views,actions,knownActions,actionsComplete,complete:views!==null&&actionsComplete,points:(views??0)+actions};
}
export function bonusReason(bonus){
 const views=bonus.views===null?'조회 미확인':`조회 ${bonus.views===5?'50만 이상':bonus.views===3?'30만 이상':bonus.views===2?'10만 이상':'10만 미만'} ${bonus.views>0?'+':''}${bonus.views}점`;
 const actions=!bonus.actionsComplete?(bonus.actions?`저장+공유 확인분 기준 최소 +${bonus.actions}점`:'저장+공유 미확인'):`저장+공유 ${bonus.actions===3?'3천 이상':bonus.actions===2?'2천 이상':bonus.actions===1?'1천 이상':'기준 미달'} ${bonus.actions>0?'+':''}${bonus.actions}점`;
 return views+' / '+actions;
}
export function marketingScore(store,month,results,inputs={}) {
 const expected=store.threads?['instagram','threads']:['instagram'];
 const scoped=expected.map(p=>results.find(r=>r.store===store.id&&r.platform===p));
 const available=scoped.filter(Boolean),included=available.flatMap(r=>(r.items||[]).filter(i=>i.eligibility==='included').map(i=>({...i,platform:r.platform})));
 const sameMonth=available.every(r=>r.month===month);
 const complete=scoped.every(r=>r&&r.status==='collected'&&r.listComplete&&r.summary?.pending===0&&Array.isArray(r.items)&&r.items.length===r.summary.included+r.summary.excluded);
 const count=complete&&sameMonth?included.length:null;
 const review=inputs.month===month?inputs.reviews?.[store.id]:null;
 const reviews=reviewPoints(review?.count);
 let sns=null,uploadGrade=null,performanceGrade=null,viewAverage=null,actionAverage=null,actionMissing=0,reason='게시물 수집·판정 확인 필요';
 if(count!==null){
  const upload=band(count,'count');uploadGrade=upload.grade;
  const viewValues=included.map(i=>i.metrics?.views),allViews=viewValues.every(finite);
  const knownActions=included.reduce((sum,i)=>sum+(finite(i.metrics?.saved)?i.metrics.saved:0)+(finite(i.metrics?.shares)?i.metrics.shares:0),0);
  actionMissing=included.filter(i=>!finite(i.metrics?.saved)||!finite(i.metrics?.shares)).length;
  viewAverage=count&&allViews?viewValues.reduce((a,b)=>a+b,0)/count:null;
  actionAverage=count?knownActions/count:null;
  const previous=inputs.month===month?inputs.previousActivity?.[store.id]:null;
  const prior=new Date(month+'-01T00:00:00Z');prior.setUTCMonth(prior.getUTCMonth()-1);
  if(count===0){
   if(previous?.month===prior.toISOString().slice(0,7)&&previous.complete===true&&Number.isSafeInteger(previous.count)&&previous.count>=0){sns=previous.count===0?-10:-3;reason=previous.count===0?'전월·당월 인정 게시물 0건 → 2개월 미진행 −10점':'당월 인정 게시물 0건 → F구간 −3점';}
   else reason='인정 게시물 0건 / 전월 실적 확인 후 −3점·−10점 구분';
  }else if(upload.grade==='F'){sns=-3;reason=`${count}건 업로드 → F구간 −3점`;}
  else if(viewAverage!==null){
   const lower=SCORE_BANDS.find(b=>viewAverage>=b.views&&actionAverage>=b.actions)||{grade:'F',points:-3};
   // The owner must confirm whether either performance metric or both are required.
   // Publish a score only when every possible interpretation yields the same capped result.
   const viewBand=band(viewAverage,'views'),actionBand=band(actionAverage,'actions');
   const possibleHigh=actionMissing?20:Math.max(viewBand.points,actionBand.points);
   const lowScore=Math.min(upload.points,lower.points),highScore=Math.min(upload.points,possibleHigh);
   if(lowScore===highScore){
    sns=lowScore;performanceGrade=lower.grade;
    reason=`${count}건 업로드 → ${upload.grade}구간 상한 ${upload.points}점 / 확인된 성과로 적용 ${sns}점`;
   }else reason=`성과 기준 사장님 확인 대기 · 적용 가능 ${lowScore}~${highScore}점 (업로드 상한 ${upload.points}점)`;
  }else reason='조회 수 미확인으로 성과 등급 확인 필요';
 }
 const posts=included.map(item=>({...item,bonus:contentBonus(item)}));
 const bonus=posts.reduce((sum,i)=>sum+i.bonus.points,0);
 const bonusComplete=complete&&sameMonth&&posts.every(i=>i.bonus.complete);
 const total=reviews!==null&&sns!==null&&complete&&sameMonth?reviews+sns+bonus:null;
 return {ruleVersion:SCORE_RULE_VERSION,month,store:store.id,reviewCount:review?.count??null,reviewPoints:reviews,reviewSource:review?.source??null,count,uploadGrade,performanceGrade,viewAverage,actionAverage,actionMissing,sns,reason,bonus,bonusComplete,total,posts,complete:complete&&sameMonth,notes:[...(actionMissing?['Threads 등 저장·공유 미확인 건은 0으로 대체하지 않음']:[]),'월초 팔로워 자료가 없어 증가 가산점 미산정'],state:total===null?'산정 대기':'확인된 점수'};
}
