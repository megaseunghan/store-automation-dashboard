import {marketingBasisText} from './marketing-basis.js?v=e169d5941d13';
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const stamp=value=>{const d=new Date(value);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)+' KST':'수집 시각 확인 필요';};
const short=ref=>`${stamp(ref.collectedAt)} · ${ref.reportId.slice(0,8)}`;
let activeDialog=null,writing=false,openVersion=0;
export function cancelMarketingBasisDialog(){openVersion++;activeDialog?.close();}

export function appendMarketingBasis(card,{month,store,resolution,growth,isReadOnly,api,onChange}){
 const group=node('div',undefined,'marketing-basis');group.dataset.basisState=resolution.state;
 const text=marketingBasisText(resolution).replace(/^수집 기준:\s*/,'');
 group.append(node('p','기준: '+text,'marketing-basis-text'),node('span',resolution.state==='pinned'?'고정':resolution.state==='auto'?'자동 선택':'기준 확인 필요','marketing-basis-state'));
 if(resolution.warningDays)group.append(node('p',`수집 시점 차이 ${resolution.warningDays}일`,'marketing-basis-warning'));
 if(resolution.newer)group.append(node('p',`더 최신 수집본이 있습니다 (${Number.isFinite(growth)?`조회수 ${growth>=0?'+':''}${growth.toLocaleString('ko-KR',{maximumFractionDigits:1})}%`:'조회수 비교 보류'})`,'marketing-basis-newer'));
 const live=node('p',undefined,'small');live.setAttribute('aria-live','polite');group.append(live);
 if(!isReadOnly){const change=node('button',resolution.state==='auto'?'기준 고정':'기준 변경','marketing-basis-change');change.type='button';change.addEventListener('click',()=>{if(writing){live.textContent='기준 변경 결과를 확인하고 있습니다.';return;}void openBasisDialog({month,store,api,onChange,opener:change,live});});group.append(change);}
 const evidence=node('button','수집 기준 근거 복사','button-quiet marketing-basis-copy');evidence.type='button';evidence.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(marketingBasisText(resolution,{includeIds:true}));live.textContent='수집 기준 근거를 복사했습니다.';}catch{live.textContent='복사하지 못했습니다. 표시된 수집 기준을 확인해 주세요.';}});group.append(evidence);card.append(group);
}

