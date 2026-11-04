import { apiText, exportLink } from './client.js?v=1981a61c1c33';
import { trendPoints, pointChange } from './insights.js?v=1981a61c1c33';
const $ = selector => document.querySelector(selector);
const node = (tag, text, className) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; };
const number = value => Number.isFinite(value) ? value.toLocaleString('ko-KR', { maximumFractionDigits: 1 }) : '미수집';
const date = value => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
const platformName = value => value === 'instagram' ? 'Instagram' : 'Threads';
const metricNames = { views: '조회 수', saved: '저장 수', shares: '공유 수', averageViews: '평균 조회 수', included: '인정 콘텐츠 수', followers: '팔로워 수' };
let context, state, detailVersion = 0;
export function initReporting(config) {
  context = config;
  for (const id of ['trendYear', 'trendStore', 'trendPlatform', 'trendMode', 'trendMonth', 'trendMetric']) {
    $('#' + id).addEventListener('change', () => {
      const changes = { [id]: $('#' + id).value };
      if (id === 'trendYear') { $('#trendMonth').value = `${$('#trendYear').value}-${$('#trendMonth').value.slice(5) || '01'}`; changes.trendMonth = $('#trendMonth').value; }
      if (id === 'trendMonth') { const year = $('#trendMonth').value.slice(0, 4); if (!year) return; if (![...$('#trendYear').options].some(o => o.value === year)) { const option = node('option', `${year}년`); option.value = year; $('#trendYear').append(option); } $('#trendYear').value = year; changes.trendYear = year; }
      context.writeUrl(changes); renderTrends();
    });
  }
  $('#trendFilters').addEventListener('submit', event => event.preventDefault());
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderTrends, 150); });
  let closedDetails = [];
  window.addEventListener('beforeprint', () => { closedDetails = [...$('#reportDetail').querySelectorAll('details:not([open])')]; for (const details of closedDetails) details.open = true; });
  window.addEventListener('afterprint', () => { for (const details of closedDetails) details.open = false; closedDetails = []; });
}
export function updateReporting(snapshot) {
  state = snapshot;
  if (!$('#trendStore').options.length) for (const store of snapshot.stores) { const option = node('option', store.name); option.value = store.id; $('#trendStore').append(option); }
  const years = [...new Set([snapshot.previousMonth.slice(0, 4), ...snapshot.reports.map(r => r.month.slice(0, 4))])].sort().reverse();
  $('#trendYear').replaceChildren(...years.map(year => { const option = node('option', `${year}년`); option.value = year; return option; }));
  syncReporting();
}
export function syncReporting() {
  if (!state) return;
  const params = new URL(location.href).searchParams;
  for (const id of ['trendStore', 'trendPlatform', 'trendMode', 'trendMetric']) {
    const control = $('#' + id), value = params.get(id);
    control.value = [...control.options].some(option => option.value === value) ? value : control.options[0].value;
  }
  $('#trendMonth').value = /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(params.get('trendMonth') || '') ? params.get('trendMonth') : state.previousMonth;
  const requestedYear = params.get('trendYear');
  const year = /^(?!0000)\d{4}$/.test(requestedYear || '') ? requestedYear : $('#trendMonth').value.slice(0, 4);
  if (![...$('#trendYear').options].some(o => o.value === year)) { const option = node('option', `${year}년`); option.value = year; $('#trendYear').append(option); }
  $('#trendYear').value = year;
  $('#trendMonth').value = `${year}-${$('#trendMonth').value.slice(5)}`;
  renderTrends();
  if (params.get('view') === 'report') void renderDetail(params.get('report'));
  else detailVersion++;
}
export function reportActions(report, { showOpen = true } = {}) {
  const actions = node('div', undefined, 'report-links');
  const open = node('button', '상세 보고서', 'button-quiet'); open.type = 'button';
  open.addEventListener('click', () => { context.writeUrl({ view: 'report', report: report.id }); context.syncView(); syncReporting(); $('#detail-title').focus(); }); if (showOpen) actions.append(open);
  for (const [label, suffix] of (context.isReadOnly?.() ? [['텍스트 보고서', '/markdown']] : [['텍스트 보고서', '/markdown'], ['원자료 JSON', '']])) {
    const link = exportLink(label, `/api/report/${report.id}${suffix}`, `${report.month}-${report.id}${suffix ? '.md' : '.json'}`); actions.append(link);
  }
  const remove = node('button', report.deletedAt ? '기록 복원' : '휴지통으로 이동', 'link-button'); remove.type = 'button';
  remove.addEventListener('click', () => void changeVisibility(report)); if (!context.isReadOnly?.()) actions.append(remove); return actions;
}
async function changeVisibility(report) {
  if (context.isBusy()) return;
  if (!report.deletedAt && !confirm(`${report.month} · ${[...new Set(report.results.map(r => r.storeName))].join(', ')}\n${date(report.createdAt)} 실행 기록 전체를 휴지통으로 옮길까요?\n목록과 추이 분석에서 제외됩니다. 원자료는 보존하고 휴지통에서 복원할 수 있습니다. Meta·노션 자료는 바뀌지 않습니다.`)) return;
  context.setBusy(true);
  try {
    const result = await context.api('/api/report/visibility', { id: report.id, deleted: !report.deletedAt }); context.message(result.message);
    await context.refresh();
  } catch (error) { context.message(error.message, true); }
  finally { context.setBusy(false); }
}
function svgNode(tag, attrs = {}, text) {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) n.setAttribute(key, value);
  if (text !== undefined) n.textContent = text; return n;
}
function drawChart(points, metric, mode) {
  const figure = node('figure', undefined, 'trend-chart');
  figure.append(node('figcaption', `${metricNames[metric]} · ${mode === 'months' ? '대상 월별 최근 관측값' : '수집 시각별 관측값'}`));
  const width = Math.max(260, Math.min(960, $('#trendContent').clientWidth - 38));
  const svg = svgNode('svg', { viewBox: `0 0 ${width} 300`, role: 'img', 'aria-label': `${metricNames[metric]} 추이 그래프. 정확한 수치는 아래 관측 기록 표에서 확인하세요.` });
  const values = points.map(p => p.value).filter(Number.isFinite);
  const max = Math.max(...values, 1), left = 80, right = width - 24, top = 24, bottom = 244;
  const monthIndex = month => { const [year, m] = month.split('-').map(Number); return year * 12 + m; };
  const times = points.map(p => mode === 'months' ? monthIndex(p.month) : new Date(p.at).getTime());
  const span = times.at(-1) - times[0];
  const x = i => span === 0 ? (left + right) / 2 : left + (times[i] - times[0]) / span * (right - left);
  const y = v => bottom - v / max * (bottom - top);
  for (let i = 0; i <= 4; i++) {
    const value = max * i / 4;
    svg.append(svgNode('line', { x1: left, x2: right, y1: y(value), y2: y(value), class: 'chart-grid' }), svgNode('text', { x: left - 12, y: y(value) + 4, 'text-anchor': 'end', class: 'chart-label' }, number(value)));
  }
  // Null observations break the path; no interpolation across unobserved values.
  let path = '', connected = false;
  points.forEach((point, i) => {
    if (point.value === null) { connected = false; return; }
    if (i > 0 && mode === 'months' && times[i] - times[i - 1] > 1) connected = false;
    path += `${connected ? 'L' : 'M'}${x(i)},${y(point.value)} `; connected = true;
  });
  svg.append(svgNode('path', { d: path, class: 'chart-line' }));
  let lastTick = -Infinity;
  points.forEach((point, i) => {
    if (point.value !== null) {
      const circle = svgNode('circle', { cx: x(i), cy: y(point.value), r: 4, class: point.incomplete ? 'chart-point incomplete' : 'chart-point' });
      circle.append(svgNode('title', {}, `${point.month} · ${date(point.at)} · ${number(point.value)}${point.incomplete ? ' · 일부 수집' : ''}`)); svg.append(circle);
    } else svg.append(svgNode('text', { x: x(i), y: bottom - 8, 'text-anchor': 'middle', class: 'chart-label' }, '미수집'));
    if (i === 0 || i === points.length - 1 || (x(i) - lastTick > 150 && right - x(i) > 150)) {
      const label = mode === 'months' ? point.month : date(point.at).replace(/^\d{4}\. /, '');
      svg.append(svgNode('text', { x: x(i), y: 280, 'text-anchor': i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle', class: 'chart-label' }, label));
      lastTick = x(i);
    }
  });
  figure.append(svg); return figure;
}
function readableTable(headers, rows, className = '') {
  const wrap = node('div', undefined, 'table-scroll'); const table = node('table', undefined, `reading-table ${className}`), head = node('thead'), tr = node('tr');
  for (const label of headers) { const th = node('th', label); th.scope = 'col'; tr.append(th); } head.append(tr); table.append(head);
  const body = node('tbody'); for (const row of rows) { const tr = node('tr'); for (const [index, value] of row.entries()) { const td = node('td'); td.dataset.label = headers[index]; td.append(value instanceof Node ? value : node('span', value)); tr.append(td); } body.append(tr); } table.append(body); wrap.append(table); return wrap;
}
function renderTrends() {
  if (!state) return;
  const store = $('#trendStore').value;
  const threads = state.stores.find(s => s.id === store)?.threads;
  $('#trendPlatform').querySelector('[value="threads"]').disabled = !threads;
  if (!threads) $('#trendPlatform').value = 'instagram';
  const platform = $('#trendPlatform').value, mode = $('#trendMode').value, metric = $('#trendMetric').value;
  $('#trendMonthLabel').hidden = mode === 'months';
  const target = $('#trendContent'); target.replaceChildren();
  const points = trendPoints(state.reports, { store, platform, month: $('#trendMonth').value, year: $('#trendYear').value, mode, metric });
  const basis = node('details', undefined, 'compact-details'); basis.append(node('summary', '집계 기준'), node('p', '선택한 월에 게시한 콘텐츠의 수집 시점 누적값입니다. 월별 콘텐츠·관측일이 달라 증감률은 계산하지 않습니다. 미수집은 0이 아니며, 팔로워는 수집 시점 값입니다.', 'small'));
  if (!points.length) { target.append(node('p', '이 기간의 수집 기록이 없습니다.', 'empty')); return; }
  const latest = points.at(-1), previous = points.at(-2), change = pointChange(previous, latest, mode);
  const summary = node('div', undefined, 'analysis-summary');
  const value = node('div'); value.append(node('span', `${platformName(platform)} ${metricNames[metric]}`, 'small'), node('strong', number(latest.value)), node('span', `${latest.month} 게시물 · 누적값`, 'small'));
  const delta = node('div');
  if (mode === 'months') delta.append(node('span', `${$('#trendYear').value}년 수집 월`, 'small'), node('strong', `${points.length} / 12`), node('span', '기록이 있는 월만 표시', 'small'));
  else delta.append(node('span', '직전 수집 대비', 'small'), node('strong', change.delta === null ? '비교 보류' : `${change.delta > 0 ? '+' : ''}${number(change.delta)}`, 'change-value'));
  if (mode !== 'months') basis.append(node('p', change.text, 'small'));
  summary.append(value, delta); target.append(summary, drawChart(points, metric, mode));
  basis.append(node('p', `${points.length}개 관측 기록 · 빈 값은 미수집으로 표시합니다. 빈 원은 일부 수집이며, 미수집 지점의 선은 연결하지 않습니다.${points.length < 2 ? ' 변화 비교에는 두 번 이상의 수집이 필요합니다.' : ''}`, 'small'));
  const records = node('details', undefined, 'compact-details'); records.open = false; records.append(node('summary', '월별 수치 보기'));
  records.append(readableTable(['대상 월', '관측 시각 (한국)', metricNames[metric], '집계 범위', '근거'], points.map(p => {
    const link = node('a', '보고서', 'text-link'); link.href = `?view=report&report=${p.id}`;
    link.addEventListener('click', event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); context.writeUrl({ view: 'report', report: p.id }); context.syncView(); syncReporting(); $('#detail-title').focus(); });
    return [p.month, date(p.at), number(p.value), p.status === 'failed' ? '수집 실패' : `${p.summary.included}건 인정 · ${p.incomplete ? '누락 또는 목록 불완전' : '확인 완료'}`, link];
  })));
  target.append(records, basis);
}
function safePostLink(item) {
  try { const url = new URL(item.url); if (!['https:', 'http:'].includes(url.protocol)) return node('span', '링크 없음'); const a = node('a', '원문 열기', 'text-link'); a.href = url.href; a.target = '_blank'; a.rel = 'noreferrer'; return a; }
  catch { return node('span', '링크 없음'); }
}
async function renderDetail(id) {
  const version = ++detailVersion, target = $('#reportDetail'); target.replaceChildren(node('p', '보고서를 불러오고 있습니다.', 'loading-text'));
  if (!/^[a-f0-9-]{36}$/.test(id || '')) { target.replaceChildren(node('p', '보고서를 선택해 주세요. 실행 기록에서 상세 보고서를 열 수 있습니다.', 'empty')); return; }
  try {
    const report = await context.api(`/api/report/${id}`); if (version !== detailVersion) return;
    target.replaceChildren();
    const summary = [...state.reports, ...(state.trash || [])].find(r => r.id === id);
    const cover = node('div', undefined, 'report-cover'); cover.append(node('span', `${report.month} 실적`, 'small'), node('h3', `${report.month} 매장 마케팅 보고서`), node('p', `${[...new Set(report.results.map(r => r.storeName))].join(' · ')} / ${report.results.length}개 계정`), node('p', `실행 시각 ${new Date(report.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} (한국)`, 'small'));
    if (report.scope) {
      cover.append(node('p', `실행 범위 ${report.scope.store === 'all' ? '전 매장' : '선택 매장'} · 대상 ${report.scope.expectedAccounts}개 / 연결 ${report.scope.connectedAccounts}개 계정`, 'small'));
      if (report.scope.skipped.length) cover.append(node('p', `미연결로 건너뜀: ${report.scope.skipped.map(a => `${a.storeName} / ${platformName(a.platform)}`).join(', ')}`, 'analysis-note'));
    }
    if (summary?.deletedAt) cover.append(node('p', `휴지통에 있는 기록 · ${date(summary.deletedAt)} 이동. 활성 목록과 추이에서 제외되어 있습니다.`, 'analysis-note'));
    target.append(cover);
    const toolbar = node('div', undefined, 'detail-tools');
    const print = node('button', '인쇄 / PDF 저장', 'button-quiet'); print.type = 'button'; print.addEventListener('click', () => window.print()); toolbar.append(print);
    const copy = node('button', '보고서 복사', 'button-quiet'); copy.type = 'button'; copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(await apiText(`/api/report/${id}/markdown`)); context.message('텍스트 보고서를 복사했습니다.'); }
      catch { context.message('복사하지 못했습니다. 텍스트 보고서를 열어 직접 복사해 주세요.', true); }
    }); toolbar.append(copy); if (summary) toolbar.append(reportActions(summary, { showOpen: false })); target.append(toolbar);
    const basis = node('details', undefined, 'compact-details'); basis.append(node('summary', '집계 기준'), node('p', '해당 월에 게시한 콘텐츠의 수집 시점 누적 실적입니다. 미수집은 0이 아니며, 점수는 승인 전입니다.', 'small')); target.append(basis);
    for (const result of report.results) {
      const section = node('section', undefined, 'report-account');
      section.append(node('h3', `${result.storeName} / ${platformName(result.platform)}`), node('p', `@${result.username || '계정명 미기록'} · ${date(result.collectedAt || report.createdAt)} 관측 · ${result.status === 'failed' ? '수집 실패' : result.status === 'partial' ? '일부 수집' : '수집 완료'} · 목록 ${result.listComplete ? '확인 완료' : '완전성 미확인'}`, 'small'));
      const metrics = node('dl', undefined, 'report-metrics');
      for (const [label, value, note] of [
        ['인정 콘텐츠', `${result.summary.included}건`, `검토 ${result.summary.pending}건 / 제외 ${result.summary.excluded}건`],
        ...['views', 'saved', 'shares'].map(key => [metricNames[key], number(result.summary.metrics[key].total), `${result.summary.metrics[key].observed}건 확인 / ${result.summary.metrics[key].missing}건 미수집`]),
        ['평균 조회', number(result.summary.metrics.views.average), `확인한 ${result.summary.metrics.views.observed}건 기준`],
        ['팔로워', number(result.followers), '수집 시점 관측값']
      ]) { const div = node('div'); div.append(node('dt', label), node('dd', value), node('span', note, 'small')); metrics.append(div); } section.append(metrics);
      const issues = [...new Set((result.issues || []).map(issue => typeof issue === 'string' ? issue : JSON.stringify(issue)))];
      if (issues.length) { const details = node('details', undefined, 'quality-details'); details.open = result.status === 'failed'; details.append(node('summary', `확인 사항 ${issues.length}건`)); const list = node('ul'); for (const issue of issues) list.append(node('li', issue)); details.append(list); section.append(details); }
      const evidence = node('details', undefined, 'compact-details'); evidence.append(node('summary', `게시물별 근거 · ${result.items?.length || 0}건`));
      if (!result.items?.length) evidence.append(node('p', result.status === 'failed' || !result.listComplete ? '게시물 목록을 확인하지 못했습니다. 0건으로 판정하지 않습니다.' : '확인된 대상 월의 게시물이 없습니다.', 'empty'));
      else evidence.append(readableTable(['게시일 / 콘텐츠', '판정', '조회', '저장', '공유', '원문'], result.items.map(item => {
        const content = node('div'); content.append(node('span', `${date(item.timestamp)} · ${item.type || '유형 미기록'}`), node('p', item.caption || '(본문 없음)', 'post-caption'));
        const eligibility = { included: '인정', review: '검토 필요', excluded: '제외' }[item.eligibility] || '미확인'; const decision = node('div'); decision.append(node('strong', eligibility), node('p', item.reason || '', 'small'));
        if (item.issues?.length) decision.append(node('p', item.issues.join(' / '), 'small'));
        return [content, decision, number(item.metrics?.views), number(item.metrics?.saved), number(item.metrics?.shares), safePostLink(item)];
      }), 'posts-table'));
      section.append(evidence); target.append(section);
    }
    target.append(node('p', `실행 ID ${report.id} · 원자료와 텍스트 보고서를 함께 보존합니다.`, 'report-footnote'));
  } catch (error) { if (version === detailVersion) target.replaceChildren(node('p', `${error.message} 새로고침으로 다시 시도해 주세요.`, 'empty')); }
}
