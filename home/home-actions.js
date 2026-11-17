const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORES={haenggung:'테네스 행궁',sindong:'테네스 신동',paldal:'팔달통닭바베큐',simgeum:'심금',sasek:'사색',yamiok:'야미옥'};
const ISSUES={sales:'목표매출 달성률',cost:'매출원가율',labor:'인건비율'};
const EXECUTION={todo:'시작 전',doing:'진행 중',done:'실행 완료'};
const EFFECT={unchecked:'미확인',improved:'개선 확인',not_improved:'개선 안 됨'};
const TEXT_FIELDS=['title','cause','impact','plan','recommendation','result','effectEvidence'];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sameTarget=(a,b)=>['month','store','issue'].every(k=>a?.[k]===b?.[k]);
const validTarget=t=>t&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(t.month)&&Object.hasOwn(STORES,t.store)&&Object.hasOwn(ISSUES,t.issue);
const validDate=value=>value===null||(typeof value==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value);
const targetLabel=t=>`${t.month} · ${STORES[t.store]} · ${ISSUES[t.issue]}`;
export const emptyAction=()=>({title:'',cause:'',causeState:'unverified',impact:'',plan:'',recommendation:'',assigneeIds:[],deadline:null,execution:'todo',result:'',effect:'unchecked',effectEvidence:'',taskId:null});
const draftOf=action=>Object.fromEntries(Object.keys(emptyAction()).map(k=>[k,Array.isArray(action[k])?[...action[k]]:action[k]]));
function safeNotionUrl(value,pageId){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&['www.notion.so','notion.so','app.notion.com','www.notion.com','notion.com'].includes(u.hostname)&&u.pathname.replaceAll('-','').endsWith(pageId.replaceAll('-',''))?u.href:null;}catch{return null;}
}
export function adaptActionResponse(value,target){
 if(!validTarget(target)||!sameTarget(value?.target,target)||!Object.hasOwn(value??{},'action'))throw Error('대응 기록의 대상과 응답을 확인해 주세요.');
 if(value.action===null)return null;
 const a=value.action;
 if(!a||!UUID.test(a.pageId??'')||typeof a.version!=='string'||!a.version||a.version.length>300||!TEXT_FIELDS.every(k=>typeof a[k]==='string'&&a[k].length<=10000)||!['unverified','confirmed'].includes(a.causeState)||!Object.hasOwn(EXECUTION,a.execution)||!Object.hasOwn(EFFECT,a.effect)||!validDate(a.deadline)||!Array.isArray(a.assigneeIds)||a.assigneeIds.length>20||!a.assigneeIds.every(id=>UUID.test(id))||!(a.taskId===null||UUID.test(a.taskId??'')))throw Error('대응 기록을 확인하지 못했습니다. 다시 불러와 주세요.');
 const url=safeNotionUrl(a.url,a.pageId);if(!url)throw Error('대응 기록 링크를 확인하지 못했습니다.');
 return {...draftOf(a),pageId:a.pageId,url,version:a.version};
}
function adaptOptions(value){
 if(!Array.isArray(value?.tasks)||!Array.isArray(value?.people))throw Error('업무와 담당자 목록을 불러오지 못했습니다.');
 const tasks=value.tasks.map(t=>{if(!UUID.test(t?.id??'')||typeof t.title!=='string')throw Error('업무 목록을 확인해 주세요.');return {id:t.id,title:t.title.slice(0,300),cycle:typeof t.cycle==='string'?t.cycle:'',status:typeof t.status==='string'?t.status:'',affiliation:typeof t.affiliation==='string'?t.affiliation:''};});
 const people=value.people.map(p=>{if(!UUID.test(p?.id??'')||typeof p.name!=='string')throw Error('담당자 목록을 확인해 주세요.');return {id:p.id,name:p.name.slice(0,100)};});
 return {tasks,people};
}
export function validateActionDraft(draft){
 if(!draft||TEXT_FIELDS.some(k=>typeof draft[k]!=='string'))return '입력 내용을 확인해 주세요.';
 if(!draft.title.trim())return '과제명을 입력해 주세요.';
 if(!draft.plan.trim())return '대응안을 입력해 주세요.';
 if(TEXT_FIELDS.some(k=>typeof draft[k]!=='string'||draft[k].length>(k==='title'?160:2000)))return '과제명은 160자, 각 내용은 2,000자 이내로 입력해 주세요.';
 if(draft.causeState==='confirmed'&&!draft.cause.trim())return '확인된 원인을 입력해 주세요.';
 if(!validDate(draft.deadline))return '완료기한을 확인해 주세요.';
 if(draft.execution==='done'&&!draft.result.trim())return '실행 완료로 저장하려면 실행 결과를 입력해 주세요.';
 if(draft.effect!=='unchecked'&&(draft.execution!=='done'||!draft.effectEvidence.trim()))return '개선 여부를 판단하려면 실행 완료와 효과 근거가 필요합니다.';
 return '';
}

