import './navigation.js?v=e169d5941d13';
import { createScoreWorkspace } from './score-ui.js?v=e169d5941d13';
import { apiRequest, isCloud, sessionStorageKey, onSessionFailure } from './client.js?v=e169d5941d13';
import { authRecovery, createAccessLinkExchange, accessKeyFromLink } from './auth-recovery.js?v=e169d5941d13';
import { AUTOMATIONS } from './modules.js?v=e169d5941d13';
import { initReporting, updateReporting, syncReporting, reportActions, resetReportingSession } from './reporting.js?v=e169d5941d13';
import { createPLScreen } from './pl/pl-app.js?v=e169d5941d13';
import { createEvalScreen, evaluationRouteParams } from './eval/eval-app.js?v=e169d5941d13';
import { createHomeScreen } from './home/home-app.js?v=e169d5941d13';
import {createCollectionRangeForm} from './collect-form.js?v=e169d5941d13';
import {regularReports,collectionReportLabel} from './collection-reports.js?v=e169d5941d13';
let csrf = '', busy = false, refreshTimer, activeView;
let readOnly = false, accessPending = false;
let stores = [], lastPlatform = 'instagram', snapshot = null, refreshVersion = 0;
let scoreSelectionVersion=0;
const marketingStoreAliases={haenggung:'tenacebar',sindong:'forest',paldal:'paldalbbq',simgeum:'simgeum',yamiok:'yummy',sasek:'sasek'};
const evaluationStoreNames={haenggung:'테네스 행궁',sindong:'테네스 신동',paldal:'팔달통닭바베큐',simgeum:'심금',sasek:'사색',yamiok:'야미옥'};
const validMonth = value => /^(?!0000)[0-9]{4}-(0[1-9]|1[0-2])$/.test(value || '');
const $ = selector => document.querySelector(selector);
const el = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
const platformName = platform => platform === 'instagram' ? 'Instagram' : 'Threads';
const dateLabel = date => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(date));
function message(text, error = false) { const box = $('#notice'); box.textContent = text; box.className = error ? 'notice error' : 'notice'; }
const api = (path, data) => apiRequest(path, data, csrf);
const plScreen=createPLScreen({root:$('#plContent'),request:(path,options)=>apiRequest(path,undefined,csrf,options)});
const evalScreen=createEvalScreen({root:$('#evalContent'),request:(path,{data,...options}={})=>apiRequest(path,data,csrf,options)});
const homeScreen=createHomeScreen({root:$('#homeContent'),request:(path,{data,...options}={})=>apiRequest(path,data,csrf,options)});
const scoreWorkspace=createScoreWorkspace({api,stores:()=>stores,isReadOnly:()=>readOnly,onBasisChange:()=>refresh()});
const hasActiveJob = () => ['queued', 'running'].includes(snapshot?.job?.status);
const collectionRangeForm=createCollectionRangeForm({form:$('#collectForm'),month:$('#month'),stores:()=>stores});
let authAction = '', authenticationRequired = false, authUIVersion = 0;
const accessExchange = createAccessLinkExchange({request: (path, data) => apiRequest(path, data, '', {timeoutMs:15000})});
function clearSessionUI() {
  authUIVersion++;
  refreshVersion++; clearTimeout(refreshTimer); snapshot = null; csrf = ''; stores = []; readOnly = true; scoreSelectionVersion++;
  plScreen.resetSession(); evalScreen.resetSession(); homeScreen.resetSession(); scoreWorkspace.cancel(); resetReportingSession();
  for (const id of ['accounts','latestResults','reports','trendContent','reportDetail','job']) { $('#' + id).replaceChildren(); $('#' + id).setAttribute('aria-busy','false'); }
  for (const id of ['connectionStore','trendStore']) $('#' + id).replaceChildren();
  $('#historyStore').replaceChildren(Object.assign(document.createElement('option'),{value:'',textContent:'전체 매장'}));
  $('#collectStore').replaceChildren(Object.assign(document.createElement('option'),{value:'all',textContent:'전 매장 · 연결 계정 모두'}));
  $('#shareUrl').value = ''; $('#connectForm').elements.token.value = '';
  $('#serverEnvironment').textContent = '로그인 필요'; $('#logoutButton').hidden = true;
  $('#accountSettingsLink').hidden = true; $('#managementTools').hidden = true; $('#sharePanel').hidden = true;
  for (const id of ['connectedCount','overviewConnections','lastCollected']) $('#' + id).textContent = '로그인 필요';
  $('#refreshButton').disabled = false; $('#refreshButton').hidden=true; $('#refreshButton').setAttribute('aria-busy','false');
  authenticationRequired = true; syncView(); lockControls();
}
function showAuthRecovery(error, {retryLink = false, focus = false} = {}) {
  const recovery = authRecovery(error, {retryLink});
  authAction = recovery.action;
  $('#authRecoveryTitle').textContent = recovery.title; $('#authRecoveryDetail').textContent = recovery.detail;
  $('#authRecovery').hidden = false; $('#authLinkForm').hidden = !['link','retry-link'].includes(authAction);
  $('#authRetry').hidden = !['retry','retry-link'].includes(authAction); $('#authRetry').textContent = retryLink ? '로그인 다시 시도' : '연결 다시 시도';
  $('#authHome').hidden = authAction !== 'home' || !snapshot;
  if (focus) $('#authRecoveryTitle').focus();
}
onSessionFailure(error => { if(error.code!=='csrf_invalid')clearSessionUI(); showAuthRecovery(error); });

