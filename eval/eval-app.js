import {adaptEvaluationResponse,renderEvaluation,renderEvaluationDetail} from './eval-render.js?v=38556b11ed3e';

const EVALUATION_STORES=[['haenggung','테네스 행궁'],['sindong','테네스 신동'],['paldal','팔달통닭바베큐'],['simgeum','심금'],['sasek','사색'],['yamiok','야미옥']].map(([id,name])=>({id,name}));

export function createEvalScreen({root,request,now=()=>new Date()}){
 let role=null,model=null,batch=null,attemptedMonth=null,generation=0,phase='idle',destroyed=false,active=false,dialog=null,opener=null,view=null,progressNodes=null;
 const valid=month=>typeof month==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(month);
 const clock=()=>typeof now==='function'?now():now;
 const defaultMonth=()=>{const month=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'}).format(clock()),[year,m]=month.split('-').map(Number),date=new Date(Date.UTC(year,m-2,1));return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`;};
 const urlMonth=()=>{const value=new URL(location.href).searchParams.get('month');return valid(value)?value:defaultMonth();};
 let state={month:urlMonth(),sort:'total'};
 function closeDetail({focus=true}={}){if(!dialog)return;dialog.close();dialog.remove();dialog=null;if(focus)root.querySelector(`[data-eval-store="${opener}"]`)?.focus({preventScroll:true});}
 function paint(){
  if(!model||destroyed||phase==='idle')return;
  if(!view){
   const section=document.createElement('section'),status=document.createElement('p'),bar=document.createElement('div'),fill=document.createElement('span');
   section.className='eval-panel eval-loading-progress';status.className='eval-progress-status';status.setAttribute('aria-live','polite');bar.className='eval-progress-track';bar.setAttribute('data-eval-progress','');bar.setAttribute('role','progressbar');bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax','100');bar.setAttribute('aria-label','종합평가 불러오기 진행률');fill.className='eval-progress-fill';bar.append(fill);section.append(status);section.append(bar);progressNodes={section,status,bar,fill};view=document.createElement('div');root.replaceChildren(section,view);
  }
  const completed=state.progress.completed,total=state.progress.total,percent=Math.round(completed/total*100),label=`${completed}/${total} 매장 · ${percent}%`;
  if(progressNodes.status.textContent!==label)progressNodes.status.textContent=label;
  progressNodes.bar.setAttribute('aria-valuenow',String(percent));progressNodes.fill.style.transform=`scaleX(${completed/total})`;
  const focused=document.activeElement,store=focused?.dataset?.evalStore,monthFocused=focused?.matches?.('[data-eval-month]'),sortFocused=focused?.matches?.('[data-eval-sort]');
  view.innerHTML=renderEvaluation(model,{...state,renderProgress:false});
  if(store)root.querySelector(`[data-eval-store="${store}"]`)?.focus({preventScroll:true});
  else if(monthFocused)root.querySelector('[data-eval-month]')?.focus({preventScroll:true});
  else if(sortFocused)root.querySelector('[data-eval-sort]')?.focus({preventScroll:true});
 }
 const isCurrent=current=>!destroyed&&active&&batch===current&&current.token===generation&&current.role===role&&!current.controller.signal.aborted;
 function cancelBatch(){if(!batch)return;batch.controller.abort();batch.resolve();batch=null;}
 function resetCompletion(current){current.done=new Promise(resolve=>{current.resolve=resolve;});}
 function pump(current){
  if(!isCurrent(current))return;
  while(current.active<2&&current.queue.length){const id=current.queue.shift();current.active++;readStore(current,id);}
  if(current.active===0&&current.queue.length===0){phase='ready';current.resolve();}
 }
 async function readStore(current,id){
  const item=state.progress.items.find(item=>item.id===id);if(!item.retrying)item.status='loading';
  try{
   const response=await request(`/api/eval?month=${encodeURIComponent(current.month)}&store=${encodeURIComponent(id)}`,{signal:current.controller.signal,timeoutMs:120000});
   if(!isCurrent(current))return;
   const adapted=adaptEvaluationResponse(response,{role:current.role});
   if(adapted.month!==current.month||adapted.rows.length!==1||adapted.rows[0].store!==id)throw Error('평가 응답 확인 필요');
   const row=adapted.rows[0];current.rows.set(id,row);model={...adapted,rows:EVALUATION_STORES.flatMap(store=>current.rows.has(store.id)?[current.rows.get(store.id)]:[])};
   item.status=row.check.state==='mapping'||row.check.retryable?'error':'ready';item.statusCode=502;
  }catch(error){
   if(!isCurrent(current))return;
   current.rows.delete(id);model={...model,rows:EVALUATION_STORES.flatMap(store=>current.rows.has(store.id)?[current.rows.get(store.id)]:[])};
   item.status='error';item.statusCode=error?.status===503?503:502;
  }finally{
   if(isCurrent(current)){
    item.retrying=false;current.completed.add(id);state.progress.completed=current.completed.size;current.active--;
    phase=current.completed.size===EVALUATION_STORES.length?'ready':'loading';paint();pump(current);
   }
  }
 }
 function load(){
  if(destroyed||!active)return;
  cancelBatch();closeDetail({focus:false});const month=state.month,controller=new AbortController();
  const current={token:++generation,controller,role,month,rows:new Map(),queue:EVALUATION_STORES.map(store=>store.id),active:0,completed:new Set()};resetCompletion(current);batch=current;
  attemptedMonth=month;phase='loading';model={month,role,rows:[],fetchedAt:null};state={...state,progress:{completed:0,total:EVALUATION_STORES.length,items:EVALUATION_STORES.map(store=>({...store,status:'pending',retrying:false}))}};
  paint();pump(current);return current.done;
 }
 function retryStore(id){
  const current=batch,item=state.progress?.items.find(item=>item.id===id);
  if(!current||!isCurrent(current)||!item||item.retrying||item.status!=='error')return;
  if(current.active===0&&current.queue.length===0)resetCompletion(current);
  item.retrying=true;current.queue.push(id);paint();pump(current);return current.done;
 }
 function openDetail(id){const row=model?.rows.find(row=>row.store===id);if(!row)return;closeDetail({focus:false});opener=id;dialog=document.createElement('dialog');dialog.className='eval-detail-sheet';dialog.setAttribute('aria-labelledby','eval-detail-title');dialog.innerHTML=renderEvaluationDetail(model,row);dialog.addEventListener('cancel',event=>{event.preventDefault();closeDetail();});root.append(dialog);dialog.showModal();dialog.querySelector('[data-eval-action="close"]')?.focus();}
 function click(event){const action=event.target.closest('[data-eval-action]');if(action?.dataset.evalAction==='retry-store')return retryStore(action.dataset.evalRetryStore);if(action?.dataset.evalAction==='retry')return load();if(action?.dataset.evalAction==='close')return closeDetail();if(event.target.closest('a[data-view-link]')){closeDetail({focus:false});return;}if(event.target.closest('a,button,input,select,summary'))return;const row=event.target.closest('[data-eval-store]');if(row&&root.contains(row))openDetail(row.dataset.evalStore);}
 function keydown(event){if(event.target.closest('a,button,input,select,summary'))return;const row=event.target.closest('[data-eval-store]');if(row&&['Enter',' '].includes(event.key)){event.preventDefault();openDetail(row.dataset.evalStore);}}
 function change(event){if(event.target.matches('[data-eval-month]')){const month=event.target.value;if(!valid(month)){event.target.value=state.month;return;}state={...state,month};const url=new URL(location.href);url.searchParams.set('month',month);history.replaceState(history.state,'',url.href);return load();}if(event.target.matches('[data-eval-sort]')){state={...state,sort:event.target.value};paint();root.querySelector('[data-eval-sort]')?.focus();}}
 root.addEventListener('click',click);root.addEventListener('keydown',keydown);root.addEventListener('change',change);
 function resetSession(){generation++;cancelBatch();closeDetail({focus:false});role=null;model=null;attemptedMonth=null;phase='idle';active=false;view=null;progressNodes=null;root.replaceChildren();}
 return {
  activate({role:nextRole}){if(destroyed)return;if(role&&role!==nextRole)resetSession();role=nextRole;active=true;const month=urlMonth();if(month!==state.month){state={...state,month};attemptedMonth=null;}if(attemptedMonth!==state.month)return load();},
  syncURL(){const month=urlMonth();if(month!==state.month){state={...state,month};if(active)return load();}},
  refresh:load,resetSession,
  destroy(){resetSession();destroyed=true;root.removeEventListener('click',click);root.removeEventListener('keydown',keydown);root.removeEventListener('change',change);},
 };
}