/** In-memory draft lifecycle. Unknown write outcomes can only be reconciled. */
export function createActionSession({request,uuid=()=>crypto.randomUUID(),onChange=()=>{}}){
 let generation=0,controller=null;
 let state={target:null,action:null,draft:null,options:{tasks:[],people:[]},status:'idle',error:'',notice:'',requestId:null,conflict:false,list:[],listMonth:null};
 const notify=()=>onChange(state);
 const current=token=>token===generation&&!controller?.signal.aborted;
 const dirty=()=>state.draft&&JSON.stringify(state.draft)!==JSON.stringify(state.action?draftOf(state.action):emptyAction());
 const finish=raw=>{const action=adaptActionResponse(raw,state.target);if(!action||(state.action&&state.action.pageId!==action.pageId))throw Error('저장한 기록을 확인하지 못했습니다.');state={...state,action,draft:draftOf(action),requestId:null,status:'ready',conflict:false,error:'',notice:'Notion에 저장하고 저장된 내용을 확인했습니다.'};notify();};
 return {
  get state(){return state;},isDirty:dirty,
  reset(){generation++;controller?.abort();controller=null;state={target:null,action:null,draft:null,options:{tasks:[],people:[]},status:'idle',error:'',notice:'',requestId:null,conflict:false,list:[],listMonth:null};notify();},
  async open(target){
   this.reset();if(!validTarget(target))return;const token=generation;controller=new AbortController();state={...state,target:{...target},status:'loading'};notify();
   try{const [raw,options]=await Promise.all([request(`/api/actions?${new URLSearchParams(target)}`,{signal:controller.signal,timeoutMs:45000}),request('/api/actions/options',{signal:controller.signal,timeoutMs:45000})]);if(!current(token))return;const action=adaptActionResponse(raw,target);const pending=raw.pendingRequestId??null;if(pending!==null&&!UUID.test(pending))throw Error('저장 확인 요청을 확인하지 못했습니다.');state={...state,action,draft:action?draftOf(action):emptyAction(),options:adaptOptions(options),requestId:pending,status:pending?'uncertain':'ready',error:pending?'이 대상에 저장 결과 확인이 필요한 요청이 있습니다. 저장 결과를 먼저 확인해 주세요.':''};notify();}
   catch(error){if(!current(token))return;state={...state,status:'error',error:error.message||'대응 기록을 불러오지 못했습니다.'};notify();}
  },
  async list(month){
   this.reset();if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))return;const token=generation;controller=new AbortController();state={...state,listMonth:month,status:'loading'};notify();
   try{const raw=await request(`/api/actions?${new URLSearchParams({month})}`,{signal:controller.signal,timeoutMs:45000});if(!current(token))return;if(raw?.month!==month||!Array.isArray(raw.actions))throw Error('대응 기록 목록을 확인하지 못했습니다.');const list=raw.actions.map(a=>{if(a.target?.month!==month)throw Error('대응 기록의 평가 월을 확인해 주세요.');return {target:a.target,...adaptActionResponse({target:a.target,action:a},a.target)};});state={...state,status:'list',list};notify();}
   catch(error){if(!current(token))return;state={...state,status:'error',error:error.message||'대응 기록을 불러오지 못했습니다.'};notify();}
  },
  edit(draft){if(state.status!=='ready'||state.requestId)return;state={...state,draft:draftOf(draft),notice:'',error:''};},
  async save(){
   if(state.status!=='ready'||state.requestId||state.conflict)return;
   const error=validateActionDraft(state.draft);if(error){state={...state,error};notify();return;}
   const token=generation,requestId=uuid(),target={...state.target},value=draftOf(state.draft);
   const data={requestId,target,mode:state.action?'update':'create',...(state.action?{pageId:state.action.pageId,expectedVersion:state.action.version}:{}),value};
   state={...state,status:'saving',requestId,error:'',notice:''};notify();
   try{const result=await request('/api/actions',{data,signal:controller.signal,timeoutMs:120000});if(current(token))finish(result);}
   catch(error){if(!current(token))return;const known=[400,401,403,409,413,415,422,429].includes(error.status);state={...state,status:known?'ready':'uncertain',requestId:known?null:requestId,conflict:error.status===409,error:known?(error.message||'저장 요청을 확인해 주세요.'):'저장 결과를 아직 확인하지 못했습니다. 입력 내용을 보존했습니다. 다시 저장하지 말고 저장 결과를 확인해 주세요.'};notify();}
  },
  async reconcile(){
   if(state.status!=='uncertain'||!state.requestId)return;const token=generation;state={...state,status:'reconciling',error:''};notify();
   try{const result=await request('/api/actions/reconcile',{data:{requestId:state.requestId,target:state.target},signal:controller.signal,timeoutMs:45000});if(current(token))finish(result);}
   catch{if(!current(token))return;state={...state,status:'uncertain',error:'저장 결과 확인이 아직 끝나지 않았습니다. 잠시 후 다시 확인해 주세요. 같은 과제를 새로 만들지 마세요.'};notify();}
  },
 };
}

