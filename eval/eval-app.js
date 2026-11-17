import {adaptEvaluationResponse,renderEvaluation,renderEvaluationDetail,renderEvaluationControls,renderEvaluationConfirmationDialog} from './eval-render.js?v=661c25e9fa03';

const EVALUATION_STORES=[['haenggung','테네스 행궁'],['sindong','테네스 신동'],['paldal','팔달통닭바베큐'],['simgeum','심금'],['sasek','사색'],['yamiok','야미옥']].map(([id,name])=>({id,name}));

export function createEvalScreen({root,request,now=()=>new Date()}){
 let role=null,model=null,batch=null,attemptedMonth=null,generation=0,phase='idle',destroyed=false,active=false,dialog=null,opener=null,view=null,progressNodes=null,controls=null,monthTimer=null,confirmationNotice=null,dialogContext=null,mutation=null;
 const formatValid=month=>typeof month==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(month);
 const shifted=(month,delta)=>{const [y,m]=month.split('-').map(Number),date=new Date(Date.UTC(y,m-1+delta,1));return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`;};
 const currentMonth=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'}).format(clock());
 const maxMonth=()=>shifted(currentMonth(),1);
 const valid=month=>formatValid(month)&&month>='2020-01'&&month<=maxMonth();
 const clock=()=>typeof now==='function'?now():now;
 const defaultMonth=()=>{const month=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'}).format(clock()),[year,m]=month.split('-').map(Number),date=new Date(Date.UTC(year,m-2,1));return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`;};
 const urlMonth=()=>{const value=new URL(location.href).searchParams.get('month');return valid(value)?value:defaultMonth();};
 const dirtyConfirmationMonths=new Set();
 let state={month:urlMonth(),sort:'total'};
 function closeDetail({focus=true}={}){if(!dialog)return;const context=dialogContext;dialog.close();dialog.remove();dialog=null;dialogContext=null;if(focus){const target=context?root.querySelector(`[data-eval-action="${context.action==='confirm'?'confirm-open':'unconfirm-open'}"][data-eval-confirm-store="${context.store}"]`):null;(target??root.querySelector(`[data-eval-store="${opener}"]`))?.focus({preventScroll:true});}}
 function paint(){
  if(!model||destroyed||phase==='idle')return;
  if(!view){
   const section=document.createElement('section'),status=document.createElement('p'),bar=document.createElement('div'),fill=document.createElement('span');
   section.className='eval-panel eval-loading-progress';status.className='eval-progress-status';status.setAttribute('aria-live','polite');bar.className='eval-progress-track';bar.setAttribute('data-eval-progress','');bar.setAttribute('role','progressbar');bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax','100');bar.setAttribute('aria-label','종합평가 불러오기 진행률');fill.className='eval-progress-fill';bar.append(fill);section.append(status);section.append(bar);progressNodes={section,status,bar,fill};view=document.createElement('div');controls=document.createElement('div');controls.className='eval-controls-host';controls.innerHTML=renderEvaluationControls({...state,maxMonth:maxMonth()});confirmationNotice=document.createElement('p');confirmationNotice.className='eval-confirm-status';confirmationNotice.setAttribute('data-eval-confirm-status','');confirmationNotice.setAttribute('aria-live','polite');root.replaceChildren(section,controls,confirmationNotice,view);
  }
  const completed=state.progress.completed,total=state.progress.total,percent=Math.round(completed/total*100),label=`${completed}/${total} 매장 · ${percent}%`;
  if(progressNodes.status.textContent!==label)progressNodes.status.textContent=label;
  progressNodes.bar.setAttribute('aria-valuenow',String(percent));progressNodes.fill.style.transform=`scaleX(${completed/total})`;
  syncControls();
  const focused=document.activeElement,store=focused?.dataset?.evalStore;
  view.innerHTML=renderEvaluation(model,{...state,renderProgress:false,renderControls:false});
  if(store)root.querySelector(`[data-eval-store="${store}"]`)?.focus({preventScroll:true});

 }
 function cancelMonthTimer(){if(monthTimer!==null){clearTimeout(monthTimer);monthTimer=null;}}
 function syncControls(){
  const input=controls?.querySelector('[data-eval-month]'),sort=controls?.querySelector('[data-eval-sort]');
  if(input){input.max=maxMonth();if(document.activeElement!==input&&monthTimer===null&&input.getAttribute('aria-invalid')!=='true')input.value=state.month;syncMonthButtons(input.value);}
  if(sort&&document.activeElement!==sort)sort.value=state.sort;
 }
 function syncMonthButtons(value){
  const month=valid(value)?value:state.month,prev=controls?.querySelector('[data-eval-month-prev]'),next=controls?.querySelector('[data-eval-month-next]');
  if(prev)prev.disabled=month<='2020-01';if(next)next.disabled=month>=maxMonth();
 }
 function stageMonth(event){
  if(!event.target.matches('[data-eval-month]'))return;
  cancelMonthTimer();const input=event.target,month=input.value,hint=controls?.querySelector('[data-eval-month-hint]');
  const okay=valid(month);input.setAttribute('aria-invalid',String(!okay));
  if(hint)hint.textContent=okay?'YYYY-MM 형식으로 입력해 주세요.':formatValid(month)&&month>maxMonth()?'다음 달까지 선택해 주세요.':'2020년 이후 월을 선택해 주세요. (YYYY-MM)';
  syncMonthButtons(month);if(!okay||event.isComposing)return;
  const editingURL=location.href;
  monthTimer=setTimeout(()=>{monthTimer=null;if(location.href!==editingURL||destroyed||!active||input.value!==month||!valid(month)||month===attemptedMonth)return;state={...state,month};const url=new URL(location.href);url.searchParams.set('month',month);history.replaceState(history.state,'',url.href);load();},300);
 }
 function stepMonth(button,delta){
  if(button.disabled)return;const input=controls?.querySelector('[data-eval-month]');if(!input)return;
  const month=shifted(valid(input.value)?input.value:state.month,delta);if(!valid(month))return;input.value=month;input.focus({preventScroll:true});stageMonth({target:input});
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
  current.reading.add(id);
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
   current.reading.delete(id);
   if(isCurrent(current)){
    item.retrying=false;if(current.reloadAfter.delete(id)&&!current.queue.includes(id)){item.retrying=true;current.queue.push(id);}current.completed.add(id);state.progress.completed=current.completed.size;current.active--;
    phase=current.completed.size===EVALUATION_STORES.length?'ready':'loading';paint();pump(current);
   }
  }
 }
 function load(){
  if(destroyed||!active)return;
  dirtyConfirmationMonths.delete(state.month);cancelBatch();closeDetail({focus:false});confirmationNoticeText('');const month=state.month,controller=new AbortController();
  const current={token:++generation,controller,role,month,rows:new Map(),queue:EVALUATION_STORES.map(store=>store.id),active:0,completed:new Set(),reading:new Set(),reloadAfter:new Set()};resetCompletion(current);batch=current;
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
 function confirmationNoticeText(text){if(confirmationNotice)confirmationNotice.textContent=text;}
 function openConfirmation(id,action){
  if(role!=='admin'||mutation)return;const row=model?.rows.find(row=>row.store===id);
  if(!row||state.progress?.items.find(item=>item.id===id)?.retrying||action==='confirm'&&!row.confirmation?.canConfirm||action==='unconfirm'&&row.confirmation?.state!=='confirmed')return;
  cancelMonthTimer();syncControls();closeDetail({focus:false});opener=id;dialogContext={store:id,month:state.month,action,row,token:generation,role,route:location.href,expect:{total:row.total,incentiveTotal:row.incentive?.total},error:'',current:null,uncertain:false,busy:false};
  dialog=document.createElement('dialog');dialog.className='eval-detail-sheet eval-confirm-dialog';dialog.setAttribute('aria-labelledby','eval-confirm-title');dialog.setAttribute('aria-modal','true');
  dialog.innerHTML=renderEvaluationConfirmationDialog(model,row,dialogContext);dialog.addEventListener('cancel',event=>{event.preventDefault();closeDetail();});root.append(dialog);dialog.showModal();dialog.querySelector('[data-eval-action="confirm-dismiss"]')?.focus();
 }
 function reloadConfirmationStore(id){
  const current=batch,item=state.progress?.items.find(item=>item.id===id);if(!current||!isCurrent(current)||!item)return;if(current.reading.has(id)){current.reloadAfter.add(id);return;}if(item.retrying||current.queue.includes(id))return;
  if(current.active===0&&current.queue.length===0)resetCompletion(current);item.retrying=true;current.queue.push(id);paint();pump(current);
 }
 function updateConfirmationDialog(context,modal){
  if(dialog!==modal||dialogContext!==context)return;
  const reason=modal.querySelector('[data-eval-confirm-reason]')?.value??'';
  modal.innerHTML=renderEvaluationConfirmationDialog(model,context.row,context);
  const field=modal.querySelector('[data-eval-confirm-reason]');if(field)field.value=reason;
  modal.querySelector('[data-eval-action="confirm-dismiss"]')?.focus();
 }
 async function submitConfirmation(){
  const context=dialogContext,modal=dialog;if(role!=='admin'||!context||!modal||context.busy||mutation||context.uncertain)return;
  let data={month:context.month,store:context.store};
  if(context.action==='unconfirm'){
   const reason=modal.querySelector('[data-eval-confirm-reason]')?.value?.trim()??'';
   if(!reason||reason.length>120||/[\u0000-\u001f\u007f]/.test(reason)){context.error='취소 사유를 1~120자로 입력해 주세요.';updateConfirmationDialog(context,modal);modal.querySelector('[data-eval-confirm-reason]')?.focus();return;}
   data.reason=reason;
  }else data.expect={...context.expect};
  context.busy=true;mutation=context;
  const submit=modal.querySelector('[data-eval-action="confirm-submit"]');if(submit){submit.disabled=true;submit.setAttribute('aria-busy','true');}
  confirmationNoticeText('노션 기록을 처리하고 있습니다.');const errorNode=modal.querySelector('[data-eval-confirm-error]');if(errorNode)errorNode.textContent='노션에 기록하고 있습니다. 닫아도 처리는 계속됩니다.';const dismiss=modal.querySelector('[data-eval-action="confirm-dismiss"]');if(dismiss)dismiss.textContent='닫기';
  const visible=()=>!destroyed&&role===context.role&&state.month===context.month&&location.href===context.route;
  const current=()=>visible()&&generation===context.token;
  try{
   await request(`/api/eval/${context.action==='confirm'?'confirm':'unconfirm'}`,{data,timeoutMs:120000});
   if(!current()){if(visible()){confirmationNoticeText('확정 기록 상태를 다시 확인합니다.');reloadConfirmationStore(context.store);}else dirtyConfirmationMonths.add(context.month);return;}
   if(dialog===modal)closeDetail();confirmationNoticeText(context.action==='confirm'?'평가를 확정했습니다.':'확정을 취소했습니다.');reloadConfirmationStore(context.store);
  }catch(error){
   if(!current()){if(visible()){confirmationNoticeText('확정 기록 상태를 다시 확인합니다.');reloadConfirmationStore(context.store);}else dirtyConfirmationMonths.add(context.month);return;}
   if(error?.status===409&&error.current&&['total','incentiveTotal'].every(key=>typeof error.current[key]==='number'&&Number.isFinite(error.current[key]))){
    context.current={total:error.current.total,incentiveTotal:error.current.incentiveTotal};context.expect={...context.current};context.error='계산값이 변경되었습니다. 변경된 총점과 인센티브를 확인한 뒤 다시 확정해 주세요.';
   }else if(error?.status===409){context.error='확정 상태가 달라졌습니다. 상태를 다시 불러와 확인해 주세요.';context.uncertain=true;}
   else if(error?.status===400){context.error=context.action==='unconfirm'?'취소 사유와 확정 상태를 확인해 주세요.':'마감 월과 평가 완료 상태를 다시 확인해 주세요.';}
   else if([401,403].includes(error?.status)){context.error='관리자 링크로 다시 접속해 주세요.';context.uncertain=true;}
   else{context.error='기록 결과를 확인하지 못했습니다. 다시 불러와 상태를 확인해 주세요.';context.uncertain=true;}
   confirmationNoticeText(context.error);updateConfirmationDialog(context,modal);
  }finally{context.busy=false;if(mutation===context)mutation=null;}
 }
 function click(event){const prev=event.target.closest('[data-eval-month-prev]'),next=event.target.closest('[data-eval-month-next]');if(prev||next)return stepMonth(prev??next,prev?-1:1);const action=event.target.closest('[data-eval-action]');const kind=action?.dataset.evalAction;if(kind==='confirm-open'||kind==='unconfirm-open')return openConfirmation(action.dataset.evalConfirmStore,kind==='confirm-open'?'confirm':'unconfirm');if(kind==='confirm-dismiss')return closeDetail();if(kind==='confirm-submit')return submitConfirmation();if(kind==='confirm-refresh'){const id=dialogContext?.store;closeDetail();if(id)reloadConfirmationStore(id);return;}if(action?.dataset.evalAction==='retry-store')return retryStore(action.dataset.evalRetryStore);if(action?.dataset.evalAction==='retry')return load();if(action?.dataset.evalAction==='close')return closeDetail();if(event.target.closest('a[data-view-link]')){closeDetail({focus:false});return;}if(event.target.closest('a,button,input,select,summary'))return;const row=event.target.closest('[data-eval-store]');if(row&&root.contains(row))openDetail(row.dataset.evalStore);}
 function keydown(event){if(dialog&&event.key==='Tab'&&dialog.contains(event.target)){const nodes=[...(dialog.querySelectorAll?.('button:not(:disabled),textarea,input,select,a[href]')??[])];const first=nodes[0],last=nodes.at(-1);if(nodes.length&&(event.shiftKey&&document.activeElement===first||!event.shiftKey&&document.activeElement===last)){event.preventDefault();(event.shiftKey?last:first).focus();return;}}if(event.target.closest('a,button,input,select,summary'))return;const row=event.target.closest('[data-eval-store]');if(row&&['Enter',' '].includes(event.key)){event.preventDefault();openDetail(row.dataset.evalStore);}}
 function change(event){if(event.target.matches('[data-eval-month]'))return stageMonth(event);if(event.target.matches('[data-eval-sort]')){state={...state,sort:event.target.value};paint();}}
 root.addEventListener('click',click);root.addEventListener('keydown',keydown);root.addEventListener('change',change);root.addEventListener('input',stageMonth);
 function resetSession(){cancelMonthTimer();generation++;cancelBatch();closeDetail({focus:false});role=null;model=null;attemptedMonth=null;phase='idle';active=false;view=null;progressNodes=null;controls=null;confirmationNotice=null;root.replaceChildren();}
 return {
  activate({role:nextRole}){if(destroyed)return;if(role&&role!==nextRole)resetSession();role=nextRole;active=true;const month=urlMonth();if(month!==state.month){state={...state,month};attemptedMonth=null;}if(attemptedMonth!==state.month||dirtyConfirmationMonths.has(state.month))return load();},
  syncURL(){cancelMonthTimer();const month=urlMonth();if(month!==state.month){state={...state,month};if(active)return load();}},
  refresh(){cancelMonthTimer();return load();},resetSession,
  destroy(){resetSession();destroyed=true;root.removeEventListener('click',click);root.removeEventListener('keydown',keydown);root.removeEventListener('change',change);root.removeEventListener('input',stageMonth);},
 };
}