function updateRoute() {
  const platform = $('#platform').value;
  if (lastPlatform !== platform) $('#connectForm').elements.version.value = platform === 'instagram' ? 'v26.0' : 'v1.0';
  lastPlatform = platform;
  for (const option of $('#route').options) option.disabled = (option.value === 'threads') !== (platform === 'threads');
  if (platform === 'threads') $('#route').value = 'threads';
  else if ($('#route').value === 'threads') $('#route').value = 'unified';
  const requiresId = ['unified', 'facebook'].includes($('#route').value);
  $('#userIdLabel').hidden = !requiresId;
  $('#userIdLabel input').required = requiresId;
  const store = $('#connectionStore').value;
  $('#userIdLabel input').value = requiresId ? stores.find(s => s.id === store)?.instagramId ?? '' : '';
  $('#platform').querySelector('option[value="threads"]').disabled = store === 'yummy';
  if (store === 'yummy' && platform === 'threads') { $('#platform').value = 'instagram'; updateRoute(); }
}
function writeUrl(values, replace = false) {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries(values)) { if (value) url.searchParams.set(key, value); else url.searchParams.delete(key); }
  if (url.href !== location.href) history[replace ? 'replaceState' : 'pushState'](null, '', url);
}
function syncView() {
  const requested = new URL(location.href).searchParams.get('view');
  const view = readOnly&&requested==='accounts'?'dashboard':['home','eval','dashboard', 'pl', 'history', 'accounts', 'trends', 'report'].includes(requested)?requested:'home';
  for (const panel of document.querySelectorAll('[data-view]')) { panel.hidden = authenticationRequired || panel.dataset.view !== view; panel.inert = authenticationRequired; }
  for (const link of document.querySelectorAll('[data-view-link]')) {
    if (link.dataset.viewLink === (view === 'report' ? 'history' : view)) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  }
  if (activeView !== view) { if(activeView==='dashboard')scoreWorkspace.cancel();if(activeView==='home')homeScreen.deactivate();if(activeView==='eval')evalScreen.deactivate();activeView = view; window.scrollTo({ top: 0, behavior: 'instant' }); }
  const title=({home:'본부 현황',eval:'종합평가',dashboard:'마케팅',pl:'손익',history:'지난 보고서',accounts:'계정 설정',trends:'연간 추이',report:'상세 보고서'})[view];
  document.title = `${title} | 매장 업무`;
  document.body.classList.toggle('pl-view-active',view==='pl');
  document.querySelector('.page-heading h1').textContent=title;
  if(view==='home'&&snapshot&&!accessPending){void homeScreen.activate({role:readOnly?'viewer':'admin'});homeScreen.syncURL();}
  if(view==='pl'&&snapshot&&!accessPending){void plScreen.activate({role:readOnly?'viewer':'admin'});plScreen.syncURL();}
  if(view==='eval'&&snapshot&&!accessPending){void evalScreen.activate({role:readOnly?'viewer':'admin'});evalScreen.syncURL();}
  if(view==='dashboard')syncMarketingSelection();
}
function syncMarketingSelection(){
  if(activeView!=='dashboard')return;
  const id=new URL(location.href).searchParams.get('marketingStore'),note=$('#marketingSelectionNote');note.hidden=true;note.textContent='';if(!id)return;
  if($('#latestResults').dataset.scoreMonth!==$('#month').value)return;
  const cards=[...document.querySelectorAll('#latestResults .score-card')];
  const card=cards.find(card=>card.dataset.scoreStore===id)||cards.find(card=>card.dataset.scoreStore===marketingStoreAliases[id]);
  if(!card){note.textContent=`${evaluationStoreNames[id]||'선택한 매장'}의 이 달 마케팅 수집 자료가 없습니다. 종합평가의 마케팅 점수는 노션 입력값입니다.`;note.hidden=false;return;}
  const detail=card.querySelector('.score-detail');if(detail)detail.open=true;card.scrollIntoView({block:'start',behavior:'instant'});
}
function syncFilters() {
  const params = new URL(location.href).searchParams;
  $('#recordState').value = params.get('recordState') === 'trash' ? 'trash' : 'active';
  for (const id of ['historyStore', 'historyPlatform', 'historyMonth']) {
    const value = params.get(id) || '';
    if ($('#' + id).tagName === 'SELECT') $('#' + id).value = [...$('#' + id).options].some(o => o.value === value) ? value : '';
    else $('#' + id).value = validMonth(value) ? value : '';
  }
}
function renderAutomations() {
  $('#automationCount').textContent = `${AUTOMATIONS.length}개`;
  const list = $('#automations'); list.replaceChildren();
  for (const module of AUTOMATIONS) {
    const row = el('article', undefined, 'automation-row');
    const content = el('div'); content.append(el('h3', module.title), el('p', module.description), el('p', module.schedule, 'schedule'));
    const action = el('button', module.action, 'button-quiet'); action.type = 'button';
    action.addEventListener('click', () => { writeUrl({ view: 'dashboard' }); syncView(); const target = document.getElementById(module.target); if (target) { target.closest('details')?.setAttribute('open',''); target.scrollIntoView({ behavior: 'instant', block: 'start' }); document.getElementById(module.focusTarget)?.focus({ preventScroll: true }); } });
    row.append(content, action); list.append(row);
  }
}
function lockControls() {
  const running = hasActiveJob();
  for (const button of document.querySelectorAll('#connectForm button, #collectForm button, .link-button')) button.disabled = !snapshot || readOnly || busy || running;
  $('#collectButton').textContent = running ? (snapshot?.job?.status === 'queued' ? '실행 대기 중…' : '수집 중…') : $('#collectStore').value === 'all' ? '전 매장 수집' : '선택 매장 수집';
  $('#collectButton').setAttribute('aria-busy', String(busy || running));
  for (const control of document.querySelectorAll('#collectForm select, #collectForm input')) control.disabled = !snapshot || readOnly || busy || running;
  collectionRangeForm.sync({disabled:!snapshot||busy||running,readOnly});
}
function table(headers, className = '') {
  const node = el('table', undefined, `data-table ${className}`); const head = el('thead'), row = el('tr');
  for (const [label, numeric] of headers) { const th = el('th', label, numeric ? 'num' : ''); th.scope = 'col'; row.append(th); }
  head.append(row); node.append(head, el('tbody')); return node;
}
function cell(label, content, className = '') {
  const td = el('td', undefined, className); td.append(el('span', label, 'cell-label'));
  td.append(typeof content === 'string' ? el('span', content) : content); return td;
}
function metricCell(label, metric) {
  const content = el('div'); content.append(el('span', metric.total === null ? '미수집' : metric.total.toLocaleString('ko-KR'), 'metric-value'));
  if (metric.missing) content.append(el('span', `${metric.observed}건 확인 / ${metric.missing}건 미수집`, 'metric-missing'));
  return cell(label, content, 'num');
}
function resultStatus(result) {
  if (result.status === 'failed') return el('span', '수집 실패', 'status error');
  if (result.status === 'partial') return el('span', '일부 수집', 'status');
  return el('span', Object.values(result.summary.metrics).some(m => m.missing > 0) ? '일부 지표 미수집' : '수집 완료', 'status success');
}
function resultRow(result, showStore = true) {
  const row = el('tr'); const name = el('div'); name.append(el('span', showStore ? result.storeName : platformName(result.platform), 'store-name'));
  if (showStore) name.append(el('span', platformName(result.platform), 'store-platform'));
  const counts = el('div'); counts.append(el('span', `${result.summary.included}건`, 'metric-value'), el('span', `검토 ${result.summary.pending}건`, 'metric-missing'));
  row.append(cell('매장 / 플랫폼', name, 'store-cell'), cell('인정 건수', counts, 'num'));
  for (const [key, label] of [['views', '조회'], ['saved', '저장'], ['shares', '공유']]) row.append(metricCell(label, result.summary.metrics[key]));
  row.append(cell('상태', resultStatus(result))); return row;
}
const resultHeaders = [['매장 / 플랫폼'], ['인정', true], ['조회', true], ['저장', true], ['공유', true], ['상태']];
function renderLatest() {
  if (!snapshot) return;
  const selectionVersion=++scoreSelectionVersion;
  const period = $('#month').value; $('#latestPeriod').textContent = `${period.split('-')[0]}년 ${Number(period.split('-')[1])}월 게시물 기준`;
  const target=$('#latestResults');
  if(!validMonth(period)){scoreWorkspace.cancel();target.replaceChildren(el('p','보고 싶은 월을 선택해 주세요.','empty'));return;}
  const reports=regularReports(snapshot.reports),last=[...reports].filter(r=>r.month===period).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
  $('#ownerUpdated').textContent=last?`${dateLabel(last.createdAt)} 업데이트`:'';
  void scoreWorkspace.render(snapshot,period,target).then(()=>{if(selectionVersion!==scoreSelectionVersion)return;target.dataset.scoreMonth=period;syncMarketingSelection();}).catch(()=>{if(selectionVersion===scoreSelectionVersion)target.replaceChildren(el('p','점수를 불러오지 못했습니다. 새로고침해 주세요.','empty'));});
}
function renderReports() {
  if (!snapshot) return;
  const target = $('#reports'); const openIds = new Set([...target.querySelectorAll('details[open]')].map(d => d.dataset.report)); target.replaceChildren(); target.setAttribute('aria-busy', 'false');
  const storeId = $('#historyStore').value, platform = $('#historyPlatform').value, month = $('#historyMonth').value;
  const storeName = stores.find(s => s.id === storeId)?.name;
  let count = 0;
  const source = $('#recordState').value === 'trash' ? snapshot.trash || [] : snapshot.reports;
  const search = $('#recordSearch').value.trim().toLowerCase();
  for (const report of source) {
    if (search && ![report.id, ...report.results.map(r => r.storeName)].join(' ').toLowerCase().includes(search)) continue;
    if (month && report.month !== month) continue;
    const results = report.results.filter(r => (!storeName || r.storeName === storeName) && (!platform || r.platform === platform));
    if (!results.length) continue; count++;
    const row = el('details', undefined, 'report'); row.dataset.report = report.id; row.open = openIds.has(report.id);
    const summary = el('summary'); const main = el('span', undefined, 'report-main');
    main.append(el('span', collectionReportLabel(report), 'report-title'), el('span', [...new Set(results.map(r => r.storeName))].join(', ')), el('span', dateLabel(report.createdAt), 'report-time'));
    summary.append(main); const body = el('div', undefined, 'report-body'); const grid = table(resultHeaders);
    for (const result of results) grid.querySelector('tbody').append(resultRow(result)); body.append(grid);
    const links = reportActions(report);
    body.append(links); row.append(summary, body); target.append(row);
  }
  $('#reportCount').textContent = `${count}개 실행 기록`;
  if (!count) target.append(el('p', source.length ? '선택한 조건의 기록이 없습니다. 필터를 바꾸거나 초기화해 주세요.' : $('#recordState').value === 'trash' ? '휴지통이 비어 있습니다.' : '아직 API로 수집한 기록이 없습니다. 계정을 연결한 뒤 첫 수집을 실행해 주세요.', 'empty'));
}
function renderAccounts() {
  const target = $('#accounts'); const opened = new Set([...target.querySelectorAll('details[open]')].map(d => d.dataset.connection)); target.replaceChildren(); target.setAttribute('aria-busy', 'false');
  const grid = table([['매장'], ['Instagram'], ['Threads']], 'account-table');
  for (const store of stores) {
    const row = el('tr'); const name = el('div', undefined, 'account-name'); name.append(el('span', store.name, 'store-name'), el('span', `@${store.username}`, 'store-platform')); row.append(cell('매장', name, 'store-cell'));
    for (const platform of ['instagram', 'threads']) {
      if (platform === 'threads' && !store.threads) { row.append(cell('Threads', '계정 없음', 'account-cell')); continue; }
      const connected = snapshot.connections.find(c => c.store === store.id && c.platform === platform);
      const content = el('div');
      if (connected) {
        const details = el('details'); details.dataset.connection = `${store.id}:${platform}`; details.open = opened.has(details.dataset.connection); details.append(el('summary', '계정 확인됨'));
        details.append(el('span', `마지막 연결 확인 ${dateLabel(connected.verifiedAt)}`, 'small'));
        const button = el('button', `${platform} 연결 정보 삭제`, 'link-button'); button.type = 'button';
        button.addEventListener('click', async () => {
          if (busy || hasActiveJob()) return;
          if (!confirm(`${store.name} ${platformName(platform)}의 이 컴퓨터 연결 정보를 삭제할까요? 다시 사용하려면 토큰으로 연결해야 합니다. Meta 측 권한은 유지됩니다.`)) return;
          busy = true; lockControls();
          try { const result = await api('/api/disconnect', { store: store.id, platform }); message(result.message); } catch (error) { message(error.message, true); }
          finally { busy = false; await refresh(); }
        }); if (!isCloud) details.append(button); content.append(details);
      } else {
        const button = el('button', '연결하기', 'button-quiet'); button.type = 'button';
        button.addEventListener('click', () => { $('#connectionStore').value = store.id; $('#platform').value = platform; updateRoute(); $('#connectPanel').open = true; $('#connectPanel').scrollIntoView({ behavior: 'instant', block: 'start' }); $('#connectForm').elements.token.focus({ preventScroll: true }); }); content.append(button);
      }
      row.append(cell(platformName(platform), content, 'account-cell'));
    }
    grid.querySelector('tbody').append(row);
  }
  target.append(grid);
}
async function refresh() {
  if(accessPending)return;
  const requestVersion = ++refreshVersion;
  clearTimeout(refreshTimer); $('#refreshButton').disabled = true; $('#refreshButton').setAttribute('aria-busy', 'true');
  try {
    const status = await api('/api/status'); if (requestVersion !== refreshVersion) return;
    if(snapshot&&snapshot.role!==status.role){plScreen.resetSession();evalScreen.resetSession();homeScreen.resetSession();}
    csrf = status.csrf; stores = status.stores; snapshot = status; readOnly = status.role === 'viewer';
    authenticationRequired = false; $('#authRecovery').hidden = true; $('#refreshButton').hidden=false; $('#logoutButton').hidden = !isCloud;
    $('#serverEnvironment').textContent = `${status.serverLabel || '이 컴퓨터에서 실행 중'}${readOnly ? ' · 조회 전용' : ''}`;
    document.querySelector('.view-nav [data-view-link="accounts"]').hidden = true;
    $('#accountSettingsLink').hidden = readOnly; $('#managementTools').hidden = readOnly;
    $('#serverEnvironment').textContent = readOnly ? '실적 보고서' : '관리자';
    $('#collectForm').hidden = readOnly; $('#recordState').closest('label').hidden = readOnly;
    $('#sharePanel').hidden = readOnly || !status.accessMode;
    if (readOnly) $('#recordState').value = 'active';
    $('#connectPanel').hidden = isCloud;
    $('#cloudConnectionNote').hidden = !isCloud;
    if (isCloud && status.workerOnline === false) message('Mac mini가 연결되지 않았습니다. 저장된 결과는 조회할 수 있으며 수집 요청은 연결 후 처리됩니다.');
    if (isCloud && status.workerSyncError) message(status.workerSyncError, true);
    syncView();
    if (!$('#connectionStore').options.length) {
      for (const selector of ['#connectionStore', '#collectStore', '#historyStore']) for (const store of status.stores) { const option = el('option', store.name); option.value = store.id; $(selector).append(option); }
      const params=new URL(location.href).searchParams,month=params.get('month'); $('#month').value = validMonth(month) && (month <= status.previousMonth||params.has('marketingStore')) ? month : status.previousMonth; $('#month').max = status.previousMonth;
      syncFilters(); updateRoute();
    }
    const expected = stores.reduce((sum, store) => sum + (store.threads ? 2 : 1), 0);
    $('#connectedCount').textContent = `${status.connections.length} / ${expected}개 계정 연결`; $('#overviewConnections').textContent = `${status.connections.length} / ${expected}`;
    $('#lastCollected').textContent = status.reports.length ? dateLabel(status.reports[0].createdAt) : '아직 기록 없음';
    if (readOnly) $('#recordState').value = 'active';
    renderAccounts(); renderLatest(); renderReports(); updateReporting(status);
    const job = $('#job'); job.replaceChildren();
    if (status.job) {
      const work = status.job;
      const labels = { queued: 'Mac mini 실행 대기', running: '수집 중…', done: '결과 저장 완료', partial: '결과 저장 완료 · 확인 필요', failed: '수집 실패', cancelled: '대기 요청 취소됨' };
      const period=work.range?`${work.range.start}~${work.range.end} · ${work.month} 점수 보충`:work.month;
      job.append(el('p', `${period} ${work.store} · ${work.completed ?? 0} / ${work.total ?? 0}개 계정 확인 · ${labels[work.status] || work.status}${work.error ? ` (${work.error})` : ''}`, 'job'));
      if (work.status === 'running') {
        const progress = el('progress'); progress.max = work.total || 1; progress.value = work.completed || 0; progress.setAttribute('aria-label', '계정 수집 진행률'); job.append(progress);
        if (work.current) job.append(el('p', `${stores.find(s => s.id === work.current.store)?.name || work.current.store} / ${platformName(work.current.platform)} 수집 중`, 'small'));
      }
      if (work.accounts?.length || work.skipped?.length) {
        const list = el('ul', undefined, 'job-accounts');
        for (const account of work.accounts || []) list.append(el('li', `${account.storeName} / ${platformName(account.platform)} · ${{ collected: '수집 완료', partial: '일부 수집 · 확인 필요', failed: '수집 실패' }[account.status]}`));
        for (const account of work.skipped || []) list.append(el('li', `${account.storeName} / ${platformName(account.platform)} · 미연결로 건너뜀`));
        const details = el('details', undefined, 'compact-details'); details.open = ['partial', 'failed'].includes(work.status); details.append(el('summary', '매장별 결과'), list); job.append(details);
      }
      if (work.status === 'queued' && isCloud) {
        const cancel = el('button', '대기 요청 취소', 'button-quiet'); cancel.type = 'button';
        cancel.addEventListener('click', async () => { try { await api('/api/job/cancel', { id: work.id }); await refresh(); } catch (error) { message(error.message, true); } });
        if (!readOnly) job.append(cancel);
      }
      if (work.reportId) {
        const link = el('a', '이번 수집 보고서 보기', 'text-link'); link.href = `?view=report&report=${work.reportId}`; job.append(link);
      }
    }
    lockControls(); if (['queued', 'running'].includes(status.job?.status)) refreshTimer = setTimeout(refresh, 3000);
  } catch (error) {
    if (requestVersion !== refreshVersion) return;
    if(error.status===401)clearSessionUI();
    showAuthRecovery(error); message('');
    for (const id of ['accounts', 'latestResults', 'reports', 'trendContent', 'reportDetail']) { $('#' + id).setAttribute('aria-busy', 'false'); if (!snapshot) $('#' + id).replaceChildren(el('p', '데이터를 불러오지 못했습니다. 새로고침으로 다시 시도해 주세요.', 'empty')); }
    if (!snapshot) for (const id of ['connectedCount', 'overviewConnections', 'lastCollected']) $('#' + id).textContent = '확인 불가';
    lockControls();
  } finally { if (requestVersion === refreshVersion) { $('#refreshButton').disabled = false; $('#refreshButton').setAttribute('aria-busy', 'false'); } }
}
$('#connectForm').addEventListener('submit', async event => {
  event.preventDefault(); if (busy || hasActiveJob()) return;
  const form = event.currentTarget, data = Object.fromEntries(new FormData(form)); busy = true; lockControls();
  try { message('선택한 계정과 일치하는지 확인 중입니다…'); const result = await api('/api/connect', data); form.elements.token.value = ''; message(result.message); }
  catch (error) { message(error.message, true); }
  finally { busy = false; await refresh(); }
});
$('#collectForm').addEventListener('submit', async event => {
  event.preventDefault(); if (readOnly || busy || hasActiveJob()) return;
  let data;try{data=collectionRangeForm.getRequest();}catch{return;}
  busy = true; lockControls(); clearTimeout(refreshTimer);
  try { const result = await api('/api/collect', data); message(result.message); }
  catch (error) { message(error.message, true); }
  finally { busy = false; await refresh(); }
});
$('#platform').addEventListener('change', updateRoute); $('#route').addEventListener('change', updateRoute); $('#connectionStore').addEventListener('change', updateRoute);
$('#refreshButton').addEventListener('click', async () => { if (authenticationRequired) { $('#authRecoveryTitle').focus(); return; } message(''); if(activeView==='pl'&&snapshot)await plScreen.refresh();else if(activeView==='eval'&&snapshot)await evalScreen.refresh();else if(activeView==='home'&&snapshot)await homeScreen.refresh();else await refresh(); });
$('#collectStore').addEventListener('change', lockControls);
$('#month').addEventListener('change', () => { writeUrl({ month: $('#month').value }); renderLatest(); });
for (const id of ['historyStore', 'historyPlatform', 'historyMonth']) $('#' + id).addEventListener('change', () => { writeUrl({ [id]: $('#' + id).value }); renderReports(); });
$('#historyFilters').addEventListener('submit', event => event.preventDefault());
$('#clearFilters').addEventListener('click', () => { $('#recordSearch').value = ''; writeUrl({ historyStore: '', historyPlatform: '', historyMonth: '' }); syncFilters(); renderReports(); });
$('#recordSearch').addEventListener('input', renderReports);
$('#recordState').addEventListener('change', () => { writeUrl({ recordState: $('#recordState').value }); renderReports(); });
document.addEventListener('click', event => {
  const link=event.target.closest('[data-view-link]');if(!link||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button!==0)return;
  event.preventDefault();const destination=new URL(link.href,location.href),values={view:link.dataset.viewLink};
  if(['home','eval','pl','dashboard'].includes(values.view)){
    const month=destination.searchParams.get('month');if(validMonth(month))values.month=month;
  }
  if(values.view==='dashboard'){
    const selected=destination.searchParams.get('marketingStore');if(selected&&Object.hasOwn(marketingStoreAliases,selected))values.marketingStore=selected;
    const month=destination.searchParams.get('month');if(validMonth(month))values.month=month;
  }
  Object.assign(values,values.view==='eval'?evaluationRouteParams(destination.searchParams):{evalStore:'',evalIssue:'',evalFrom:''});
  writeUrl(values);
  if(values.view==='dashboard'&&snapshot){const month=new URL(location.href).searchParams.get('month');if(validMonth(month))$('#month').value=month;renderLatest();}
  syncView();syncReporting();
});
window.addEventListener('popstate', () => { syncView(); syncFilters(); const month = new URL(location.href).searchParams.get('month'); if (snapshot) $('#month').value = validMonth(month) && (month <= snapshot.previousMonth || new URL(location.href).searchParams.has('marketingStore')) ? month : snapshot.previousMonth; renderLatest(); renderReports(); syncReporting(); });
initReporting({ api, writeUrl, syncView, message, refresh, isReadOnly: () => readOnly, isBusy: () => readOnly || busy || hasActiveJob(), setBusy: value => { busy = value; lockControls(); } });
for (const id of ['showShare', 'rotateShare']) $('#' + id).addEventListener('click', async () => {
  if (readOnly || busy || hasActiveJob()) return;
  if (id === 'rotateShare' && !confirm('기존 조회 링크와 조회 세션을 해제하고 새 링크를 발급할까요?')) return;
  const sessionVersion = authUIVersion;
  busy = true; lockControls();
  try { const result = await api(id === 'rotateShare' ? '/api/share/rotate' : '/api/share', id === 'rotateShare' ? {} : undefined); if(sessionVersion!==authUIVersion||!snapshot||readOnly)return; $('#shareUrl').value = result.viewer; message(id === 'rotateShare' ? '조회 링크를 새로 발급했습니다. 기존 링크는 해제됐습니다.' : '조회용 링크를 확인했습니다.'); }
  catch (error) { message(error.message, true); } finally { busy = false; lockControls(); }
});
renderAutomations(); syncView();
let accessLinkVersion = 0;
function setAuthBusy(value) {
  $('#authRecovery').setAttribute('aria-busy',String(value));
  for (const control of document.querySelectorAll('#authRecovery button, #authRecovery input')) control.disabled=value;
}
async function exchangeAccessLink(key, retry = false) {
  const version = ++accessLinkVersion;
  clearSessionUI(); accessPending = true; setAuthBusy(true);
  $('#authRecovery').hidden=false; $('#authRecoveryTitle').textContent='접속을 확인하고 있습니다'; $('#authRecoveryDetail').textContent='잠시만 기다려 주세요.';
  try {
    const result = await (retry ? accessExchange.retry() : accessExchange.start(key));
    if (version !== accessLinkVersion || result.state === 'stale') return false;
    if (result.state === 'success') { csrf=result.session.csrf || ''; readOnly=result.session.role==='viewer'; message(result.session.persisted===false?'이 브라우저는 로그인 정보 저장이 차단되어 있습니다. 이 탭에서는 이용할 수 있지만 다시 열 때 접속 링크가 필요합니다.':''); return true; }
    showAuthRecovery(result.error || {code:'auth_required'}, {retryLink:result.retry,focus:true});
    return false;
  } finally { if (version === accessLinkVersion) { accessPending=false; setAuthBusy(false); } }
}
async function consumeAccessLink() {
  const accessKey = new URLSearchParams(location.hash.slice(1)).get('access');
  if (!accessKey) return null;
  history.replaceState(null, '', location.pathname + location.search);
  return exchangeAccessLink(accessKey);
}
$('#authRetry').addEventListener('click', async () => {
  if (accessPending) return;
  if (authAction === 'retry-link') { if (await exchangeAccessLink('', true)) await refresh(); }
  else await refresh();
});
$('#authHome').addEventListener('click', () => { $('#authRecovery').hidden=true; writeUrl({view:'home'}); syncView(); });
$('#authLinkForm').addEventListener('submit', async event => {
  event.preventDefault(); if (accessPending) return;
  const key=accessKeyFromLink($('#authLink').value); $('#authLink').value='';
  if (!key) { $('#authRecoveryDetail').textContent='접속 링크 전체를 붙여넣어 주세요. 주소 뒤의 접속 정보가 포함되어 있어야 합니다.'; $('#authLink').focus(); return; }
  if (await exchangeAccessLink(key)) await refresh();
});
window.addEventListener('storage', event => {
  if (!isCloud || event.key!==sessionStorageKey && event.key!==null) return;
  accessExchange.cancel(); accessLinkVersion++; accessPending=false; setAuthBusy(false); clearSessionUI();
  if (event.newValue) void refresh();
  else { showAuthRecovery({code:'auth_required'}); $('#authRecoveryTitle').textContent='다른 탭에서 로그아웃했습니다'; }
});
$('#logoutButton').addEventListener('click', async () => {
  if (!isCloud || !snapshot || accessPending) return;
  accessPending=true; $('#logoutButton').disabled=true; accessExchange.cancel(); const version=++accessLinkVersion;
  try { await apiRequest('/api/logout',{},csrf,{timeoutMs:15000}); if(version!==accessLinkVersion)return; clearSessionUI(); showAuthRecovery({code:'auth_required'},{focus:true}); $('#authRecoveryTitle').textContent='로그아웃했습니다'; }
  catch (error) { if(version===accessLinkVersion)showAuthRecovery(error,{focus:true}); }
  finally { if(version===accessLinkVersion)accessPending=false; $('#logoutButton').disabled=false; }
});
function recheckCloudSession() { if(isCloud&&snapshot&&!accessPending&&!busy&&document.visibilityState!=='hidden')void refresh(); }
window.addEventListener('focus',recheckCloudSession);
document.addEventListener('visibilitychange',recheckCloudSession);
window.addEventListener('hashchange', async () => { if (await consumeAccessLink()) await refresh(); });
if (await consumeAccessLink() !== false) await refresh();
