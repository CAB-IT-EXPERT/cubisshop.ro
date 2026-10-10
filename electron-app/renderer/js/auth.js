// Global desktop authentication
(function() {
  const TOKEN_KEY = 'cubisshop.authToken.v1';
  const USER_KEY = 'cubisshop.authUser.v1';
  const REMEMBER_KEY = 'cubisshop.rememberLogin.v1';
  const REMEMBERED_USERNAME_KEY = 'cubisshop.rememberedUsername.v1';

  const startupStartedAt = Date.now();
  let rememberLogin = localStorage.getItem(REMEMBER_KEY) === '1';
  const initialAuthStorage = rememberLogin ? localStorage : sessionStorage;
  let authToken = initialAuthStorage.getItem(TOKEN_KEY) || '';
  let authUser = null;

  try {
    authUser = JSON.parse(initialAuthStorage.getItem(USER_KEY) || 'null');
  } catch {
    authUser = null;
  }

  const startupLoader = document.getElementById('startup-loader');
  const overlay = document.getElementById('auth-overlay');
  const loginForm = document.getElementById('auth-login-form');
  const usernameInput = document.getElementById('auth-username');
  const passwordInput = document.getElementById('auth-password');
  const passwordToggle = document.getElementById('auth-password-toggle');
  const rememberInput = document.getElementById('auth-remember-me');
  const submitButton = document.getElementById('auth-submit-btn');
  const errorBox = document.getElementById('auth-error');
  const userLabel = document.getElementById('auth-user-label');
  const logoutBtn = document.getElementById('auth-logout-btn');
  let startupComplete = false;
  let resolveAuthReady;
  const authReady = new Promise((resolve) => { resolveAuthReady = resolve; });

  function setError(message) {
    if (!errorBox) return;
    if (!message) {
      errorBox.style.display = 'none';
      errorBox.textContent = '';
      return;
    }
    errorBox.textContent = message;
    errorBox.style.display = 'block';
  }

  function isAdmin() {
    return authUser?.role === 'admin';
  }

  function isLoggedIn() {
    return Boolean(authToken && authUser);
  }

  function updateRememberControl() {
    if (!rememberInput) return;
    rememberInput.checked = rememberLogin;
    rememberInput.closest('.auth-remember')?.classList.toggle('is-active', rememberLogin);
  }

  function saveRememberPreference(enabled, username = '') {
    rememberLogin = Boolean(enabled);
    if (rememberLogin) {
      localStorage.setItem(REMEMBER_KEY, '1');
      const normalizedUsername = String(username || '').trim();
      if (normalizedUsername) localStorage.setItem(REMEMBERED_USERNAME_KEY, normalizedUsername);
    } else {
      localStorage.removeItem(REMEMBER_KEY);
      localStorage.removeItem(REMEMBERED_USERNAME_KEY);
    }
    updateRememberControl();
  }

  function clearStoredAuth() {
    for (const storage of [sessionStorage, localStorage]) {
      storage.removeItem(TOKEN_KEY);
      storage.removeItem(USER_KEY);
    }
  }

  function persist(token, user, remember = rememberLogin, username = '') {
    authToken = token || '';
    authUser = user || null;
    clearStoredAuth();
    if (authToken && authUser) {
      const storage = remember ? localStorage : sessionStorage;
      storage.setItem(TOKEN_KEY, authToken);
      storage.setItem(USER_KEY, JSON.stringify(authUser));
    }
    saveRememberPreference(remember, username || authUser?.username || '');
  }

  function updateAdminVisibility() {
    document.querySelectorAll('[data-admin-only="true"]').forEach((el) => {
      el.style.display = isAdmin() ? '' : 'none';
    });
    const activeAdminTab = document.querySelector('.nav-btn.active[data-admin-only="true"]');
    if (activeAdminTab && !isAdmin() && window.switchTab) {
      window.switchTab('shop-dashboard');
    }
  }

  function renderAuthState(notifyModules = true) {
    if (overlay) {
      if (isLoggedIn()) {
        overlay.classList.remove('auth-entered');
        overlay.style.display = 'none';
      } else {
        overlay.style.display = 'flex';
        overlay.classList.remove('auth-entered');
        if (rememberLogin && usernameInput && !usernameInput.value) {
          usernameInput.value = localStorage.getItem(REMEMBERED_USERNAME_KEY) || '';
        }
        if (startupComplete) {
          requestAnimationFrame(() => {
            overlay.classList.add('auth-entered');
          });
        }
      }
    }
    if (userLabel) {
      userLabel.textContent = isLoggedIn()
        ? `${authUser.display_name || authUser.username} (${authUser.role})`
        : 'Neautentificat';
    }
    if (logoutBtn) logoutBtn.style.display = isLoggedIn() ? 'inline-flex' : 'none';
    updateAdminVisibility();
    if (notifyModules) {
      window.dispatchEvent(new CustomEvent('auth-change', {
        detail: { token: authToken, user: authUser },
      }));
    }
  }

  function hideStartupLoader() {
    const elapsed = Date.now() - startupStartedAt;
    const delay = Math.max(900 - elapsed, 0);
    setTimeout(() => {
      if (startupLoader) {
        startupLoader.classList.add('startup-hidden');
        setTimeout(() => {
          startupLoader.style.display = 'none';
        }, 360);
      }
      startupComplete = true;
      if (!isLoggedIn()) {
        overlay?.classList.add('auth-entered');
        usernameInput?.focus();
      }
    }, delay);
  }

  async function login(username, password, remember = Boolean(rememberInput?.checked)) {
    const result = await window.API.login(username, password, 'desktop', remember);
    persist(result.token, result.user, remember, username);
    renderAuthState();
    return result;
  }

  async function logout() {
    const token = authToken;
    const username = localStorage.getItem(REMEMBERED_USERNAME_KEY) || authUser?.username || '';
    persist('', null, rememberLogin, username);
    renderAuthState();
    if (token) {
      try {
        await window.API.logout(token);
      } catch {}
    }
  }

  async function validateStoredSession() {
    if (!authToken) return;
    try {
      const freshUser = await window.API.getCurrentUser(authToken);
      persist(authToken, freshUser);
    } catch {
      persist('', null);
    }
  }

  async function refreshCurrentUser() {
    if (!authToken) return null;
    const freshUser = await window.API.getCurrentUser(authToken);
    persist(authToken, freshUser);
    // Verificarea periodică a sesiunii actualizează contul și permisiunile în
    // fundal. Nu notificăm modulele, fiindcă acestea ar reconstrui pagina
    // vizibilă, ar reseta controalele și ar produce un flash la fiecare 2 minute.
    renderAuthState(false);
    return freshUser;
  }

  async function updateOwnProfile(profile) {
    if (!authToken) throw new Error('Sesiunea nu este activa.');
    const freshUser = await window.API.updateOwnProfile(authToken, profile);
    persist(authToken, freshUser);
    renderAuthState();
    return freshUser;
  }

  async function initializeAuth() {
    try {
      updateRememberControl();
      if (rememberLogin && usernameInput) {
        usernameInput.value = localStorage.getItem(REMEMBERED_USERNAME_KEY) || authUser?.username || '';
      }
      await validateStoredSession();
      renderAuthState();
      hideStartupLoader();
    } finally {
      resolveAuthReady?.();
      resolveAuthReady = null;
    }
  }

  window.AUTH = {
    getToken: () => authToken,
    getUser: () => authUser,
    whenReady: () => authReady,
    isLoggedIn,
    isAdmin,
    login,
    logout,
    refreshCurrentUser,
    updateOwnProfile,
  };

  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    setError('');
    submitButton?.classList.add('is-loading');
    if (submitButton) submitButton.disabled = true;
    try {
      await login(usernameInput.value.trim(), passwordInput.value.trim(), Boolean(rememberInput?.checked));
      passwordInput.value = '';
    } catch (e) {
      persist('', null);
      renderAuthState();
      setError(e.message || 'Autentificare esuata.');
    } finally {
      submitButton?.classList.remove('is-loading');
      if (submitButton) submitButton.disabled = false;
    }
  });

  passwordToggle?.addEventListener('click', () => {
    if (!passwordInput) return;
    const reveal = passwordInput.type === 'password';
    passwordInput.type = reveal ? 'text' : 'password';
    passwordToggle.classList.toggle('is-revealed', reveal);
    passwordToggle.setAttribute('aria-pressed', String(reveal));
    passwordToggle.setAttribute('aria-label', reveal ? 'Ascunde parola' : 'Afișează parola');
    passwordInput.focus();
  });

  rememberInput?.addEventListener('change', () => {
    saveRememberPreference(Boolean(rememberInput.checked), usernameInput?.value || '');
  });

  logoutBtn?.addEventListener('click', () => {
    if (window.BUSINESS_UI?.requestLogout) {
      window.BUSINESS_UI.requestLogout();
      return;
    }
    logout();
  });

  initializeAuth();
})();
