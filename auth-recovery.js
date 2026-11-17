const retryable = error => !error?.status || error.status === 408 || error.status === 429 || error.status >= 500;

export function authRecovery(error = {}, { retryLink = false } = {}) {
  if (error.code === 'csrf_invalid') return { title: '로그인 상태가 바뀌었습니다', detail: '다른 탭에서 로그인했을 수 있습니다. 로그인 상태를 다시 확인한 뒤 작업을 다시 시도해 주세요.', action: 'retry' };
  if (error.code === 'session_changed') return { title: '이 접속 요청이 취소되었습니다', detail: '로그아웃 또는 다른 로그인 요청으로 이전 요청이 취소되었습니다. 접속 링크로 다시 로그인해 주세요.', action: 'link' };
  if (error.code === 'session_expired') return { title: '로그인 유지 기간이 끝났습니다', detail: '접속 링크로 다시 로그인해 주세요. 조회하던 화면과 기간은 그대로 유지됩니다.', action: 'link' };
  if (error.code === 'session_revoked') return { title: '이 접속 권한이 해제되었습니다', detail: '관리자에게 새 접속 링크를 받아 로그인해 주세요. 기존 링크로는 다시 접속할 수 없습니다.', action: 'link' };
  if (error.code === 'session_invalid') return { title: '로그인 정보를 확인할 수 없습니다', detail: '전달받은 접속 링크로 다시 로그인해 주세요.', action: 'link' };
  if (error.status === 401 || error.code === 'auth_required') return { title: '로그인이 필요합니다', detail: '전달받은 접속 링크를 열거나 아래에 붙여넣어 주세요. 링크가 없으면 관리자에게 요청해 주세요.', action: 'link' };
  if (error.status === 403) return { title: '이 작업을 할 권한이 없습니다', detail: '조회 권한으로 이용할 수 있는 홈으로 돌아가거나 관리자에게 필요한 권한을 요청해 주세요.', action: 'home' };
  if (error.status === 429) return { title: '요청이 잠시 많아졌습니다', detail: '잠시 기다린 뒤 다시 시도해 주세요.', action: retryLink ? 'retry-link' : 'retry' };
  if (error.status >= 500) return { title: '서버에 연결하지 못했습니다', detail: '잠시 뒤 다시 시도해 주세요. 이 오류만으로 로그인 정보가 삭제되지는 않습니다.', action: retryLink ? 'retry-link' : 'retry' };
  return { title: '연결을 확인해 주세요', detail: retryLink ? '인터넷 연결을 확인한 뒤 아래 버튼을 눌러 로그인 요청을 다시 보내세요. 접속 링크는 이 탭에서 잠시만 보관됩니다.' : '인터넷 연결을 확인한 뒤 다시 시도해 주세요. 이 오류만으로 로그인 정보가 삭제되지는 않습니다.', action: retryLink ? 'retry-link' : 'retry' };
}

// The original link exists only in this closure for a bounded retry window.
export function createAccessLinkExchange({ request, now = Date.now, retryWindowMs = 300000 }) {
  let key = '', expiresAt = 0, version = 0, expiryTimer;
  const clear = () => { key = ''; expiresAt = 0; clearTimeout(expiryTimer); };
  const canRetry = () => { if (now() >= expiresAt) clear(); return Boolean(key); };
  async function exchange() {
    if (!canRetry()) return { state: 'missing' };
    const current = ++version;
    try {
      const session = await request('/api/session', { key });
      if (current !== version) return { state: 'stale' };
      clear();
      return { state: 'success', session };
    } catch (error) {
      if (current !== version) return { state: 'stale' };
      if (!retryable(error)) clear();
      return { state: 'failed', error, retry: canRetry() };
    }
  }
  return {
    start(value) { version++; clear(); if (typeof value !== 'string' || !value || value.length > 128) return Promise.resolve({ state: 'missing' }); key = value; expiresAt = now() + retryWindowMs; expiryTimer=setTimeout(clear,retryWindowMs); expiryTimer.unref?.(); return exchange(); },
    retry: exchange,
    canRetry,
    cancel() { version++; clear(); },
  };
}

export function accessKeyFromLink(value) {
  try { const url = new URL(value); if (!['https:', 'http:'].includes(url.protocol)) return ''; const key = new URLSearchParams(url.hash.slice(1)).get('access'); return key && key.length <= 128 ? key : ''; } catch { return ''; }
}
