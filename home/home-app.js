import {adaptEvaluationResponse} from '../eval/eval-render.js?v=54833f2411d6';
import {adaptDueTasks} from './home-tasks.js?v=54833f2411d6';
import {renderHome} from './home-render.js?v=54833f2411d6';
export const HOME_STORES=[['haenggung','테네스 행궁'],['sindong','테네스 신동'],['paldal','팔달통닭바베큐'],['simgeum','심금'],['sasek','사색'],['yamiok','야미옥']].map(([id,name])=>({id,name}));
export function createHomeScreen({root,request,now=()=>new Date()}){
 let role=null,active=false,batch=null,month=null,loaded=false,version=0;
 const current=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'}).format(now());
 const defaultMonth=()=>{const [y,m]=current().split('-').map(Number),d=new Date(Date.UTC(y,m-2,1));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;};
 const valid=value=>typeof value==='string'&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(value)&&value<=current();
 const urlMonth=()=>{const value=new URL(location.href).searchParams.get('month');return valid(value)?value:defaultMonth();};
 function cancel(){version++;batch?.controller.abort();batch?.resolve();batch=null;}
 function load(){
  cancel();if(!active||!role)return;loaded=false;const token=version,controller=new AbortController(),currentBatch={controller,token,rows:[],states:HOME_STORES.map(s=>({...s,status:'pending'})),queue:[...HOME_STORES],running:0,dueTasks:{status:role==='admin'?'loading':'restricted'}};batch=currentBatch;
  const done=new Promise(resolve=>{currentBatch.resolve=resolve;});
  root.innerHTML=`<div class="home-controls"><label for="home-month">평가 월<input id="home-month" data-home-month type="month" min="2020-01" max="${current()}" value="${month}"></label><p>최근 마감 월부터 확인합니다.</p></div><div data-home-body aria-live="polite"></div>`;
  const body=root.querySelector('[data-home-body]');
  function paint(){body.innerHTML=renderHome({month,rows:HOME_STORES.flatMap(s=>currentBatch.rows.filter(r=>r.store===s.id)),states:currentBatch.states,role,dueTasks:currentBatch.dueTasks});}
  const fresh=()=>active&&batch===currentBatch&&version===token&&!controller.signal.aborted;
  function pump(){if(!fresh())return;while(currentBatch.running<2&&currentBatch.queue.length){const store=currentBatch.queue.shift();currentBatch.running++;read(store);}if(!currentBatch.running&&!currentBatch.queue.length&&currentBatch.dueTasks.status!=='loading'){loaded=true;currentBatch.resolve();}}
  async function read(store){const state=currentBatch.states.find(s=>s.id===store.id);state.status='loading';try{const data=await request(`/api/eval?month=${encodeURIComponent(month)}&store=${store.id}`,{signal:controller.signal,timeoutMs:120000});if(!fresh())return;const model=adaptEvaluationResponse(data,{role});if(model.month!==month||model.rows.length!==1||model.rows[0].store!==store.id)throw Error('평가 응답 확인 필요');if(model.rows[0].check.state==='mapping'||model.rows[0].check.retryable)throw Error('평가 연결 확인 필요');currentBatch.rows.push(model.rows[0]);state.status='ready';}catch{if(!fresh())return;state.status='error';}finally{if(fresh()){currentBatch.running--;paint();pump();}}}
  async function readTasks(){try{const data=await request('/api/tasks',{signal:controller.signal,timeoutMs:45000});if(!fresh())return;currentBatch.dueTasks={status:'ready',...adaptDueTasks(data)};}catch{if(!fresh())return;currentBatch.dueTasks={status:'error'};}finally{if(fresh()){paint();pump();}}}
  paint();pump();if(role==='admin')void readTasks();return done;
 }
 const click=event=>{if(event.target.closest('[data-home-retry],[data-home-task-retry]'))return load();};
 const change=event=>{if(!event.target.matches('[data-home-month]'))return;const value=event.target.value;if(!valid(value)){event.target.setAttribute('aria-invalid','true');return;}if(value===month)return;month=value;const url=new URL(location.href);url.searchParams.set('month',month);history.replaceState(history.state,'',url.href);return load();};
 root.addEventListener('click',click);root.addEventListener('change',change);
 return {activate({role:nextRole}){const changed=role!==nextRole||month!==urlMonth();role=nextRole;month=urlMonth();active=true;if(changed||!loaded&&!batch)return load();},syncURL(){const value=urlMonth();if(value!==month){month=value;if(active)return load();}},refresh(){return load();},deactivate(){active=false;loaded=false;cancel();},resetSession(){cancel();active=false;role=null;loaded=false;month=null;root.replaceChildren();},destroy(){this.resetSession();root.removeEventListener('click',click);root.removeEventListener('change',change);}};
}
