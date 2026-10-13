import { escapeHtml, icon, initShell, money } from "./cubis-storefront.mjs?v=20261013-legal-1";
import { orderApi } from "./cubis-commerce-api.mjs?v=20261013-legal-1";

const verify = document.querySelector("[data-return-verify]");
const configure = document.querySelector("[data-return-configure]");
const success = document.querySelector("[data-return-success]");
const verifyError = document.querySelector("[data-return-verify-error]");
const configureError = document.querySelector("[data-return-configure-error]");
let verified = null;
let access = null;

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
  const returnCost = Number(verified.order.return_cost || 0);
  document.querySelector("[data-return-selected]").textContent = currency(itemsTotal + delivery);
  document.querySelector("[data-return-cost]").textContent = currency(returnCost);
  document.querySelector("[data-return-estimate]").textContent = currency(Math.max(0, itemsTotal + delivery - returnCost));
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
  document.querySelector("[data-return-submit]").textContent = business ? "Trimite solicitarea de retur →" : "Confirmă retragerea →";
  document.querySelector("[data-return-products]").innerHTML = verified.order.items.map(item => {
    const max = Math.max(1, Math.floor(Number(item.quantity || 1)));
    const options = Array.from({ length: max }, (_, index) => `<option value="${index + 1}"${index + 1 === max ? " selected" : ""}>${index + 1} din ${max}</option>`).join("");
    return `<label class="cs-return-product" data-return-product><input type="checkbox" data-return-item="${escapeHtml(item.order_item_id)}" checked><span class="cs-return-product__check" aria-hidden="true">✓</span><span><strong>${escapeHtml(item.product_name)}</strong><small>${escapeHtml(item.product_sku || "Produs Cubis Shop")} · ${escapeHtml(currency(item.unit_refund_value))} / buc.</small></span><select data-return-quantity aria-label="Cantitate pentru ${escapeHtml(item.product_name)}">${options}</select></label>`;
  }).join("");
  document.querySelectorAll("[data-return-item], [data-return-quantity]").forEach(control => control.addEventListener("change", updateTotals));
  updateTotals();
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
  button.disabled = true;
  button.textContent = "Verificăm…";
  try {
    verified = await orderApi.validateReturn(access);
    if (!verified?.eligibility?.eligible) throw new Error(verified?.eligibility?.reason || "Comanda nu este eligibilă pentru retur.");
    renderProducts();
    verify.hidden = true;
    configure.hidden = false;
    configure.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    verifyError.textContent = error instanceof Error ? error.message : "Comanda nu a putut fi verificată.";
    verifyError.focus();
  } finally {
    button.disabled = false;
    button.textContent = "Verifică eligibilitatea →";
  }
});

configure.elements.reason_choice.addEventListener("change", () => {
  const detail = document.querySelector("[data-return-reason-details]");
  const show = configure.elements.reason_choice.value === "Alt motiv";
  detail.hidden = !show;
  configure.elements.reason_detail.required = show;
});

configure.elements.bank_iban.addEventListener("input", event => {
  const start = event.currentTarget.selectionStart;
  event.currentTarget.value = event.currentTarget.value.toUpperCase().replace(/[^A-Z0-9 ]/g, "");
  event.currentTarget.setSelectionRange(start, start);
});

document.querySelector("[data-return-back]").addEventListener("click", () => {
  configure.hidden = true;
  verify.hidden = false;
  verify.scrollIntoView({ behavior: "smooth", block: "start" });
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
  button.disabled = true;
  button.textContent = "Trimitem…";
  try {
    await orderApi.requestReturn({
      ...access,
      reason,
      bank_account_holder: configure.elements.bank_account_holder.value.trim(),
      bank_iban: iban,
      items,
      refund_consent: true,
      withdrawal_statement: business ? "" : `Mă retrag din contractul aferent comenzii ${verified.order.order_number}.`,
    });
    configure.hidden = true;
    success.hidden = false;
    success.focus();
  } catch (error) {
    configureError.textContent = error instanceof Error ? error.message : "Solicitarea nu a putut fi trimisă.";
    configureError.focus();
  } finally {
    button.disabled = false;
    button.textContent = business ? "Trimite solicitarea de retur →" : "Confirmă retragerea →";
  }
});

document.querySelectorAll("[data-legal-icon]").forEach(host => {
  host.innerHTML = icon(host.dataset.legalIcon);
});
await initShell();
