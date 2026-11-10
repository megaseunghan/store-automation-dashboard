const STORE_IDS=['simgeum','tenacebar','paldalbbq','forest','yummy'];
const DATE=/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const DAY=86400000;
function invalid(field,message){const error=new Error(message);error.field=field;throw error;}
function calendar(value,field){
 if(typeof value!=='string'||!DATE.test(value))invalid(field,'날짜를 YYYY-MM-DD 형식으로 확인해 주세요.');
 const stamp=Date.parse(value+'T00:00:00Z');
 if(!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,10)!==value)invalid(field,'실제 달력에 있는 날짜인지 확인해 주세요.');
 return stamp;
}
/** Inclusive KST calendar input. Returns null for unchanged regular-month requests. */
export function validateCollectionRange(input,{now=new Date(),stores=STORE_IDS}={}){
 const hasRange=input&&Object.hasOwn(input,'range'),hasTarget=input&&Object.hasOwn(input,'targetMonth');
 if(!hasRange&&!hasTarget)return null;
 if(!hasRange||!input.range||typeof input.range!=='object'||Array.isArray(input.range))invalid('rangeStart','시작일과 종료일을 확인해 주세요.');
 const ids=stores.map(store=>typeof store==='string'?store:store.id);
 if(typeof input.store!=='string'||!ids.includes(input.store))invalid('collectStore','기간 직접 지정은 매장 한 곳을 선택해 주세요.');
 if(Object.keys(input.range).length!==2||!Object.hasOwn(input.range,'start')||!Object.hasOwn(input.range,'end'))invalid('rangeStart','시작일과 종료일을 모두 확인해 주세요.');
 const {start,end}=input.range,a=calendar(start,'rangeStart'),b=calendar(end,'rangeEnd');
 if(start<'2026-01-01')invalid('rangeStart','시작일은 2026-01-01 이후로 확인해 주세요.');
 if(a>b)invalid('rangeEnd','종료일은 시작일 이후로 확인해 주세요.');
 if((b-a)/DAY+1>31)invalid('rangeEnd','지정 기간은 시작일과 종료일을 포함해 최대 31일입니다. 날짜를 확인해 주세요.');
 const clock=now instanceof Date?now:new Date(now),today=new Date(clock.getTime()+9*3600000).toISOString().slice(0,10);
 if(end>today)invalid('rangeEnd','종료일은 한국 시간 오늘까지 선택해 주세요.');
 const targetMonth=hasTarget&&input.targetMonth!==''?input.targetMonth:start.slice(0,7);
 if(typeof targetMonth!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(targetMonth)||targetMonth<'2020-01'||targetMonth>today.slice(0,7))invalid('targetMonth','점수 합산 대상 월을 YYYY-MM 형식, 한국 시간 이번 달까지로 확인해 주세요.');
 return {store:input.store,month:targetMonth,targetMonth,range:{start,end},normalizedRange:{start,endExclusive:new Date(b+DAY).toISOString().slice(0,10),timezone:'Asia/Seoul'}};
}
