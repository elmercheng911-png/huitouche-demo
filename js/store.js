/* 資料層：目前用 localStorage。介面刻意保持單純，之後可換成 Firebase / Supabase。 */
(function (global) {
  const KEY = 'huitouche.demo.v2';
  const SESSION_KEY = 'huitouche.demo.session';

  class LocalAdapter {
    constructor(key) { this.key = key; }
    async load() {
      try {
        const raw = localStorage.getItem(this.key);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch (err) {
        console.warn('localStorage 讀取失敗', err);
        return null;
      }
    }
    async save(state) {
      localStorage.setItem(this.key, JSON.stringify(state));
    }
    async clear() {
      localStorage.removeItem(this.key);
    }
  }

  /* 之後可實作：
   * class FirebaseAdapter { async load(){} async save(){} }
   * class SupabaseAdapter { async load(){} async save(){} }
   * 在 createStore({ driver: 'firebase', ... }) 切換即可。
   */
  function createStore(options = {}) {
    const adapter = options.adapter || new LocalAdapter(options.key || KEY);
    return {
      driver: options.driver || 'localStorage',
      adapter,
      async load() { return adapter.load(); },
      async save(state) { return adapter.save(state); },
      async clear() { return adapter.clear(); }
    };
  }

  function loadSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveSession(session, remember) {
    const raw = JSON.stringify(session);
    sessionStorage.setItem(SESSION_KEY, raw);
    if (remember) localStorage.setItem(SESSION_KEY, raw);
    else localStorage.removeItem(SESSION_KEY);
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
  }

  global.HTStore = { KEY, LocalAdapter, createStore, loadSession, saveSession, clearSession };
})(window);
