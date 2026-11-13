import {validateCollectionRange} from './collect-range.js?v=c96d61931b48';

export function createCollectionRangeForm({form,month,stores,now=()=>new Date()}){
 const ids=['collectCustomRange','collectRangeFields','rangeStart','rangeEnd','targetMonth','collectStore'];
 const controls=Object.fromEntries(ids.map(id=>[id,form.querySelector('#'+id)]));
 const fields=['collectStore','rangeStart','rangeEnd','targetMonth'];
 let state={disabled:false,readOnly:false};
 function clearErrors(){for(const field of fields){form.querySelector('#'+field+'Error').textContent='';controls[field].removeAttribute('aria-invalid');}}
 function sync(next=state){
  state=next;const enabled=controls.collectCustomRange.checked&&!state.readOnly;
  controls.collectCustomRange.hidden=state.readOnly;controls.collectCustomRange.disabled=state.disabled||state.readOnly;
  controls.collectRangeFields.hidden=!enabled;
  for(const field of ['rangeStart','rangeEnd','targetMonth']){controls[field].disabled=!enabled||state.disabled||state.readOnly;controls[field].required=enabled&&field!=='targetMonth';}
  const all=[...controls.collectStore.options].find(option=>option.value==='all');if(all)all.disabled=enabled;
  if(enabled&&controls.collectStore.value==='all')controls.collectStore.value='';
  if(!enabled&&!controls.collectStore.value)controls.collectStore.value='all';
 }
 function changed(){clearErrors();sync();if(controls.collectCustomRange.checked&&!state.readOnly)controls.rangeStart.focus();}
 controls.collectCustomRange.addEventListener('change',changed);
 const clearField=event=>{const id=event.target?.id;if(fields.includes(id)){form.querySelector('#'+id+'Error').textContent='';controls[id].removeAttribute('aria-invalid');}};
 form.addEventListener?.('input',clearField);form.noValidate=true;sync();
 function getRequest(){
  clearErrors();
  try{
   if(state.readOnly||state.disabled)throw Object.assign(Error('수집 요청을 실행할 수 없습니다.'),{field:'collectStore'});
   if(!controls.collectCustomRange.checked){
    if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month.value)||month.value<'2020-01'||(month.max&&month.value>month.max))throw Object.assign(Error('집계가 끝난 지난달까지 선택해 주세요.'),{field:'collectStore'});
    return {store:controls.collectStore.value,month:month.value};
   }
   const data={store:controls.collectStore.value,range:{start:controls.rangeStart.value,end:controls.rangeEnd.value},...(controls.targetMonth.value?{targetMonth:controls.targetMonth.value}:{})};
   validateCollectionRange(data,{stores:stores(),now:now()});return data;
  }catch(error){const field=fields.includes(error.field)?error.field:'rangeStart';form.querySelector('#'+field+'Error').textContent=error.message;controls[field].setAttribute('aria-invalid','true');controls[field].focus();throw error;}
 }
 return {getRequest,sync,clearErrors,destroy(){controls.collectCustomRange.removeEventListener('change',changed);form.removeEventListener?.('input',clearField);}};
}
