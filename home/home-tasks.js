const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DATE=/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const GROUPS=[['overdue','기한 지남','risk'],['today','오늘 예정','warn'],['upcoming','다가오는 업무 · 7일 이내','mild'],['unscheduled','예정일 확인 필요','consult']];
const CYCLES=[['1회성','일회성'],['일','일'],['주','주'],['2주','2주'],['월','월'],['분기','분기'],['반기','반기'],['연','연'],['','주기 미지정']];
const validDate=value=>typeof value==='string'&&DATE.test(value)&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
export function adaptDueTasks(data){
 if(data?.complete!==true||!Array.isArray(data.tasks)||!validDate(data.today))throw Error('업무 자료 확인 필요');
 const tasks=data.tasks.map(task=>{
  const url=new URL(task.url),known=GROUPS.some(([state])=>state===task.dateState);
  if(!known||typeof task.id!=='string'||typeof task.title!=='string'||url.protocol!=='https:'||url.username||url.password||!['app.notion.com','www.notion.so','notion.so'].includes(url.hostname)||task.dateState!=='unscheduled'&&!validDate(task.dueDate))throw Error('업무 자료 확인 필요');
  return {id:task.id,title:task.title,affiliation:String(task.affiliation??''),cycle:String(task.cycle??''),status:String(task.status??''),dueDate:task.dateState==='unscheduled'?null:task.dueDate,dateState:task.dateState,url:url.href};
 });
 return {tasks,today:data.today};
}
export function renderDueTasks(role,state={status:'loading'}){
 if(role!=='admin')return '<p>Due Database 업무는 관리자에게만 표시됩니다.</p>';
 const source='<div class="home-due-source"><h3>Due Database</h3><a href="https://app.notion.com/p/708559ecec484f4e83318d81afd7deff" target="_blank" rel="noreferrer">전체 업무 ↗</a></div><p class="home-due-note">현재 예정일 기준 · 선택한 평가 월과 무관합니다. 완료 처리와 날짜 업데이트는 Notion에서 합니다.</p>';
 if(state.status==='error')return `${source}<p role="status">업무를 불러오지 못했습니다. 연결 권한과 상태를 확인한 뒤 다시 시도해 주세요.</p><button type="button" data-home-task-retry>업무 다시 불러오기</button>`;
 if(state.status!=='ready')return `${source}<p role="status">업무를 불러오고 있습니다.</p>`;
 const selected=['all',...CYCLES.map(([key])=>key)].includes(state.selectedCycle)?state.selectedCycle:'all';
 const cycleOf=task=>CYCLES.some(([key])=>key===task.cycle)?task.cycle:'';
 const filters=[['all','전체'],...CYCLES];
 const tabs=`<div class="home-cycle-tabs" role="group" aria-label="업무 주기 선택">${filters.map(([key,label])=>{
  const count=state.tasks.filter(t=>key==='all'||cycleOf(t)===key).length;
  return `<button type="button" data-home-cycle="${esc(key)}" aria-pressed="${selected===key}" aria-controls="home-cycle-results">${label} <span>${count}</span></button>`;
 }).join('')}</div>`;
 const filtered=state.tasks.filter(t=>selected==='all'||cycleOf(t)===selected);
 const rank=Object.fromEntries(GROUPS.map(([key],i)=>[key,i]));
 const knownCycles=new Set(CYCLES.map(([key])=>key));
 return source+tabs+'<div id="home-cycle-results">'+(filtered.length?CYCLES.map(([key,label])=>{
  const tasks=filtered.filter(t=>(knownCycles.has(t.cycle)?t.cycle:'')===key).sort((a,b)=>rank[a.dateState]-rank[b.dateState]||(a.dueDate??'').localeCompare(b.dueDate??''));
  return tasks.length?`<section class="home-due-group" aria-label="${label} 업무"><h4><strong>${label}</strong><span>${tasks.length}건</span></h4><ul>${tasks.map(task=>{
   const [,dateLabel,color]=GROUPS.find(([state])=>state===task.dateState);
   return `<li class="home-due-task"><div class="home-due-title"><strong>${esc(task.title)}</strong><span class="home-chip home-${color}">${dateLabel}</span></div><p>${[task.affiliation,task.status?`Notion 상태 ${task.status}`:''].filter(Boolean).map(esc).join(' · ')}</p><div><span>${task.dueDate?`예정 ${esc(task.dueDate)}`:'예정일 미확인'}</span><a href="${esc(task.url)}" target="_blank" rel="noreferrer" aria-label="${esc(task.title)} · Notion에서 열기">Notion에서 열기 ↗</a></div></li>`;
  }).join('')}</ul></section>`:'';
 }).join(''):'<p>선택한 주기에 표시할 업무가 없습니다.</p>')+'</div>';
}