async function openBasisDialog({month,store,api,onChange,opener,live}){
 const version=++openVersion,route=globalThis.location?.href;
 if(activeDialog)activeDialog.close();opener.disabled=true;
 let data;try{data=await api('/api/marketing/basis?'+new URLSearchParams({month,store:store.id}));}catch{live.textContent='기준 목록을 읽지 못했습니다. 다시 시도해 주세요.';opener.disabled=false;return;}opener.disabled=false;
 if(version!==openVersion||route!==globalThis.location?.href||!opener.isConnected||opener.closest?.('[hidden]')||opener.getClientRects?.().length===0)return;
 if(activeDialog)activeDialog.close();
 const dialog=node('dialog',undefined,'marketing-basis-dialog');activeDialog=dialog;dialog.setAttribute('aria-labelledby','marketing-basis-title');
 const title=node('h2',`${month} · ${store.name} 기준 변경`);title.id='marketing-basis-title';dialog.append(title,node('p','정규 기준본이 중복 게시물을 우선합니다. 보충본끼리는 아래 목록에서 먼저 나오는 수집본을 우선합니다. 새로 수집해도 고정한 기준은 바뀌지 않습니다.','small'));
 const regularLabel=node('label','정규 수집본'),regular=node('select');regular.id='marketing-basis-regular';regularLabel.htmlFor=regular.id;
 for(const ref of data.candidates.regular){const option=node('option',short(ref));option.value=ref.reportId;regular.append(option);}regular.value=data.basis?.regular?.reportId??data.candidates.regular[0]?.reportId??'';dialog.append(regularLabel,regular);
 const preview=node('p',undefined,'small');preview.id='marketing-basis-preview';regular.setAttribute('aria-describedby',preview.id);const updatePreview=()=>{const selected=data.candidates.regular.find(ref=>ref.reportId===regular.value);preview.textContent=selected?`선택한 정규 기준: ${short(selected)}`:'정규 수집본을 확인해 주세요.';};updatePreview();regular.addEventListener('change',updatePreview);dialog.append(preview);
 const supplements=node('fieldset'),legend=node('legend','보충 수집본 (선택)');supplements.append(legend);
 const selected=new Set((data.basis?.supplements??[]).map(ref=>ref.reportId));
 const orderedSupplements=[...(data.basis?.supplements??[]).map(ref=>data.candidates.supplements.find(candidate=>candidate.reportId===ref.reportId)).filter(Boolean),...data.candidates.supplements.filter(ref=>!selected.has(ref.reportId))];
 for(const [index,ref]of orderedSupplements.entries()){const label=node('label',undefined,'marketing-basis-option'),input=node('input');input.type='checkbox';input.value=ref.reportId;input.checked=selected.has(ref.reportId);input.dataset.supplement='true';label.append(input,node('span',`${index+1}. ${ref.range.start}~${ref.range.endExclusive} 미만 · ${short(ref)}`));supplements.append(label);}
 if(!data.candidates.supplements.length)supplements.append(node('p','이 월에 사용할 수 있는 보충 수집본이 없습니다.','small'));dialog.append(supplements);
 const history=node('details'),historySummary=node('summary','기준 변경 이력');history.append(historySummary);
 for(const entry of data.history??[]){let previous='이전 고정 기준 없음';if(entry.previous?.regular)previous=marketingBasisText({...entry.previous,state:entry.previous.pinnedAt?'pinned':'auto'});history.append(node('p',`${stamp(entry.changedAt)} · 이전 ${previous}`,'small'));}dialog.append(history);
 const notice=node('p');notice.setAttribute('aria-live','polite');notice.className='marketing-basis-dialog-notice';dialog.append(notice);
 const actions=node('div',undefined,'marketing-basis-actions'),cancel=node('button','취소','button-quiet'),save=node('button','이 수집본으로 기준 변경');cancel.type=save.type='button';cancel.autofocus=true;save.disabled=!regular.value;
 cancel.addEventListener('click',()=>dialog.close());regular.addEventListener('change',()=>{if(!writing)save.disabled=!regular.value;});
 save.addEventListener('click',async()=>{
  if(writing||save.disabled)return;writing=true;save.disabled=true;regular.disabled=true;for(const input of supplements.querySelectorAll('input'))input.disabled=true;notice.textContent='선택한 수집본을 기준으로 저장하고 있습니다.';
  try{
   await api('/api/marketing/basis',{month,store:store.id,regularReportId:regular.value,supplementReportIds:[...supplements.querySelectorAll('input:checked')].map(input=>input.value),expect:data.basis??null});
   live.textContent='마케팅 수집 기준을 변경했습니다.';dialog.close();await onChange?.();
  }catch{notice.textContent='변경 결과를 확인하지 못했거나 다른 기준으로 바뀌었습니다. 닫은 뒤 목록을 다시 열어 현재 기준을 확인해 주세요. 자동으로 다시 저장하지 않습니다.';}
  finally{writing=false;}
 });actions.append(cancel,save);dialog.append(actions);
 dialog.addEventListener('keydown',event=>{if(event.key!=='Tab')return;const focusable=[...dialog.querySelectorAll('button,input,select,summary')].filter(n=>!n.disabled),first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}});
 dialog.addEventListener('close',()=>{dialog.remove();if(activeDialog===dialog)activeDialog=null;if(opener.isConnected)opener.focus();});document.body.append(dialog);dialog.showModal();cancel.focus();
}
