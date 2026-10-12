import { customerApi, migrateHistoricalStorage, STORAGE_KEYS } from "./cubis-commerce-api.mjs";
import { icon, initShell } from "./cubis-storefront.mjs?v=20261012-auth";

const page = document.body.dataset.authPage === "register" ? "register" : "login";
const form = document.querySelector("[data-auth-form]");
const status = document.querySelector("[data-auth-status]");
const submitLabel = document.querySelector("[data-submit-label]");
const googleHost = document.querySelector("[data-google-auth]");
const googleNote = document.querySelector("[data-google-note]");
const forgotButton = document.querySelector("[data-forgot-password]");
const strength = document.querySelector("[data-password-strength]");
let googleScriptPromise = null;

migrateHistoricalStorage();
const shellPromise = initShell({ active: "account" });

document.querySelectorAll("[data-auth-icon]").forEach(host => {
  host.innerHTML = icon(host.dataset.authIcon);
});

function setStatus(message = "", type = "error") {
  if (!status) return;
  status.textContent = message;
  status.hidden = !message;
  status.className = `cs-auth-status${message ? ` is-${type}` : ""}`;
}

function setBusy(busy, label = "") {
  form?.classList.toggle("is-busy", busy);
  form?.querySelectorAll("input, button").forEach(control => { control.disabled = busy; });
  if (submitLabel) submitLabel.textContent = busy ? label : page === "register" ? "Creează contul" : "Intră în cont";
}

function saveSession(payload) {
  if (!payload?.token || !payload?.customer) throw new Error("Răspunsul de autentificare este incomplet.");
  localStorage.setItem(STORAGE_KEYS.customerToken, String(payload.token));
  localStorage.setItem(STORAGE_KEYS.customerProfile, JSON.stringify(payload.customer));
  document.dispatchEvent(new CustomEvent("cubis:customer-changed", { detail: payload.customer }));
}

function safeRedirect() {
  const requested = new URLSearchParams(location.search).get("redirect");
  if (!requested || !requested.startsWith("/") || requested.startsWith("//")) return "/magazin";
  try {
    const resolved = new URL(requested, location.origin);
    return resolved.origin === location.origin ? `${resolved.pathname}${resolved.search}${resolved.hash}` : "/magazin";
  } catch {
    return "/magazin";
  }
}

function fieldError(field) {
  if (field.validity.valueMissing) return field.type === "checkbox" ? "Bifează acordul pentru a continua." : "Completează acest câmp.";
  if (field.validity.typeMismatch) return "Introdu o adresă de e-mail validă.";
  if (field.validity.tooShort) return `Introdu cel puțin ${field.minLength} caractere.`;
  if (field.validity.customError) return field.validationMessage;
  return "Verifică informația introdusă.";
}

function validatePasswords() {
  const password = form?.elements.password;
  const confirm = form?.elements.password_confirm;
  if (password) {
    const value = password.value;
    password.setCustomValidity(value && (!/[A-Za-zĂÂÎȘȚăâîșț]/u.test(value) || !/\d/.test(value))
      ? "Parola trebuie să conțină cel puțin o literă și o cifră."
      : "");
  }
  if (confirm) confirm.setCustomValidity(confirm.value && confirm.value !== password?.value ? "Parolele introduse nu coincid." : "");
}

function syncField(field) {
  validatePasswords();
  const wrapper = field.closest(".cs-auth-field");
  const error = wrapper?.querySelector("[data-field-error]");
  const showError = !field.validity.valid && (field.dataset.touched === "true" || form?.dataset.submitted === "true");
  wrapper?.classList.toggle("is-invalid", showError);
  wrapper?.classList.toggle("is-valid", field.validity.valid && Boolean(field.value));
  field.setAttribute("aria-invalid", showError ? "true" : "false");
  if (error) error.textContent = showError ? fieldError(field) : "";
}

