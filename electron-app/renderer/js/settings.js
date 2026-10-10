// Cubis Shop desktop user administration. Legacy permissions and system secrets are not client features.
(function() {
  const form = document.getElementById('user-form');
  const idInput = document.getElementById('user-id');
  const displayNameInput = document.getElementById('user-display-name');
  const usernameInput = document.getElementById('user-username');
  const passwordInput = document.getElementById('user-password');
  const roleInput = document.getElementById('user-role');
  const platformInput = document.getElementById('user-platform');
  const activeInput = document.getElementById('user-active');
  const errorBox = document.getElementById('user-error');
  const resetButton = document.getElementById('user-reset-btn');
  const saveButton = document.getElementById('user-save-btn');
  const list = document.getElementById('users-list');
  const summary = document.getElementById('users-summary-label');
  const stats = document.getElementById('users-mini-stats');
  let users = [];

  const token = () => window.AUTH?.getToken?.() || '';
  const protectedAdmin = user => String(user?.username || '').toLowerCase() === 'admin';
  const labels = { admin: 'Administrator', manager: 'Manager', user: 'Utilizator', desktop: 'Desktop', mobile: 'Mobil', both: 'Desktop + Mobil' };

  function showError(message = '') {
    if (!errorBox) return;
    errorBox.textContent = message;
    errorBox.style.display = message ? 'block' : 'none';
  }

  function resetForm() {
    idInput.value = '';
    displayNameInput.value = '';
    usernameInput.value = '';
    usernameInput.disabled = false;
    passwordInput.value = '';
    roleInput.value = 'user';
    platformInput.value = 'both';
    activeInput.checked = true;
    activeInput.disabled = false;
    showError();
  }

  function editUser(user) {
    idInput.value = user.id;
    displayNameInput.value = user.display_name || user.username;
    usernameInput.value = user.username;
    usernameInput.disabled = protectedAdmin(user);
    passwordInput.value = '';
    roleInput.value = user.role || 'user';
    platformInput.value = user.platform_access || 'both';
    activeInput.checked = Boolean(user.is_active);
    activeInput.disabled = protectedAdmin(user);
    form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function render() {
    if (!list) return;
    list.replaceChildren();
    summary.textContent = `${users.length} conturi în baza Cubis Shop`;
    if (stats) stats.innerHTML = `<span>${users.filter(user => user.is_active).length} active</span><span>${users.filter(user => user.role === 'admin').length} admin</span>`;
    users.forEach(user => {
      const row = document.createElement('div');
      row.className = 'user-row';
      const details = document.createElement('div');
      details.className = 'user-row-main';
      const name = document.createElement('strong');
      name.textContent = user.display_name || user.username;
      const meta = document.createElement('small');
      meta.textContent = `@${user.username} · ${labels[user.role] || user.role} · ${labels[user.platform_access] || user.platform_access}`;
      const state = document.createElement('span');
      state.className = user.is_active ? 'status active' : 'status inactive';
      state.textContent = user.is_active ? 'ACTIV' : 'INACTIV';
      details.append(name, meta, state);
      const actions = document.createElement('div');
      actions.className = 'user-row-actions';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'btn-ghost';
      edit.textContent = 'Editează';
      edit.addEventListener('click', () => editUser(user));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn-ghost danger';
      remove.textContent = 'Șterge';
      remove.disabled = protectedAdmin(user) || user.id === window.AUTH?.getUser?.()?.id;
      remove.addEventListener('click', async () => {
        if (!confirm(`Ștergi contul ${user.username}?`)) return;
        try { await window.API.deleteUser(token(), user.id); await loadUsers(); }
        catch (error) { window.BUSINESS_UI?.showToast?.(error.message || 'Contul nu a putut fi șters.', 'error'); }
      });
      actions.append(edit, remove);
      row.append(details, actions);
      list.appendChild(row);
    });
  }

  async function loadUsers() {
    if (!window.AUTH?.isAdmin?.()) return;
    list.innerHTML = '<div class="loading">Se încarcă...</div>';
    try { users = await window.API.getUsers(token()); render(); }
    catch (error) { list.textContent = error.message || 'Utilizatorii nu au putut fi încărcați.'; }
  }

  form?.addEventListener('submit', async event => {
    event.preventDefault();
    showError();
    const id = idInput.value;
    const password = passwordInput.value;
    if (!id && password.length < 6) return showError('Parola trebuie să aibă minimum 6 caractere.');
    if (id && password && password.length < 6) return showError('Parola trebuie să aibă minimum 6 caractere.');
    const payload = {
      username: usernameInput.value.trim(),
      display_name: displayNameInput.value.trim(),
      password,
      role: roleInput.value,
      platform_access: platformInput.value,
      is_active: activeInput.checked ? 1 : 0,
    };
    saveButton.disabled = true;
    try {
      if (id) await window.API.updateUser(token(), id, payload);
      else await window.API.createUser(token(), payload);
      resetForm();
      await loadUsers();
      window.BUSINESS_UI?.showToast?.('Utilizatorul a fost salvat.');
    } catch (error) {
      showError(error.message || 'Utilizatorul nu a putut fi salvat.');
    } finally {
      saveButton.disabled = false;
    }
  });

  resetButton?.addEventListener('click', resetForm);
  window.addEventListener('auth-change', () => { if (window.AUTH?.isAdmin?.()) void loadUsers(); });
  window.addEventListener('users-change', () => void loadUsers());
  window.SETTINGS = { loadUsers };
})();
