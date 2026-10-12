import { icon, initShell } from "./cubis-storefront.mjs?v=20261012-contact";

const WHATSAPP_NUMBER = "40726285155";
const form = document.querySelector("[data-contact-form]");
const status = document.querySelector("[data-contact-status]");
const submitLabel = document.querySelector("[data-submit-label]");
const messageField = form?.elements.message;
const messageCount = document.querySelector("[data-message-count]");

const shellPromise = initShell({ active: "contact" });

document.querySelectorAll("[data-contact-icon]").forEach(host => {
  host.innerHTML = icon(host.dataset.contactIcon);
});

function updateMessageCount() {
  if (messageCount && messageField) messageCount.textContent = String(messageField.value.length);
}

function errorMessage(field) {
  if (field.validity.valueMissing) return "Completează acest câmp.";
  if (field.validity.typeMismatch) return "Introdu o adresă de email validă.";
  if (field.validity.tooShort) return `Scrie cel puțin ${field.minLength} caractere.`;
  return "Verifică informația introdusă.";
}

function syncFieldState(field) {
  const wrapper = field.closest(".cs-contact-field");
  const error = wrapper?.querySelector("[data-field-error]");
  const invalid = !field.validity.valid && (field.dataset.touched === "true" || form.dataset.submitted === "true");
  wrapper?.classList.toggle("is-invalid", invalid);
  field.setAttribute("aria-invalid", invalid ? "true" : "false");
  if (error) error.textContent = invalid ? errorMessage(field) : "";
}

function whatsappMessage(data) {
  return [
    "Bună ziua! Doresc să contactez echipa Cubis Shop.",
    "",
    `Nume: ${data.get("full_name").trim()}`,
    `Email: ${data.get("email").trim()}`,
    `Subiect: ${data.get("subject").trim()}`,
    "",
    "Mesaj:",
    data.get("message").trim(),
  ].join("\n");
}

form?.querySelectorAll("input, select, textarea").forEach(field => {
  field.addEventListener("blur", () => {
    field.dataset.touched = "true";
    syncFieldState(field);
  });
  field.addEventListener("input", () => {
    if (field.dataset.touched === "true") syncFieldState(field);
    if (field === messageField) updateMessageCount();
  });
  field.addEventListener("change", () => syncFieldState(field));
});

form?.addEventListener("submit", event => {
  event.preventDefault();
  form.dataset.submitted = "true";
  const fields = [...form.querySelectorAll("input, select, textarea")];
  fields.forEach(syncFieldState);
  if (!form.checkValidity()) {
    form.querySelector(":invalid")?.focus();
    status.textContent = "Verifică, te rog, câmpurile marcate.";
    status.className = "cs-contact-status is-error";
    return;
  }

  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(whatsappMessage(new FormData(form)))}`;
  const whatsappLink = document.createElement("a");
  whatsappLink.href = url;
  whatsappLink.target = "_blank";
  whatsappLink.rel = "noopener noreferrer";
  whatsappLink.setAttribute("aria-hidden", "true");
  whatsappLink.tabIndex = -1;
  document.body.append(whatsappLink);
  whatsappLink.click();
  whatsappLink.remove();

  submitLabel.textContent = "Mesaj pregătit";
  status.textContent = "Am deschis WhatsApp cu mesajul tău completat.";
  status.className = "cs-contact-status is-success";
  window.setTimeout(() => { submitLabel.textContent = "Trimite pe WhatsApp"; }, 2600);
});

updateMessageCount();
await shellPromise;
