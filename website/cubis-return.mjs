import { escapeHtml, icon, initShell, money } from "./cubis-storefront.mjs?v=20261013-legal-1";
import { orderApi } from "./cubis-commerce-api.mjs?v=20261013-legal-1";

const params = new URLSearchParams(location.search);
const localPreview = ["localhost", "127.0.0.1"].includes(location.hostname) && params.get("preview") === "1";
const verify = document.querySelector("[data-return-verify]");
const configure = document.querySelector("[data-return-configure]");
const success = document.querySelector("[data-return-success]");
const verifyError = document.querySelector("[data-return-verify-error]");
const configureError = document.querySelector("[data-return-configure-error]");
let verified = null;
let access = null;

function setProgress(active) {
  const order = ["verify", "configure", "success"];
  const activeIndex = order.indexOf(active);
  document.querySelectorAll("[data-return-progress]").forEach(item => {
    const index = order.indexOf(item.dataset.returnProgress);
    item.classList.toggle("is-active", index === activeIndex);
    item.classList.toggle("is-complete", index < activeIndex);
    if (index === activeIndex) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
  });
}

function showStep(step, shouldScroll = true) {
  verify.hidden = step !== "verify";
  configure.hidden = step !== "configure";
  success.hidden = step !== "success";
  setProgress(step);
  const target = step === "verify" ? verify : step === "configure" ? configure : success;
  if (shouldScroll) target.scrollIntoView({ behavior: "smooth", block: "start" });
  if (step === "success") target.focus({ preventScroll: true });
}

function setButtonState(button, label, busy = false) {
  button.disabled = busy;
  const text = button.querySelector("span");
  if (text) text.textContent = label;
  else button.textContent = label;
  button.classList.toggle("is-loading", busy);
}

function normalizeOrderNumber(value) {
  let number = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  if (/^CS\d{8}-/.test(number)) number = `CS-${number.slice(2)}`;
  return number;
}

function normalizedIban(value) {
  return String(value || "").toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9]/g, "");
}