const select=(name,label,values,value)=>`<label>${label}<select name="${name}">${Object.entries(values).map(([key,text])=>`<option value="${key}"${value===key?' selected':''}>${text}</option>`).join('')}</select></label>`;
const textarea=(name,label,value,required=false)=>`<label>${label}<textarea name="${name}" rows="3" maxlength="2000"${required?' required':''}>${esc(value)}</textarea></label>`;
export function renderActionForm(state){
 const {target,action,draft:d,options,status,error,notice}=state;
 if(!d)return '';
 const busy=['saving','uncertain','reconciling'].includes(status);
 const people=[...options.people,...d.assigneeIds.filter(id=>!options.people.some(p=>p.id===id)).map(id=>({id,name:'기존 담당자 (목록 확인 필요)'}))];
 const tasks=[...options.tasks,...(d.taskId&&!options.tasks.some(t=>t.id===d.taskId)?[{id:d.taskId,title:'연결 업무 확인 필요',cycle:'',status:'',affiliation:''}]:[])];
 return `<form data-action-form><p class="home-action-context">${esc(targetLabel(target))}</p><p class="home-action-note">실행 완료와 개선 효과는 따로 확인합니다. 저장해도 평가 점수는 바뀌지 않습니다.</p>${action?`<a class="text-link" href="${esc(action.url)}" target="_blank" rel="noreferrer">Notion 기록 열기</a>`:''}<fieldset${busy?' disabled':''}><legend class="sr-only">대응 과제 내용</legend><label><span>과제명 <span aria-hidden="true">*</span></span><input name="title" maxlength="160" value="${esc(d.title)}" required autocomplete="off"></label><div class="home-action-grid">${select('causeState','원인 확인', {unverified:'확인 중',confirmed:'확인됨'},d.causeState)}${select('execution','실행 상태',EXECUTION,d.execution)}</div>${textarea('cause','원인 · 확인 전에는 추정임을 적어 주세요',d.cause)}${textarea('plan','대응안 *',d.plan,true)}<div class="home-action-grid"><label>담당자<select name="assigneeIds" multiple size="${Math.min(3,Math.max(2,people.length))}" aria-describedby="action-assignee-help">${people.map(p=>`<option value="${esc(p.id)}"${d.assigneeIds.includes(p.id)?' selected':''}>${esc(p.name)}</option>`).join('')}</select><small id="action-assignee-help">선택하지 않으면 미지정. 여러 명은 Ctrl 또는 ⌘로 선택합니다.</small></label><label>완료기한<input name="deadline" type="date" value="${esc(d.deadline??'')}"><small>아직 정하지 않았다면 비워 둡니다.</small></label></div><details${d.impact||d.recommendation||d.taskId?' open':''}><summary>영향·추천안·관련 업무</summary>${textarea('impact','예상 영향 · 기간과 산출 근거',d.impact)}${textarea('recommendation','COO 추천안 · 선택 이유',d.recommendation)}<label>기존 업무 연결 (선택)<select name="taskId"><option value="">연결하지 않음</option>${tasks.map(t=>`<option value="${esc(t.id)}"${d.taskId===t.id?' selected':''}>${esc([t.title,t.affiliation,t.cycle,t.status].filter(Boolean).join(' · '))}</option>`).join('')}</select><small>연결한 반복 업무의 상태와 날짜는 바꾸지 않습니다.</small></label></details><details data-action-results${d.execution==='done'||d.result||d.effect!=='unchecked'?' open':''}><summary>실행 결과·개선 효과 확인</summary>${textarea('result','실행 결과 · 완료 시 필수',d.result)}${select('effect','효과 확인',EFFECT,d.effect)}${textarea('effectEvidence','효과 근거 · 비교 기간과 수치',d.effectEvidence)}</details></fieldset><p class="home-action-message" role="status" tabindex="-1" data-action-message>${esc(error||notice)}</p>${state.conflict?'<p class="home-action-note">다른 곳에서 변경한 기록이 있습니다. 현재 입력을 확인한 뒤 최신 기록을 다시 불러와 주세요.</p><button type="button" data-action-reload>최신 기록 다시 불러오기</button>':''}<footer><button type="button" data-action-close>닫기</button>${status==='uncertain'||status==='reconciling'?`<button type="button" data-action-reconcile${status==='reconciling'?' disabled':''}>${status==='reconciling'?'저장 결과 확인 중…':'저장 결과 확인'}</button>`:`<button type="submit"${busy||state.conflict?' disabled':''}>${status==='saving'?'Notion에 저장 중…':'Notion에 저장'}</button>`}</footer></form>`;
}

