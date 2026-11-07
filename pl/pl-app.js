import {adaptPLResponse} from './pl-adapter.js?v=38556b11ed3e';
import {createPLCalculations} from './pl-calc.js?v=38556b11ed3e';
import {createPLRenderer} from './pl-render.js?v=38556b11ed3e';

// One read per session/entry; retries are explicit. No Notion calls originate here.
export function createPLScreen({root,request,now=()=>new Date()}) {
  let role=null, model=null, calc=null, renderer=null, state=null, pending=null;
  const themeDocument=globalThis.document;
  const applicationTheme=()=>themeDocument?.documentElement?.dataset.theme==='dark'?'dark':'light';
  let generation=0, destroyed=false, active=false, attempted=false, theme=applicationTheme(), phase='idle';
  function syncApplicationTheme(){
    theme=applicationTheme();root.dataset.theme=theme;
    if(state)state={...state,theme};
    if(dialog)root.querySelectorAll('[data-pl-theme]').forEach(element=>{element.dataset.plTheme=theme;});
    else paint();
  }
  themeDocument?.addEventListener?.('app-theme-change',syncApplicationTheme);
  const clock=()=>typeof now==='function'?now():now;
  const currentMonth=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'}).format(clock()).replace('/','-');
  const shift=(month,n)=>{const [y,m]=month.split('-').map(Number),d=new Date(Date.UTC(y,m-1+n,1));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;};
  const idsFor=value=>value==='all'?model.stores.map(s=>s.id):Array.isArray(value)?model.stores.filter(s=>value.includes(s.id)).map(s=>s.id):model.stores.some(s=>s.id===value)?[value]:[];
  const canonical=value=>{const ids=idsFor(value);return ids.length===model.stores.length?'all':ids.length===1?ids[0]:ids.length?ids:'all';};
  function fromURL() {
    const url=new URL(location.href),store=canonical(url.searchParams.get('stores')?.split(',')||'all'),hq=url.searchParams.get('hq');
    return {store,includeHQ:hq==='1'?true:hq==='0'?false:store==='all',hqExplicit:hq==='1'||hq==='0'};
  }
  function writeURL() {
    const url=new URL(location.href);
    if(state.store==='all')url.searchParams.delete('stores');else url.searchParams.set('stores',idsFor(state.store).join(','));
    if(state.hqExplicit)url.searchParams.set('hq',state.includeHQ?'1':'0');else url.searchParams.delete('hq');
    history.replaceState(history.state,'',url.href.replace(/([?&]stores=)([^&#]*)/,(_,key,value)=>key+value.replace(/%2C/gi,',')));
  }
  function initialState() {
    const month=model.currentMonth;
    return {...fromURL(),unit:'month',period:month,anchorMonth:month,chartMonth:month,expanded:{},sort:{key:'netProfit',dir:'asc'},trendFull:false,theme};
  }
  function paint() {
    if(!model||destroyed||phase!=='ready')return;
    root.innerHTML=renderer.renderPLApp(root.clientWidth>=1000?'pc':'mobile',state);
    root.querySelectorAll('[data-pl-style]').forEach(element=>{
      element.style.cssText=element.dataset.plStyle;
      element.removeAttribute('data-pl-style');
    });
    root.dataset.theme=state.theme;
  }
  function setState(patch,{url=true}={}) {
    const focused=document.activeElement, marker=focused?.closest('[data-pl-expand],[data-pl-select],[data-pl-action],[data-pl-chart],[data-pl-toggle-store],[data-pl-sort],[data-pl-unit]');
    const attrs=marker?[...marker.attributes].filter(a=>a.name.startsWith('data-pl-')):[];
    state={...state,...patch};
    if(Object.hasOwn(patch,'store')){state.store=canonical(patch.store);if(!state.hqExplicit&&!Object.hasOwn(patch,'includeHQ'))state.includeHQ=state.store==='all';}
    theme=state.theme;
    if(url)writeURL();paint();
    const match=attrs.length?[...root.querySelectorAll('[data-pl-expand],[data-pl-select],[data-pl-action],[data-pl-chart],[data-pl-toggle-store],[data-pl-sort],[data-pl-unit]')].find(el=>attrs.every(a=>el.getAttribute(a.name)===a.value)):null;
    match?.focus({preventScroll:true});
  }
  function displayConnection(message,error=false) {
    root.dataset.theme=theme;
    root.innerHTML='';
    const box=document.createElement('section');box.className='pl-connection';box.setAttribute('aria-live','polite');
    const text=document.createElement('p');text.textContent=message;box.append(text);
    if(error){const button=document.createElement('button');button.type='button';button.dataset.plAction='retry';button.textContent='다시 시도';box.append(button);}
    else {const progress=document.createElement('progress');progress.setAttribute('aria-label','손익 불러오는 중');box.append(progress);}
    root.append(box);
  }
  async function load() {
    if(destroyed||!active)return;
    pending?.abort();const controller=new AbortController();pending=controller;
    const token=++generation, requestedRole=role, to=currentMonth(),from=shift(to,-12);
    phase='loading';closePicker({focus:false});attempted=true;displayConnection('노션에서 손익을 불러오고 있습니다');
    try {
      const response=await request(`/api/pl?from=${from}&to=${to}`,{signal:controller.signal,timeoutMs:120000});
      if(destroyed||token!==generation||role!==requestedRole||controller.signal.aborted)return;
      model=adaptPLResponse(response,{role:requestedRole,now:clock()});calc=createPLCalculations(model);renderer=createPLRenderer(model,calc);
      state=state?{...state,...fromURL()}:initialState();phase='ready';paint();
    } catch(error) {
      if(destroyed||token!==generation||controller.signal.aborted)return;
      const message=error?.status===503?'노션 연결 설정을 확인해 주세요.':'손익을 불러오지 못했습니다. 다시 시도해 주세요.';
      phase='error';displayConnection(message,true);
    } finally {if(token===generation)pending=null;}
  }
  let draft=null,dialog=null,opener=null;
  function closePicker({focus=true}={}) {
    if(!dialog)return;dialog.close();dialog.remove();dialog=null;
    root.querySelector('[data-pl-action="stores"]')?.setAttribute('aria-expanded','false');
    if(focus)root.querySelector('[data-pl-action="stores"]')?.focus({preventScroll:true});
  }
  function updateDraft() {
    if(!state.hqExplicit&&!draft.changed)draft.hq=draft.ids.size===model.stores.length;
    dialog.querySelectorAll('[data-pl-draft-store]').forEach(input=>{input.checked=draft.ids.has(input.dataset.plDraftStore);});
    dialog.querySelector('[role="switch"]').setAttribute('aria-checked',String(draft.hq));
    dialog.querySelector('[data-pl-action="stores-apply"]').disabled=!draft.ids.size;
    dialog.querySelector('.pl-picker-selection-note').textContent=draft.ids.size?`${draft.ids.size}곳 선택`:'1곳 이상 선택';
  }
  function openPicker(button) {
    closePicker({focus:false});opener=button;draft={ids:new Set(idsFor(state.store)),hq:state.includeHQ,changed:false};
    const host=document.createElement('div');host.className='pl-shell pl-picker-host';host.dataset.plTheme=state.theme;
    dialog=document.createElement('dialog');dialog.id='pl-store-picker';dialog.className='pl-store-picker';dialog.setAttribute('aria-labelledby','pl-picker-title');
    const {plEsc:esc,plMoney:money}=renderer,months=calc.periodMonths(state.unit,state.period);
    dialog.innerHTML=`<h2 id="pl-picker-title">매장 선택</h2><div class="pl-picker-bulk"><button type="button" data-pl-action="stores-all">전체 선택</button><button type="button" data-pl-action="stores-none">전체 해제</button></div><fieldset><legend>합산할 매장</legend><div class="pl-picker-list">${model.stores.map(s=>`<label><input type="checkbox" data-pl-draft-store="${esc(s.id)}"><span>${esc(s.name)}</span><small>${money(calc.aggregatePL(months,s.id).calc?.netProfit)}</small></label>`).join('')}</div></fieldset><div class="pl-picker-hq"><span id="pl-hq-label">본부 포함</span><strong>${money(calc.aggregatePL(months,model.hq.id).calc?.netProfit)}</strong><button type="button" role="switch" class="pl-hq-switch" data-pl-action="hq-toggle" aria-labelledby="pl-hq-label" aria-describedby="pl-hq-hint" aria-checked="false"><span aria-hidden="true"></span></button><p id="pl-hq-hint">본부 순수익을 더해 최종 순수익을 봅니다</p></div><div class="pl-picker-footer"><p class="pl-picker-selection-note" aria-live="polite"></p><div><button type="button" data-pl-action="stores-cancel">취소</button><button type="button" class="btn-tonal" data-pl-action="stores-apply">적용</button></div></div>`;
    host.append(dialog);root.append(host);updateDraft();
    dialog.addEventListener('cancel',event=>{event.preventDefault();closePicker();host.remove();});
    dialog.addEventListener('close',()=>host.remove(),{once:true});dialog.showModal();opener.setAttribute('aria-expanded','true');dialog.querySelector('input')?.focus();
  }
  function click(event) {
    const button=event.target.closest('button');if(!button){const row=event.target.closest('tr[data-pl-store]');if(row&&!event.target.closest('input,label,select'))setState({store:row.dataset.plStore});return;}if(!root.contains(button))return;
    if(button.dataset.plUnit){const unit=button.dataset.plUnit,[year,month]=state.anchorMonth.split('-');return setState({unit,period:unit==='quarter'?`${year}-Q${Math.ceil(Number(month)/3)}`:unit==='half'?`${year}-H${Number(month)<=6?1:2}`:state.anchorMonth});}
    if(button.dataset.plExpand){const key=button.dataset.plExpand;return setState({expanded:{...state.expanded,[key]:!state.expanded[key]}});}
    if(button.dataset.plSort){const key=button.dataset.plSort;return setState({sort:{key,dir:state.sort.key===key&&state.sort.dir==='asc'?'desc':'asc'}});}
    if(button.dataset.plChart)return setState({chartMonth:button.dataset.plChart});
    switch(button.dataset.plAction) {
      case'retry':return load();
      case'stores':return openPicker(button);
      case'stores-all':draft.ids=new Set(model.stores.map(s=>s.id));return updateDraft();
      case'stores-none':draft.ids.clear();return updateDraft();
      case'hq-toggle':draft.hq=!draft.hq;draft.changed=true;return updateDraft();
      case'stores-cancel':return closePicker();
      case'stores-apply':if(!draft.ids.size)return;{const patch={store:[...draft.ids],includeHQ:draft.hq,hqExplicit:state.hqExplicit||draft.changed};closePicker({focus:false});setState(patch);root.querySelector('[data-pl-action="stores"]')?.focus();return;}
      case'all':return setState({store:'all'});
      case'select-store':return setState({store:button.dataset.store});
      case'trend':return setState({trendFull:!state.trendFull});
      case'sort-direction':return setState({sort:{...state.sort,dir:state.sort.dir==='asc'?'desc':'asc'}});
    }
  }
  function change(event) {
    const target=event.target;
    if(target.dataset.plDraftStore){if(target.checked)draft.ids.add(target.dataset.plDraftStore);else draft.ids.delete(target.dataset.plDraftStore);return updateDraft();}
    if(target.dataset.plToggleStore){const ids=new Set(idsFor(state.store));if(target.checked)ids.add(target.dataset.plToggleStore);else ids.delete(target.dataset.plToggleStore);if(!ids.size){target.checked=true;return;}return setState({store:[...ids]});}
    if(target.dataset.plSelect==='period'){const months=calc.periodMonths(state.unit,target.value),anchor=months.includes(state.anchorMonth)?state.anchorMonth:[...months].reverse().find(m=>model.months.includes(m))||months[0];return setState({period:target.value,anchorMonth:anchor,chartMonth:anchor});}
    if(target.dataset.plSelect==='sort')return setState({sort:{...state.sort,key:target.value}});
  }
  function keydown(event) {
    if(event.target.closest('button,select,input'))return;
    const row=event.target.closest('tr[data-pl-store]');if(row&&['Enter',' '].includes(event.key)){event.preventDefault();setState({store:row.dataset.plStore});}
  }
  const requestFrame=callback=>globalThis.requestAnimationFrame?globalThis.requestAnimationFrame(callback):setTimeout(callback,0);
  const cancelFrame=id=>globalThis.cancelAnimationFrame?globalThis.cancelAnimationFrame(id):clearTimeout(id);
  let observedWidth=root.clientWidth,resizeFrame=null;
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(()=>{
    const width=root.clientWidth;if(width===observedWidth)return;observedWidth=width;
    if(width>0&&phase==='ready'&&model&&!dialog&&resizeFrame===null)resizeFrame=requestFrame(()=>{
      resizeFrame=null;if(root.clientWidth>0&&phase==='ready'&&model&&!dialog&&!destroyed)paint();
    });
  }):null;
  observer?.observe(root);root.addEventListener('click',click);root.addEventListener('change',change);root.addEventListener('keydown',keydown);
  function resetSession(){generation++;pending?.abort();pending=null;if(resizeFrame!==null)cancelFrame(resizeFrame);resizeFrame=null;closePicker({focus:false});model=calc=renderer=state=null;role=null;attempted=false;active=false;phase='idle';root.replaceChildren();delete root.dataset.theme;}
  return {
    activate({role:nextRole}) {if(destroyed)return;if(role&&role!==nextRole)resetSession();role=nextRole;active=true;if(!attempted)return load();if(phase==='ready'&&model){state={...state,...fromURL()};paint();}},
    syncURL(){if(phase==='ready'&&model)setState(fromURL(),{url:false});},
    refresh(){return load();},
    resetSession,
    destroy(){resetSession();destroyed=true;themeDocument?.removeEventListener?.('app-theme-change',syncApplicationTheme);observer?.disconnect();root.removeEventListener('click',click);root.removeEventListener('change',change);root.removeEventListener('keydown',keydown);}
  };
}
