// A point is a saved observation, never a reconstructed historical value.
export function trendPoints(reports, { store, platform, month, mode, metric }) {
  const rows = reports.flatMap(report => report.results
    .filter(result => result.store === store && result.platform === platform && (mode === 'months' || report.month === month))
    .map(result => ({ ...result, id: report.id, month: report.month, at: result.collectedAt || report.createdAt })));
  rows.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const selected = mode === 'months' ? [...new Map(rows.map(row => [row.month, row])).values()].sort((a, b) => a.month.localeCompare(b.month)) : rows;
  return selected.map(row => {
    const key = metric === 'averageViews' ? 'views' : metric;
    const data = row.summary.metrics[key];
    const value = row.status === 'failed' ? null : metric === 'followers' ? row.followers : metric === 'included' ? (row.listComplete ? row.summary.included : null) : data?.[metric === 'averageViews' ? 'average' : 'total'];
    const incomplete = !row.listComplete || (data?.missing || 0) > 0;
    return { ...row, value: Number.isFinite(value) ? value : null, incomplete,
      coverageKey: JSON.stringify(row.coverage || []), observed: data?.observed ?? null, missing: data?.missing ?? null };
  });
}
export function pointChange(previous, current, mode) {
  if (!previous || !current || previous.value === null || current.value === null) return { text: '비교할 관측값이 부족합니다.', delta: null };
  if (mode === 'months') return { text: '월별 콘텐츠와 관측 시점이 다르므로 증감률을 계산하지 않습니다.', delta: null };
  if (previous.incomplete || current.incomplete || previous.coverageKey !== current.coverageKey) return { text: '수집 대상 또는 누락 범위가 달라 증감을 비교하지 않습니다.', delta: null };
  const delta = current.value - previous.value;
  const rate = previous.value > 0 ? ` (${(delta / previous.value * 100).toFixed(1)}%)` : ' (이전 값 0 · 증감률 없음)';
  return { text: `${delta > 0 ? '+' : ''}${delta.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}${rate}`, delta };
}