/** The dialog is outside the home body so evaluation refreshes never replace a draft. */
export function createHomeActions({root,request}){
 let dialog=null,returnFocus=null,lastFocusTarget=null;
 const doc=root.ownerDocument??globalThis.document;
 function close(force=false){
  if(!force&&(session.isDirty()||session.state.requestId)&&!globalThis.confirm('저장되지 않았거나 확인 중인 내용이 있습니다. 닫을까요?'))return;
  dialog?.close();dialog?.remove();dialog=null;session.reset();
  if(!force){const fallback=lastFocusTarget?root.querySelector(`[data-home-action][data-store="${lastFocusTarget.store}"][data-issue="${lastFocusTarget.issue}"]`):root.querySelector('[data-home-actions-list]');(returnFocus?.isConnected?returnFocus:fallback)?.focus({preventScroll:true});}
  returnFocus=null;lastFocusTarget=null;
 }
 function readForm(){const form=dialog?.querySelector('[data-action-form]');if(!form)return;const data=new FormData(form),draft=emptyAction();for(const key of TEXT_FIELDS)draft[key]=String(data.get(key)??'');for(const key of ['causeState','execution','effect'])draft[key]=String(data.get(key));draft.assigneeIds=data.getAll('assigneeIds').map(String);draft.deadline=String(data.get('deadline')??'')||null;draft.taskId=String(data.get('taskId')??'')||null;session.edit(draft);if(session.state.status==='ready'){const message=dialog.querySelector('[data-action-message]');if(message)message.textContent='';}}
 function paint(state){
  if(!dialog)return;
  const previous=dialog.querySelector(':focus')?.getAttribute('name');
  const content=state.draft?renderActionForm(state):state.status==='list'?`<p class="home-action-context">${esc(state.listMonth)} · 저장된 대응 과제</p><p class="home-action-note">현재 평가가 정상이어도 대응 기록은 유지됩니다.</p><ul class="home-action-list">${state.list.map(a=>`<li><button type="button" data-action-open data-store="${a.target.store}" data-issue="${a.target.issue}"><strong>${esc(a.title)}</strong><span>${esc(targetLabel(a.target))}</span><span>${EXECUTION[a.execution]} · 효과 ${EFFECT[a.effect]}${a.deadline?' · '+esc(a.deadline):''}</span></button></li>`).join('')||'<li>이 평가 월에 저장된 대응 과제가 없습니다.</li>'}</ul>`:`<p role="status">${esc(state.error||(state.status==='loading'?'대응 기록을 불러오는 중…':''))}</p>${state.error?'<button type="button" data-action-reload>다시 불러오기</button>':''}`;
  dialog.innerHTML=`<header><h2 id="home-action-title">${state.listMonth?'월별 대응 기록':'대응 과제'}</h2><button type="button" data-action-close aria-label="대응 과제 닫기">닫기</button></header><div class="home-action-content">${content}</div>`;
  const focused=previous?dialog.querySelector(`[name="${previous}"]`):null;
  if(focused&&!focused.disabled)focused.focus({preventScroll:true});
  else if(state.status==='ready'&&state.notice)dialog.querySelector('[data-action-message]')?.focus({preventScroll:true});
  else if(state.status==='ready'&&!state.notice)dialog.querySelector('[name="title"]')?.focus({preventScroll:true});
  else if(['uncertain','reconciling'].includes(state.status))dialog.querySelector('[data-action-reconcile]')?.focus({preventScroll:true});
 }
 const session=createActionSession({request,onChange:paint});
 const unload=event=>{if(dialog&&(session.isDirty()||session.state.requestId)){event.preventDefault();event.returnValue='';}};
 function mount(trigger){
  returnFocus=trigger;dialog=doc.createElement('dialog');dialog.className='home-action-dialog';dialog.setAttribute('aria-labelledby','home-action-title');
  dialog.addEventListener('cancel',event=>{event.preventDefault();readForm();close();});
  dialog.addEventListener('input',readForm);
  dialog.addEventListener('change',event=>{readForm();if(event.target.name==='execution'&&event.target.value==='done'){const results=dialog.querySelector('[data-action-results]');if(results)results.open=true;}});
  dialog.addEventListener('submit',event=>{event.preventDefault();readForm();void session.save();});
  dialog.addEventListener('click',event=>{
   if(event.target.closest('[data-action-close]')){readForm();close();}
   else if(event.target.closest('[data-action-reconcile]'))void session.reconcile();
   else if(event.target.closest('[data-action-reload]')){if(session.isDirty()&&!globalThis.confirm('입력한 내용을 버리고 최신 기록을 불러올까요?'))return;const {target,listMonth}=session.state;void(target?session.open(target):session.list(listMonth));}
   else{const button=event.target.closest('[data-action-open]');if(button){const target={month:session.state.listMonth,store:button.dataset.store,issue:button.dataset.issue};lastFocusTarget=target;void session.open(target);}}
  });
  doc.body.append(dialog);dialog.innerHTML='<h2 id="home-action-title">대응 과제</h2>';dialog.showModal();
 }
 globalThis.addEventListener?.('beforeunload',unload);
 return {
  open(target,trigger){if(dialog)return;lastFocusTarget=target;mount(trigger);return session.open(target);},
  list(month,trigger){if(dialog)return;mount(trigger);return session.list(month);},
  reset(){close(true);},
  destroy(){close(true);globalThis.removeEventListener?.('beforeunload',unload);},
 };
}
