// Cubis Shop desktop authentication and user administration API.
// The master API key and MySQL credentials are intentionally never present in the client.
(function() {
  const API_URL = 'https://cubisshop.ro/shop-api/crm/api.php';

  async function request(action, { method = 'GET', body, params } = {}) {
    const url = new URL(API_URL);
    url.searchParams.set('action', action);
    Object.entries(params || {}).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), method === 'GET' ? 12000 : 30000);
    let response;
    try {
      response = await fetch(url.toString(), {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      throw new Error(error?.name === 'AbortError'
        ? 'API-ul Cubis Shop nu a răspuns la timp.'
        : 'API-ul Cubis Shop nu poate fi contactat.');
    } finally {
      clearTimeout(timeout);
    }
    const raw = await response.text();
    let payload = {};
    try { payload = raw ? JSON.parse(raw) : {}; }
    catch { throw new Error(`API-ul Cubis Shop nu a returnat JSON valid (HTTP ${response.status}).`); }
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    return payload;
  }

  const authParams = authToken => ({ authToken });
  const authBody = (authToken, payload = {}) => ({ ...payload, auth_token: authToken });

  window.API_URL = API_URL;
  window.API = {
    login: (username, password, platform = 'desktop', remember = false) => request('login', {
      method: 'POST', body: { username, password, platform, remember_me: remember ? 1 : 0 },
    }),
    logout: authToken => request('logout', { method: 'POST', body: authBody(authToken) }),
    getCurrentUser: authToken => request('getCurrentUser', { params: authParams(authToken) }),
    updateOwnProfile: (authToken, payload) => request('updateOwnProfile', { method: 'PUT', body: authBody(authToken, payload) }),
    getUsers: authToken => request('getUsers', { params: { ...authParams(authToken), cacheBust: Date.now() } }),
    createUser: (authToken, payload) => request('createUser', { method: 'POST', body: authBody(authToken, payload) }),
    updateUser: (authToken, id, payload) => request('updateUser', { method: 'PUT', params: { id }, body: authBody(authToken, payload) }),
    deleteUser: (authToken, id) => request('deleteUser', { method: 'DELETE', params: { id }, body: authBody(authToken, { id }) }),
  };
})();
