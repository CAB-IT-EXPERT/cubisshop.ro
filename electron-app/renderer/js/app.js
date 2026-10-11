// Cubis Shop desktop is shop-only and has no legacy module fallback.
(function() {
  const LAST_TAB_KEY = 'cubisshop.lastShopTab.v1';
  const allowedTabs = new Set(Array.from(document.querySelectorAll('.nav-btn[data-tab]')).map(button => button.dataset.tab));
  const defaultTab = 'shop-dashboard';

  function switchTab(tabId) {
    const next = allowedTabs.has(tabId) ? tabId : defaultTab;
    if (next === 'settings' && !window.AUTH?.isAdmin?.()) return switchTab(defaultTab);
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.toggle('active', panel.id === `tab-${next}`));
    document.querySelectorAll('.nav-btn[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === next));
    localStorage.setItem(LAST_TAB_KEY, next);
    window.dispatchEvent(new CustomEvent('tab-change', { detail: next }));
  }

  document.querySelectorAll('.nav-btn[data-tab]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.tab)));
  // Dashboard content is rendered asynchronously, so navigation triggers may
  // not exist yet when this module starts. Delegate the click to keep both the
  // initial controls and dynamically rendered dashboard actions functional.
  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-shop-open]');
    if (!trigger) return;
    if (trigger.dataset.shopOrderFilter) {
      window.dispatchEvent(new CustomEvent('shop-order-filter-change', {
        detail: trigger.dataset.shopOrderFilter,
      }));
    }
    switchTab(trigger.dataset.shopOpen);
  });

  window.addEventListener('auth-change', () => {
    const current = document.querySelector('.nav-btn.active[data-tab]')?.dataset.tab;
    if (current === 'settings' && !window.AUTH?.isAdmin?.()) switchTab(defaultTab);
  });
  window.addEventListener('cubis-open-order', event => {
    switchTab('shop-orders');
    setTimeout(() => window.dispatchEvent(new CustomEvent('shop-open-entity', { detail: { type: 'order', id: event.detail?.id } })), 120);
  });

  window.switchTab = switchTab;
  const selectShop = () => switchTab(localStorage.getItem(LAST_TAB_KEY) || defaultTab);
  window.selectModule = selectShop;
  window.selectAppModule = selectShop;

  if (typeof window.onAppDeepLink === 'function') {
    window.onAppDeepLink((payload) => {
      if (payload?.type !== 'order' || !payload.orderId) return;
      switchTab('shop-orders');
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('shop-open-entity', {
          detail: { type: 'order', id: payload.orderId },
        }));
      }, 120);
    });
  }
  switchTab(localStorage.getItem(LAST_TAB_KEY) || defaultTab);
})();