function validIban(value) {
  const iban = normalizedIban(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  if (iban.startsWith("RO") && iban.length !== 24) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = [...rearranged].map(char => /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char).join("");
  let remainder = 0;
  for (const digit of numeric) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}

function currency(value) {
  return money(value, verified?.order?.currency || "RON");
}

function selectedItems() {
  return [...document.querySelectorAll("[data-return-product]")]
    .filter(row => row.querySelector("[data-return-item]").checked)
    .map(row => ({
      order_item_id: row.querySelector("[data-return-item]").dataset.returnItem,
      quantity: Number(row.querySelector("[data-return-quantity]").value),
    }));
}

function updateTotals() {
  const items = selectedItems();
  const selectedById = new Map(items.map(item => [item.order_item_id, item.quantity]));
  let itemsTotal = 0;
  let full = items.length === verified.order.items.length;
  verified.order.items.forEach(item => {
    const quantity = selectedById.get(item.order_item_id) || 0;
    itemsTotal += quantity * Number(item.unit_refund_value || 0);
    if (Math.abs(quantity - Number(item.quantity || 0)) > .0001) full = false;
  });
  const delivery = full && verified.order.initial_shipping_refundable ? Number(verified.order.initial_shipping_cost || 0) : 0;
  const returnCost = items.length ? Number(verified.order.return_cost || 0) : 0;
  document.querySelector("[data-return-selected]").textContent = currency(itemsTotal + delivery);
  document.querySelector("[data-return-cost]").textContent = currency(returnCost);
  document.querySelector("[data-return-estimate]").textContent = currency(Math.max(0, itemsTotal + delivery - returnCost));
  const count = document.querySelector("[data-return-selected-count]");
  count.textContent = `${items.length} ${items.length === 1 ? "produs selectat" : "produse selectate"}`;
  document.querySelectorAll("[data-return-product]").forEach(row => {
    const checked = row.querySelector("[data-return-item]").checked;
    row.classList.toggle("is-selected", checked);
    row.querySelector("[data-return-quantity]").disabled = !checked;
  });
}

function renderProducts() {
  const business = verified.eligibility.policy_type === "b2b_commercial";
  const deadline = new Date(String(verified.eligibility.deadline_at || "").replace(" ", "T"));
  document.querySelector("[data-return-order]").textContent = `${verified.order.order_number} · ${verified.order.customer_display_name}`;
  document.querySelector("[data-return-deadline]").innerHTML = `<span>✓</span><div><strong>${business ? "Retur comercial PJ" : "Retragere PF"}</strong><p>${Number.isNaN(deadline.getTime()) ? "Termen verificat automat" : `Poți trimite solicitarea până la ${escapeHtml(deadline.toLocaleDateString("ro-RO", { dateStyle: "long" }))}, inclusiv`} · ${Number(verified.eligibility.days_remaining || 0)} zile rămase</p></div>`;
  document.querySelector("[data-return-cost-label]").textContent = verified.order.shipping_method_name ? `Retur prin ${verified.order.shipping_method_name}` : "Cost direct retur";
  const reasonRequired = document.querySelector("[data-return-reason-required]");
  reasonRequired.textContent = business ? "*" : "(opțional)";
  configure.elements.reason_choice.required = business;
  configure.elements.reason_choice.options[0].textContent = business ? "Alege motivul returului" : "Nu doresc să declar un motiv";
  setButtonState(document.querySelector("[data-return-submit]"), business ? "Trimite solicitarea de retur" : "Confirmă retragerea");
  document.querySelector("[data-return-products]").innerHTML = verified.order.items.map(item => {
    const max = Math.max(1, Math.floor(Number(item.quantity || 1)));
    const options = Array.from({ length: max }, (_, index) => `<option value="${index + 1}"${index + 1 === max ? " selected" : ""}>${index + 1} din ${max}</option>`).join("");
    return `<article class="cs-return-product is-selected" data-return-product><label class="cs-return-product__select"><input type="checkbox" data-return-item="${escapeHtml(item.order_item_id)}" aria-label="Selectează ${escapeHtml(item.product_name)}" checked><span class="cs-return-product__check" aria-hidden="true">✓</span></label><span class="cs-return-product__media">${icon("package")}</span><span class="cs-return-product__copy"><strong>${escapeHtml(item.product_name)}</strong><small>${escapeHtml(item.product_sku || "Produs Cubis Shop")}</small><b class="cs-return-product__price">${escapeHtml(currency(item.unit_refund_value))} / buc.</b></span><label class="cs-return-product__quantity"><span>CANTITATE RETUR</span><select data-return-quantity aria-label="Cantitate pentru ${escapeHtml(item.product_name)}">${options}</select></label></article>`;
  }).join("");
  document.querySelectorAll("[data-return-item], [data-return-quantity]").forEach(control => control.addEventListener("change", updateTotals));
  updateTotals();
}

function previewValidation() {
  return {
    verified: true,
    order: {
      order_number: "CS-20261013-48BCA417",
      customer_type: "individual",
      customer_display_name: "Alexie Popescu",
      currency: "RON",
      shipping_method_name: "Livrare rapidă",
      return_cost: 19.9,
      initial_shipping_cost: 5,
      initial_shipping_refundable: true,
      items: [
        { order_item_id: "demo-1", product_name: "Termos inox Trek 750 ml", product_sku: "CUBIS-DEMO-021", quantity: 1, unit_refund_value: 107.91, line_refund_value: 107.91 },
        { order_item_id: "demo-2", product_name: "Cablu USB-C Flex 2 m", product_sku: "CUBIS-DEMO-034", quantity: 2, unit_refund_value: 49.9, line_refund_value: 99.8 },
      ],
    },
    eligibility: { eligible: true, policy_type: "b2c_withdrawal", deadline_at: "2026-11-12 23:59:59", days_remaining: 30, initial_shipping_refundable: true },
  };
}

verify.addEventListener("submit", async event => {
  event.preventDefault();
  verifyError.textContent = "";
  if (!verify.reportValidity()) return;
  access = {
    order_number: normalizeOrderNumber(verify.elements.order_number.value),
    email: String(verify.elements.email.value || "").trim().toLowerCase(),
  };
  verify.elements.order_number.value = access.order_number;
  verify.elements.email.value = access.email;
  const button = document.querySelector("[data-return-verify-submit]");
  setButtonState(button, "Verificăm comanda…", true);
  try {
    verified = localPreview ? previewValidation() : await orderApi.validateReturn(access);
    if (!verified?.eligibility?.eligible) throw new Error(verified?.eligibility?.reason || "Comanda nu este eligibilă pentru retur.");
    renderProducts();
    showStep("configure");
  } catch (error) {
    verifyError.textContent = error instanceof Error ? error.message : "Comanda nu a putut fi verificată.";
    verifyError.focus();
  } finally {
    setButtonState(button, "Verifică eligibilitatea");
  }
});

configure.elements.reason_choice.addEventListener("change", () => {
  const detail = document.querySelector("[data-return-reason-details]");
  const show = configure.elements.reason_choice.value === "Alt motiv";
  detail.hidden = !show;
  configure.elements.reason_detail.required = show;
});

configure.elements.bank_iban.addEventListener("input", event => {
  const normalized = normalizedIban(event.currentTarget.value).slice(0, 34);
  event.currentTarget.value = normalized.match(/.{1,4}/g)?.join(" ") || "";
  const feedback = document.querySelector("[data-return-iban-feedback]");
  const complete = normalized.length >= 15;
  const valid = complete && validIban(normalized);
  feedback.textContent = valid ? "IBAN verificat corect." : complete ? "Verifică IBAN-ul introdus." : "IBAN-ul este verificat înainte de trimitere.";
  feedback.classList.toggle("is-valid", valid);
  feedback.classList.toggle("is-invalid", complete && !valid);
});

document.querySelector("[data-return-back]").addEventListener("click", () => {
  showStep("verify");
});

configure.addEventListener("submit", async event => {
  event.preventDefault();
  configureError.textContent = "";
  const business = verified.eligibility.policy_type === "b2b_commercial";
  const choice = configure.elements.reason_choice.value.trim();
  const detail = configure.elements.reason_detail.value.trim();
  const reason = choice === "Alt motiv" ? detail : (choice || (business ? "" : "Retragere fără motiv declarat"));
  const iban = normalizedIban(configure.elements.bank_iban.value);
  const items = selectedItems();
  if (!configure.reportValidity()) return;
  if (business && reason.length < 3) { configureError.textContent = "Completează motivul returului comercial."; return; }
  if (!validIban(iban)) { configureError.textContent = "Introdu un IBAN valid pentru rambursare."; configure.elements.bank_iban.focus(); return; }
  if (!items.length) { configureError.textContent = "Selectează cel puțin un produs."; return; }
  const button = document.querySelector("[data-return-submit]");
  setButtonState(button, "Înregistrăm solicitarea…", true);
  try {
    if (localPreview) await new Promise(resolve => setTimeout(resolve, 450));
    else await orderApi.requestReturn({
        ...access,
        reason,
        bank_account_holder: configure.elements.bank_account_holder.value.trim(),
        bank_iban: iban,
        items,
        refund_consent: true,
        withdrawal_statement: business ? "" : `Mă retrag din contractul aferent comenzii ${verified.order.order_number}.`,
      });
    showStep("success");
  } catch (error) {
    configureError.textContent = error instanceof Error ? error.message : "Solicitarea nu a putut fi trimisă.";
    configureError.focus();
  } finally {
    setButtonState(button, business ? "Trimite solicitarea de retur" : "Confirmă retragerea");
  }
});

document.querySelectorAll("[data-return-icon]").forEach(host => {
  host.innerHTML = icon(host.dataset.returnIcon);
});
setProgress("verify");
if (localPreview && ["configure", "success"].includes(params.get("step"))) {
  access = { order_number: "CS-20261013-48BCA417", email: "client@exemplu.ro" };
  verified = previewValidation();
  renderProducts();
  showStep(params.get("step"), false);
}
const shellReady = initShell();
if (localPreview) shellReady.then(() => document.querySelector('[data-cookie-choice="reject"]')?.click());
await shellReady;
