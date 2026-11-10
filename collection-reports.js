// Supplemental observations never replace a regular monthly report or score input.
export const regularReports=reports=>(reports??[]).filter(report=>report.scope!=='custom-range');
export function collectionReportLabel(report){
 if(report?.scope!=='custom-range')return `${report.month} 수집`;
 const end=new Date(report.range.endExclusive+'T00:00:00Z');end.setUTCDate(end.getUTCDate()-1);
 const day=value=>{const [,m,d]=value.split('-');return `${Number(m)}/${Number(d)}`;};
 const stores=[...new Set((report.results??[]).map(row=>row.storeName))].join(', ');
 return `${day(report.range.start)}~${day(end.toISOString().slice(0,10))} · ${stores} · ${Number(report.month.slice(5))}월 점수 보충`;
}
