import { RUNTIME } from './runtime-config.js?v=bca88bf62fdf';
export function createTransport(config, { fetcher = fetch, storage = null } = {}) {
  const cloud = config.mode === 'cloud';
  let memorySession = null, sessionVersion = 0;
  const readSession = () => { if (memorySession !== null) return memorySession; try { return storage?.getItem('automation-session') || ''; } catch { return ''; } };
  const writeSession = value => { memorySession = value; try { if (value) storage?.setItem('automation-session', value); else storage?.removeItem('automation-session'); } catch { /* Keep this tab usable without persistent browser storage. */ } };
  const endpoint = path => {
    if (!cloud) return path;
    if (!config.apiBase) throw new Error('공유 서버 연결을 준비 중입니다. 기존 Mac 화면에서 계속 사용할 수 있습니다.');
    const base = new URL(config.apiBase);
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('공유 서버 주소를 확인해 주세요.');
    return base.href.replace(/\/$/, '') + path.replace(/^\/api/, '');
  };
  async function request(path, data, { csrf = '', text = false } = {}) {
    const loginVersion = path === '/api/session' ? ++sessionVersion : null;
    const requestSessionVersion = sessionVersion, requestToken = cloud ? readSession() : '';
    const headers = {};
    if (cloud) {
      if (requestToken) headers.Authorization = `Bearer ${requestToken}`;
    } else if (data !== undefined) headers['X-CSRF-Token'] = csrf;
    if (data !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetcher(endpoint(path), { method: data === undefined ? 'GET' : 'POST', headers, ...(cloud ? { credentials: 'omit' } : {}), ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
    if (!response.ok) {
      let error; try { error = (await response.json()).error; } catch { /* Non-JSON upstream failures use a visible, non-sensitive message. */ }
      if (cloud && response.status === 401 && requestSessionVersion === sessionVersion && readSession() === requestToken) writeSession('');
      throw new Error(error || `요청에 실패했습니다. (${response.status})`);
    }
    if (text) return response.text();
    const result = await response.json();
    if (cloud && path === '/api/session' && result.sessionToken && loginVersion === sessionVersion) writeSession(result.sessionToken);
    return result;
  }
  return { request, cloud };
}
let sessionStore;
try { sessionStore = globalThis.sessionStorage; } catch { /* The server remains authoritative if browser storage is unavailable. */ }
const transport = createTransport(RUNTIME, { storage: sessionStore });
export const isCloud = transport.cloud;
export const apiRequest = (path, data, csrf) => transport.request(path, data, { csrf });
export const apiText = path => transport.request(path, undefined, { text: true });
export function exportLink(label, path, filename) {
  const link = document.createElement('a'); link.className = 'text-link'; link.textContent = label;
  link.href = isCloud ? '#' : path;
  if (!isCloud) { link.target = '_blank'; link.rel = 'noreferrer'; return link; }
  link.addEventListener('click', async event => {
    event.preventDefault(); if (link.getAttribute('aria-busy') === 'true') return;
    link.setAttribute('aria-busy', 'true');
    try {
      const content = path.endsWith('/markdown') ? await apiText(path) : JSON.stringify(await apiRequest(path), null, 2);
      const url = URL.createObjectURL(new Blob([content], { type: path.endsWith('/markdown') ? 'text/plain;charset=utf-8' : 'application/json' }));
      const download = document.createElement('a'); download.href = url; download.download = filename; document.body.append(download); download.click(); download.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { const notice = document.getElementById('notice'); notice.className = 'notice error'; notice.textContent = error.message; }
    finally { link.removeAttribute('aria-busy'); }
  }); return link;
}