function passwordScore(value) {
  if (!value) return 0;
  let score = 0;
  if (value.length >= 8) score += 1;
  if (/[A-Za-zĂÂÎȘȚăâîșț]/u.test(value) && /\d/.test(value)) score += 1;
  if (/[A-ZĂÂÎȘȚ]/u.test(value) && /[a-zăâîșț]/u.test(value)) score += 1;
  if (value.length >= 12 || /[^A-Za-z0-9ĂÂÎȘȚăâîșț]/u.test(value)) score += 1;
  return score;
}

function syncStrength() {
  if (!strength || !form?.elements.password) return;
  const score = passwordScore(form.elements.password.value);
  strength.dataset.score = String(score);
  const copy = [
    "Folosește minimum 8 caractere, litere și cifre.",
    "Parolă slabă — mai adaugă o cifră sau o literă.",
    "Parolă acceptabilă — o poți face mai puternică.",
    "Parolă bună.",
    "Parolă foarte bună.",
  ];
  const hint = strength.querySelector("small");
  if (hint) hint.textContent = copy[score];
}

form?.querySelectorAll("input").forEach(field => {
  field.addEventListener("blur", () => {
    field.dataset.touched = "true";
    syncField(field);
  });
  field.addEventListener("input", () => {
    if (field.dataset.touched === "true") syncField(field);
    if (field.name === "password") {
      syncStrength();
      const confirm = form.elements.password_confirm;
      if (confirm?.value) syncField(confirm);
    }
  });
  field.addEventListener("change", () => syncField(field));
});

document.querySelectorAll("[data-password-toggle]").forEach(button => {
  button.addEventListener("click", () => {
    const input = button.closest(".cs-auth-input")?.querySelector("input");
    if (!input) return;
    input.type = input.type === "password" ? "text" : "password";
    const visible = input.type === "text";
    button.classList.toggle("is-visible", visible);
    button.setAttribute("aria-label", visible ? "Ascunde parola" : "Arată parola");
    input.focus({ preventScroll: true });
  });
});

function syncConsent() {
  const consent = form?.elements.account_consent;
  const error = document.querySelector("[data-consent-error]");
  if (!consent || !error) return;
  const show = !consent.checked && form?.dataset.submitted === "true";
  error.textContent = show ? "Acceptă folosirea datelor pentru a crea și administra contul." : "";
  consent.setAttribute("aria-invalid", show ? "true" : "false");
}

form?.elements.account_consent?.addEventListener("change", syncConsent);

form?.addEventListener("submit", async event => {
  event.preventDefault();
  form.dataset.submitted = "true";
  validatePasswords();
  [...form.elements].filter(field => field instanceof HTMLInputElement).forEach(syncField);
  syncConsent();
  setStatus();
  if (!form.checkValidity()) {
    form.querySelector(":invalid")?.focus();
    setStatus("Verifică informațiile marcate înainte de a continua.");
    return;
  }

  const data = new FormData(form);
  setBusy(true, page === "register" ? "Îți creăm contul…" : "Verificăm datele…");
  try {
    const payload = page === "register"
      ? await customerApi.register({
          full_name: String(data.get("full_name") || "").trim(),
          phone: String(data.get("phone") || "").trim(),
          email: String(data.get("email") || "").trim(),
          password: String(data.get("password") || ""),
        })
      : await customerApi.login({
          email: String(data.get("email") || "").trim(),
          password: String(data.get("password") || ""),
        });
    saveSession(payload);
    setStatus(page === "register" ? "Contul a fost creat. Te redirecționăm…" : "Autentificare reușită. Te redirecționăm…", "success");
    window.setTimeout(() => { location.href = safeRedirect(); }, 520);
  } catch (error) {
    setStatus(error?.message || "Cererea nu a putut fi finalizată. Încearcă din nou.");
    setBusy(false);
  }
});

