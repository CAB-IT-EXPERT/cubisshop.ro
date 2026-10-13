const STORAGE_KEY = "cubis-shop-cookie-consent-v1";
const CONSENT_VERSION = 1;

let currentChoice = readChoice();
let initialized = false;
let lastFocused = null;

function readChoice() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return parsed?.version === CONSENT_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

function normalizedChoice(value = {}) {
  return {
    version: CONSENT_VERSION,
    necessary: true,
    preferences: Boolean(value.preferences),
    saved_at: new Date().toISOString(),
  };
}

function persistChoice(value) {
  currentChoice = normalizedChoice(value);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentChoice));
  } catch {
    // Magazinul rămâne utilizabil și când stocarea locală este blocată.
  }
  closeConsent();
  window.dispatchEvent(new CustomEvent("cubis:consent-changed", { detail: { ...currentChoice } }));
}

function closeConsent() {
  document.querySelector("[data-cookie-layer]")?.remove();
  document.body.classList.remove("cs-cookie-open");
  lastFocused?.focus?.();
  lastFocused = null;
}

function category(key, title, description, checked, disabled = false) {
  return `<label class="cs-cookie-category">
    <span><strong>${title}</strong><small>${description}</small></span>
    <input type="checkbox" name="cookie-${key}"${checked ? " checked" : ""}${disabled ? " disabled" : ""}>
    <i aria-hidden="true"></i>
  </label>`;
}

function openConsent({ customize = true } = {}) {
  document.querySelector("[data-cookie-layer]")?.remove();
  const state = currentChoice || normalizedChoice();
  lastFocused = document.activeElement;
  const layer = document.createElement("div");
  layer.className = "cs-cookie-layer";
  layer.dataset.cookieLayer = "";
  layer.innerHTML = `<section class="cs-cookie-dialog" role="dialog" aria-modal="true" aria-labelledby="cookie-dialog-title" aria-describedby="cookie-dialog-description">
    <button class="cs-cookie-close" type="button" data-cookie-close aria-label="Închide preferințele cookie">×</button>
    <div class="cs-cookie-brand"><img src="/assets/cubis-shop-icon.png" width="52" height="52" alt=""><div><small>CONTROLUL TĂU</small><h2 id="cookie-dialog-title">Preferințe de confidențialitate</h2></div></div>
    <p id="cookie-dialog-description">Folosim stocarea strict necesară pentru cont, coș, securitate și finalizarea comenzilor. Preferințele locale sunt opționale și rămân dezactivate până alegi altfel.</p>
    <div class="cs-cookie-categories"${customize ? "" : " hidden"}>
      ${category("necessary", "Strict necesare", "Sesiune, securitate, coș și funcțiile solicitate de tine.", true, true)}
      ${category("preferences", "Preferințe", "Memorează alegeri locale neesențiale pentru o experiență mai comodă.", state.preferences)}
    </div>
    <div class="cs-cookie-actions">
      <button type="button" data-cookie-choice="reject">Doar necesare</button>
      <button type="button" data-cookie-choice="customize">${customize ? "Salvează selecția" : "Personalizează"}</button>
      <button class="is-primary" type="button" data-cookie-choice="accept">Acceptă toate</button>
    </div>
    <a href="/politica-cookies">Citește politica de cookie-uri</a>
  </section>`;
  document.body.append(layer);
  document.body.classList.add("cs-cookie-open");

  const dialog = layer.querySelector(".cs-cookie-dialog");
  const categories = layer.querySelector(".cs-cookie-categories");
  layer.querySelector("[data-cookie-choice=reject]").addEventListener("click", () => persistChoice({ preferences: false }));
  layer.querySelector("[data-cookie-choice=accept]").addEventListener("click", () => persistChoice({ preferences: true }));
  layer.querySelector("[data-cookie-choice=customize]").addEventListener("click", event => {
    if (categories.hidden) {
      categories.hidden = false;
      event.currentTarget.textContent = "Salvează selecția";
      return;
    }
    persistChoice({ preferences: layer.querySelector("[name=cookie-preferences]").checked });
  });
  layer.querySelector("[data-cookie-close]").addEventListener("click", closeConsent);
  layer.addEventListener("click", event => { if (event.target === layer && currentChoice) closeConsent(); });
  layer.addEventListener("keydown", event => {
    if (event.key === "Escape" && currentChoice) closeConsent();
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll("button:not([disabled]), a[href], input:not([disabled])")];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  layer.querySelector(".is-primary")?.focus();
}

export function getCookieConsent() {
  return currentChoice ? { ...currentChoice } : null;
}

export function initCookieConsent() {
  if (initialized) return;
  initialized = true;
  document.addEventListener("click", event => {
    const trigger = event.target.closest("[data-cookie-settings]");
    if (!trigger) return;
    event.preventDefault();
    openConsent({ customize: true });
  });
  window.addEventListener("cubis:open-consent", () => openConsent({ customize: true }));
  if (!currentChoice) queueMicrotask(() => openConsent({ customize: false }));
}

export { openConsent };
