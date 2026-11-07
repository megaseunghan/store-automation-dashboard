import {adaptEvaluationResponse,renderEvaluation,renderEvaluationDetail} from './eval-render.js?v=ac48dfda448d';

export function createEvalScreen({root,request,now=()=>new Date()}){
 let role=null,model=null,pending=null,attemptedMonth=null,generation=0,phase='idle',destroyed=false,active=false,dialog=null,opener=null;
 const valid=month=>typeof month==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(month);
 const clock=()=>typeof now==='function'?now():now;
 const defaultMonth=()=>{const month=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'}).format(clock()),[year,m]=month.split('-').map(Number),date=new Date(Date.UTC(year,m-2,1));return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`;};
 const urlMonth=()=>{const value=new URL(location.href).searchParams.get('month');return valid(value)?value:defaultMonth();};
 let state={month:urlMonth(),sort:'total'};
 function closeDetail({focus=true}={}){if(!dialog)return;dialog.close();dialog.remove();dialog=null;if(focus)root.querySelector(`[data-eval-store="${opener}"]`)?.focus({preventScroll:true});}
 function paint(){if(phase!=='ready'||!model||destroyed)return;root.innerHTML=renderEvaluation(model,state);}
 function display(message,error=false){root.replaceChildren();const box=document.createElement('section');box.className='eval-panel eval-connection';const text=document.createElement('p');text.textContent=message;box.append(text);if(error){const button=document.createElement('button');button.type='button';button.dataset.evalAction='retry';button.textContent='다시 시도';box.append(button);}else{const progress=document.createElement('progress');progress.setAttribute('aria-label','종합평가 불러오는 중');box.append(progress);}root.append(box);}
 async function load(){
  if(destroyed||!active)return;pending?.abort();closeDetail({focus:false});const controller=new AbortController();pending=controller;const token=++generation,requestedRole=role,month=state.month;attemptedMonth=month;phase='loading';display('노션에서 종합평가를 불러오고 있습니다');
  try{const response=await request(`/api/eval?month=${encodeURIComponent(month)}`,{signal:controller.signal,timeoutMs:120000});if(destroyed||token!==generation||role!==requestedRole||controller.signal.aborted)return;model=adaptEvaluationResponse(response,{role:requestedRole});if(model.month!==month)throw Error('다른 월 응답');phase='ready';paint();}
  catch(error){if(destroyed||token!==generation||controller.signal.aborted)return;phase='error';display(error?.status===503?'노션 연결 설정을 확인해 주세요.':'종합평가를 불러오지 못했습니다. 다시 시도해 주세요.',true);}
  finally{if(token===generation)pending=null;}
 }
 function openDetail(id){const row=model?.rows.find(row=>row.store===id);if(!row)return;closeDetail({focus:false});opener=id;dialog=document.createElement('dialog');dialog.className='eval-detail-sheet';dialog.setAttribute('aria-labelledby','eval-detail-title');dialog.innerHTML=renderEvaluationDetail(model,row);dialog.addEventListener('cancel',event=>{event.preventDefault();closeDetail();});root.append(dialog);dialog.showModal();dialog.querySelector('[data-eval-action="close"]')?.focus();}
 function click(event){const action=event.target.closest('[data-eval-action]');if(action?.dataset.evalAction==='retry')return load();if(action?.dataset.evalAction==='close')return closeDetail();if(event.target.closest('a[data-view-link]')){closeDetail({focus:false});return;}if(event.target.closest('a,button,input,select,summary'))return;const row=event.target.closest('[data-eval-store]');if(row&&root.contains(row))openDetail(row.dataset.evalStore);}
 function keydown(event){if(event.target.closest('a,button,input,select,summary'))return;const row=event.target.closest('[data-eval-store]');if(row&&['Enter',' '].includes(event.key)){event.preventDefault();openDetail(row.dataset.evalStore);}}
 function change(event){if(event.target.matches('[data-eval-month]')){const month=event.target.value;if(!valid(month)){event.target.value=state.month;return;}state={...state,month};const url=new URL(location.href);url.searchParams.set('month',month);history.replaceState(history.state,'',url.href);return load();}if(event.target.matches('[data-eval-sort]')){state={...state,sort:event.target.value};paint();root.querySelector('[data-eval-sort]')?.focus();}}
 root.addEventListener('click',click);root.addEventListener('keydown',keydown);root.addEventListener('change',change);
 function resetSession(){generation++;pending?.abort();pending=null;closeDetail({focus:false});role=null;model=null;attemptedMonth=null;phase='idle';active=false;root.replaceChildren();}
 return {
  activate({role:nextRole}){if(destroyed)return;if(role&&role!==nextRole)resetSession();role=nextRole;active=true;const month=urlMonth();if(month!==state.month){state={...state,month};attemptedMonth=null;}if(attemptedMonth!==state.month)return load();},
  syncURL(){const month=urlMonth();if(month!==state.month){state={...state,month};if(active)return load();}},
  refresh:load,resetSession,
  destroy(){resetSession();destroyed=true;root.removeEventListener('click',click);root.removeEventListener('keydown',keydown);root.removeEventListener('change',change);},
 };
}