forgotButton?.addEventListener("click", async () => {
  const email = form?.elements.email;
  if (!email) return;
  email.dataset.touched = "true";
  syncField(email);
  if (!email.validity.valid) {
    email.focus();
    setStatus("Introdu o adresă de e-mail validă pentru resetarea parolei.");
    return;
  }
  forgotButton.disabled = true;
  setStatus("Pregătim solicitarea securizată…", "info");
  try {
    const result = await customerApi.forgotPassword(email.value.trim());
    setStatus(result?.message || "Dacă există un cont activ, vei primi instrucțiunile prin e-mail.", "success");
  } catch (error) {
    setStatus(error?.message || "Resetarea parolei nu este disponibilă momentan.");
  } finally {
    forgotButton.disabled = false;
  }
});

function ensureGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;
  googleScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => window.google?.accounts?.id ? resolve() : reject(new Error("Serviciul Google nu este disponibil."));
    script.onerror = () => reject(new Error("Serviciul Google nu a putut fi încărcat."));
    document.head.append(script);
  }).catch(error => {
    googleScriptPromise = null;
    throw error;
  });
  return googleScriptPromise;
}

function disableGoogle(message) {
  if (!googleHost) return;
  googleHost.setAttribute("aria-busy", "false");
  const button = googleHost.querySelector(".cs-google-button");
  button?.classList.remove("is-loading");
  if (button) {
    button.disabled = true;
    button.setAttribute("aria-disabled", "true");
    button.tabIndex = -1;
  }
  if (googleNote) {
    googleNote.textContent = message;
    googleNote.hidden = false;
  }
}

async function completeGoogleLogin(response) {
  setStatus("Verificăm identitatea Google…", "info");
  try {
    const payload = await customerApi.googleLogin(String(response?.credential || ""));
    saveSession(payload);
    setStatus(payload?.is_new_customer ? "Contul a fost creat. Te redirecționăm…" : "Autentificare reușită. Te redirecționăm…", "success");
    window.setTimeout(() => { location.href = safeRedirect(); }, 520);
  } catch (error) {
    setStatus(error?.message || "Autentificarea Google nu a putut fi finalizată.");
  }
}

async function initializeGoogle() {
  if (!googleHost) return;
  try {
    const config = await customerApi.authConfig();
    const clientId = String(config?.google_client_id || "").trim();
    if (!clientId) {
      disableGoogle("Autentificarea Google este dezactivată până la configurarea contului Cubis Shop.");
      return;
    }
    await ensureGoogleScript();
    window.google.accounts.id.initialize({ client_id: clientId, callback: completeGoogleLogin, auto_select: false, cancel_on_tap_outside: true });
    const official = document.createElement("div");
    official.className = "cs-google-official";
    official.setAttribute("aria-label", page === "register" ? "Creează cont cu Google" : "Continuă cu Google");
    googleHost.append(official);
    window.google.accounts.id.renderButton(official, { type: "standard", theme: "outline", size: "large", text: page === "register" ? "signup_with" : "continue_with", shape: "rectangular", width: Math.max(250, Math.floor(googleHost.getBoundingClientRect().width)) });
    googleHost.setAttribute("aria-busy", "false");
    googleHost.querySelector(".cs-google-button")?.classList.remove("is-loading");
  } catch (error) {
    disableGoogle("Autentificarea Google nu este disponibilă momentan. Folosește e-mailul și parola.");
  }
}

try {
  const storedProfile = JSON.parse(localStorage.getItem(STORAGE_KEYS.customerProfile) || "null");
  const storedToken = localStorage.getItem(STORAGE_KEYS.customerToken);
  if (storedProfile && storedToken) setStatus(`Ești deja autentificat${storedProfile.full_name ? ` ca ${storedProfile.full_name}` : ""}. Poți continua în magazin.`, "info");
} catch {
  // Stocarea locală poate fi indisponibilă în modurile restrictive ale browserului.
}

syncStrength();
initializeGoogle();
await shellPromise;
