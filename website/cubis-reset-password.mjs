import { customerApi } from "./cubis-commerce-api.mjs";
import { icon, initShell } from "./cubis-storefront.mjs?v=20261012-reset";

const params = new URLSearchParams(location.search);
const email = String(params.get("email") || "").trim().toLowerCase();
const token = String(params.get("token") || "").trim().toLowerCase();
const form = document.querySelector("[data-reset-form]");
const status = document.querySelector("[data-reset-status]");
const strength = document.querySelector("[data-password-strength]");
const submitLabel = document.querySelector("[data-submit-label]");

initShell({ active: "account" });
document.querySelectorAll("[data-auth-icon]").forEach(host => { host.innerHTML = icon(host.dataset.authIcon); });

function showState(name) {
  document.querySelectorAll("[data-reset-state]").forEach(state => {
    const active = state.dataset.resetState === name;
    state.hidden = !active;
    state.classList.toggle("is-active", active);
  });
}

function setStatus(message = "", type = "error") {
  if (!status) return;
  status.textContent = message;
  status.hidden = !message;
  status.className = `cs-auth-status${message ? ` is-${type}` : ""}`;
}

function setBusy(busy) {
  form?.classList.toggle("is-busy", busy);
  form?.querySelectorAll("input, button").forEach(control => { control.disabled = busy; });
  if (submitLabel) submitLabel.textContent = busy ? "Salvăm în siguranță…" : "Salvează parola nouă";
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
  const value = form?.elements.password?.value || "";
  const score = passwordScore(value);
  if (!strength) return;
  strength.dataset.score = String(score);
  const copy = [
    "Folosește minimum 8 caractere, litere și cifre.",
    "Mai adaugă o literă și o cifră.",
    "Parolă acceptabilă — o poți face mai puternică.",
    "Parolă bună.",
    "Parolă foarte bună.",
  ];
  strength.querySelector("small").textContent = copy[score];
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

function fieldError(field) {
  if (field.validity.valueMissing) return "Completează acest câmp.";
  if (field.validity.tooShort) return "Introdu minimum 8 caractere.";
  if (field.validity.customError) return field.validationMessage;
  return "Verifică informația introdusă.";
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

form?.querySelectorAll("input").forEach(field => {
  field.addEventListener("blur", () => { field.dataset.touched = "true"; syncField(field); });
  field.addEventListener("input", () => {
    if (field.dataset.touched === "true") syncField(field);
    if (field.name === "password") {
      syncStrength();
      if (form.elements.password_confirm.value) syncField(form.elements.password_confirm);
    }
  });
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

form?.addEventListener("submit", async event => {
  event.preventDefault();
  form.dataset.submitted = "true";
  validatePasswords();
  form.querySelectorAll("input").forEach(syncField);
  setStatus();
  if (!form.checkValidity()) {
    form.querySelector(":invalid")?.focus();
    setStatus("Verifică parolele introduse înainte de a continua.");
    return;
  }
  setBusy(true);
  try {
    await customerApi.resetPassword({ email, token, password: form.elements.password.value, password_confirm: form.elements.password_confirm.value });
    const loginLink = document.querySelector("[data-login-link]");
    if (loginLink) loginLink.href = `/login?email=${encodeURIComponent(email)}`;
    showState("success");
  } catch (error) {
    const message = error?.message || "Parola nu a putut fi schimbată. Încearcă din nou.";
    if (/linkul|expirat|utilizat/i.test(message)) {
      document.querySelector("[data-invalid-message]").textContent = message;
      showState("invalid");
    } else {
      setStatus(message);
      setBusy(false);
    }
  }
});

async function verifyLink() {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[a-f0-9]{64}$/.test(token)) {
    showState("invalid");
    return;
  }
  try {
    await customerApi.validateResetLink({ email, token });
    const emailLabel = document.querySelector("[data-reset-email]");
    if (emailLabel) emailLabel.textContent = email;
    showState("form");
    form?.elements.password?.focus({ preventScroll: true });
  } catch (error) {
    document.querySelector("[data-invalid-message]").textContent = error?.message || "Linkul nu poate fi verificat momentan. Solicită unul nou.";
    showState("invalid");
  }
}

syncStrength();
verifyLink();
