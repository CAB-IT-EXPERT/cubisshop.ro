import { orderApi } from "./cubis-commerce-api.mjs?v=20261013-track";
import { escapeHtml, icon, initShell, money } from "./cubis-storefront.mjs?v=20261013-track";

const mainStatuses = [
  { value: "new", label: "Comandă primită", short: "Primită", description: "Am primit comanda și verificăm toate detaliile.", icon: "document" },
  { value: "confirmed", label: "Comandă confirmată", short: "Confirmată", description: "Comanda a fost confirmată și intră în pregătire.", icon: "check" },
  { value: "processing", label: "În pregătire", short: "Pregătire", description: "Produsele sunt pregătite cu atenție pentru expediere.", icon: "package" },
  { value: "shipped", label: "Predată curierului", short: "La curier", description: "Coletul a plecat spre adresa indicată în comandă.", icon: "truck" },
  { value: "completed", label: "Comandă livrată", short: "Livrată", description: "Comanda a ajuns la destinație.", icon: "home" },
];

const exceptionalStatuses = {
  cancelled: { label: "Comandă anulată", description: "Comanda nu mai este procesată.", icon: "close", tone: "danger" },
  return_requested: { label: "Retur solicitat", description: "Solicitarea ta este verificată de echipa noastră.", icon: "rotate", tone: "return" },
  return_refused: { label: "Retur verificat", description: "Solicitarea de retur a fost verificată și refuzată.", icon: "info", tone: "danger" },
  return_confirmed: { label: "Retur confirmat", description: "Returul este confirmat și urmează rambursarea.", icon: "check", tone: "return" },
  refunded: { label: "Comandă rambursată", description: "Returul și rambursarea au fost finalizate.", icon: "rotate", tone: "return" },
};

const form = document.querySelector("[data-track-form]");
const submit = document.querySelector("[data-track-submit]");
const stateHost = document.querySelector("[data-track-state]");
const resultHost = document.querySelector("[data-track-result]");
const cancelModal = document.querySelector("[data-cancel-modal]");
const cancelReason = document.querySelector("[data-cancel-reason]");
const cancelError = document.querySelector("[data-cancel-error]");
const cancelConfirm = document.querySelector("[data-cancel-confirm]");
const returnModal = document.querySelector("[data-return-modal]");
const returnProducts = document.querySelector("[data-return-products]");
const returnReason = document.querySelector("[data-return-reason]");
const returnReasonRequired = document.querySelector("[data-return-required]");
const returnReasonHelp = document.querySelector("[data-return-reason-help]");
const returnHolder = document.querySelector("[data-return-holder]");
const returnIban = document.querySelector("[data-return-iban]");
const returnIbanHelp = document.querySelector("[data-return-iban-help]");
const returnConsent = document.querySelector("[data-return-consent]");
const returnDeadline = document.querySelector("[data-return-deadline]");
const returnCost = document.querySelector("[data-return-cost]");
const returnRefund = document.querySelector("[data-return-refund]");
const returnCourierLabel = document.querySelector("[data-return-courier-label]");
const returnError = document.querySelector("[data-return-error]");
const returnConfirm = document.querySelector("[data-return-confirm]");
const params = new URLSearchParams(location.search);
const localPreview = /^(localhost|127\.0\.0\.1)$/i.test(location.hostname) && params.get("preview") === "1";
const cancellationIntent = params.get("anulare") === "1";
const returnIntent = params.get("retur") === "1";

let activeAccess = null;
let activeOrder = null;
let lastFocusedElement = null;

const shellReady = initShell({ active: "track" });
if (localPreview) {
  void shellReady.then(() => document.querySelector('[data-cookie-choice="reject"]')?.click());
}

document.querySelectorAll("[data-track-icon]").forEach(host => {
  host.innerHTML = icon(host.dataset.trackIcon);
});

function parseDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateTime(value, fallback = "—") {
  const parsed = parseDate(value);
  return parsed ? parsed.toLocaleString("ro-RO", { dateStyle: "medium", timeStyle: "short" }) : fallback;
}

function dateOnly(value, fallback = "—") {
  const parsed = parseDate(value);
  return parsed ? parsed.toLocaleDateString("ro-RO", { dateStyle: "long" }) : fallback;
}

function statusIndex(order) {
  if (["return_requested", "return_refused", "return_confirmed", "refunded"].includes(order.status)) return mainStatuses.length - 1;
  return mainStatuses.findIndex(status => status.value === order.status);
}

function historyEntry(order, value) {
  return [...(Array.isArray(order.status_history) ? order.status_history : [])]
    .reverse()
    .find(entry => entry.to_status === value);
}

function currentMeta(order) {
  return exceptionalStatuses[order.status]
    || mainStatuses.find(status => status.value === order.status)
    || mainStatuses[0];
}

function paymentLabel(order) {
  if (order.payment_method === "card") return order.payment_status === "paid" ? "Card online · achitată" : "Card online";
  return "Ramburs la curier";
}

function showState(kind, title, message) {
  document.body.classList.remove("has-tracked-order");
  resultHost.hidden = true;
  stateHost.hidden = false;
  stateHost.className = `cs-track-state is-${kind}`;
  stateHost.innerHTML = `<span>${kind === "loading" ? '<i class="cs-track-spinner"></i>' : icon("info")}</span><div><small>${kind === "loading" ? "Verificare securizată" : "Nu am putut deschide comanda"}</small><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p></div>${kind === "error" ? '<button type="button" data-state-retry>Încearcă din nou</button>' : ""}`;
  stateHost.querySelector("[data-state-retry]")?.addEventListener("click", () => {
    stateHost.hidden = true;
    document.querySelector(".cs-track-hero")?.scrollIntoView({ behavior: "smooth", block: "start" });
    form?.elements.order_number?.focus();
  });
}

function productRows(order) {
  return (Array.isArray(order.items) ? order.items : []).map(item => {
    const quantity = Math.max(1, Number(item.quantity || 1));
    const discounted = Number(item.discount_total || 0) > 0;
    const unit = Number(discounted ? item.discounted_unit_price : item.unit_price || 0);
    const total = Number(discounted ? item.discounted_line_total : item.line_total || unit * quantity);
    return `<article class="cs-track-product">
      <span class="cs-track-product__media">${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.product_name || "Produs")}" loading="lazy">` : icon("package")}</span>
      <div><small>${escapeHtml(item.product_sku || "Produs Cubis Shop")}</small><h3>${escapeHtml(item.product_name || "Produs")}</h3><p><b>${quantity} buc.</b><span>× ${money(unit, order.currency || "RON")}</span></p></div>
      <strong>${money(total, order.currency || "RON")}</strong>
    </article>`;
  }).join("") || '<p class="cs-track-empty-products">Produsele comenzii nu sunt disponibile pentru afișare.</p>';
}

function progressTimeline(order) {
  const current = statusIndex(order);
  const cancelled = order.status === "cancelled";
  const history = Array.isArray(order.status_history) ? order.status_history : [];
  const historyValues = new Set(history.map(entry => entry.to_status));
  return mainStatuses.map((status, index) => {
    const entry = historyEntry(order, status.value);
    const reached = historyValues.has(status.value) || (!cancelled && current >= index);
    const active = !exceptionalStatuses[order.status] && order.status === status.value;
    return `<li class="${reached ? "is-reached" : ""} ${active ? "is-current" : ""}">
      <span>${icon(reached ? "check" : status.icon)}</span>
      <div><small>${active ? "ACUM" : reached ? "FINALIZAT" : `PASUL ${String(index + 1).padStart(2, "0")}`}</small><strong>${escapeHtml(status.short)}</strong>${entry ? `<time>${escapeHtml(dateTime(entry.created_at))}</time>` : ""}</div>
    </li>`;
  }).join("");
}

function specialStatus(order) {
  const special = exceptionalStatuses[order.status];
  if (!special) return "";
  const entry = historyEntry(order, order.status);
  let extra = "";
  if (order.status === "cancelled" && order.cancellation_reason) {
    extra = `<p><b>Motiv:</b> ${escapeHtml(order.cancellation_reason)}</p>${order.refund_status === "pending" ? `<p>Rambursarea pe card este în curs${order.refund_due_at ? `, cu termen până la ${escapeHtml(dateOnly(order.refund_due_at))}` : ""}.</p>` : ""}`;
  }
  if (["return_requested", "return_refused", "return_confirmed", "refunded"].includes(order.status) && order.return_reason) {
    extra = `<p><b>Detalii retur:</b> ${escapeHtml(order.return_reason)}</p>${order.return_refund_amount !== null && order.return_refund_amount !== undefined ? `<p>Estimare restituire: <strong>${money(order.return_refund_amount, order.currency)}</strong></p>` : ""}`;
  }
  return `<section class="cs-track-special is-${special.tone}"><span>${icon(special.icon)}</span><div><small>Status special</small><h3>${escapeHtml(special.label)}</h3><p>${escapeHtml(special.description)}</p>${extra}${entry ? `<time>${escapeHtml(dateTime(entry.created_at))}</time>` : ""}</div></section>`;
}

function renderOrder(order) {
  activeOrder = order;
  const meta = currentMeta(order);
  const current = Math.max(0, statusIndex(order));
  const progress = order.status === "cancelled" ? 0 : Math.round(((current + 1) / mainStatuses.length) * 100);
  const discount = Math.max(0, Number(order.discount_total || 0));
  const shippingAddress = [order.address, order.city, order.county, order.postal_code].filter(Boolean).join(", ");
  const displayName = order.customer_display_name || order.company_name || order.customer_name || "Client Cubis Shop";
  const returnNotice = order.can_request_return ? '<span class="is-returnable">Eligibilă pentru retur</span>' : "";

  resultHost.innerHTML = `<div class="cs-track-dashboard">
    <header class="cs-track-overview">
      <div class="cs-track-overview__icon">${icon(meta.icon)}</div>
      <div class="cs-track-overview__copy"><small>Comanda <b>${escapeHtml(order.order_number)}</b></small><h1>${escapeHtml(meta.label)}</h1><p>${escapeHtml(meta.description)}</p></div>
      <div class="cs-track-overview__meta"><span><i></i>${escapeHtml(order.status_label || meta.label)}</span><small>Actualizată ${escapeHtml(dateTime(order.updated_at, "acum"))}</small><button type="button" data-track-another>${icon("search")}Altă comandă</button></div>
    </header>

    <section class="cs-track-progress-card" aria-labelledby="track-progress-title">
      <header><div><small>Parcursul comenzii</small><h2 id="track-progress-title">De la noi, până la tine</h2></div><span><b>${progress}%</b> parcurs</span></header>
      <div class="cs-track-progress-bar" aria-hidden="true"><i style="--track-progress:${progress}%"></i></div>
      <ol>${progressTimeline(order)}</ol>
      ${specialStatus(order)}
    </section>

    <div class="cs-track-content-grid">
      <section class="cs-track-order-card">
        <header><div><small>Rezumat comandă</small><h2>Produsele tale</h2></div><span>${Number(order.items?.length || 0)} ${Number(order.items?.length || 0) === 1 ? "produs" : "produse"}</span></header>
        <div class="cs-track-products">${productRows(order)}</div>
        <div class="cs-track-totals">
          <p><span>Subtotal</span><b>${money(order.subtotal, order.currency)}</b></p>
          ${discount > 0 ? `<p class="is-discount"><span>Reducere${order.promotion_code ? ` · ${escapeHtml(order.promotion_code)}` : ""}</span><b>−${money(discount, order.currency)}</b></p>` : ""}
          <p><span>Livrare · ${escapeHtml(order.shipping_method_name || "Curier")}</span><b>${Number(order.shipping_cost || 0) > 0 ? money(order.shipping_cost, order.currency) : "Gratuită"}</b></p>
          <p class="is-total"><span>Total${order.vat_payer ? " · TVA inclus" : ""}</span><strong>${money(order.total, order.currency)}</strong></p>
        </div>
      </section>

      <aside class="cs-track-side">
        <section class="cs-track-info-card">
          <header><span>${icon("truck")}</span><div><small>Livrare</small><h2>Unde ajunge</h2></div></header>
          <dl><div><dt>Destinatar</dt><dd>${escapeHtml(displayName)}</dd></div><div><dt>Adresă</dt><dd>${escapeHtml(shippingAddress || "Adresă indisponibilă")}</dd></div><div><dt>Telefon</dt><dd>${escapeHtml(order.customer_phone || "—")}</dd></div></dl>
        </section>
        <section class="cs-track-info-card">
          <header><span>${icon("card")}</span><div><small>Plată</small><h2>${escapeHtml(paymentLabel(order))}</h2></div></header>
          <dl><div><dt>Data comenzii</dt><dd>${escapeHtml(dateTime(order.created_at))}</dd></div><div><dt>Total</dt><dd>${money(order.total, order.currency)}</dd></div></dl>
          ${returnNotice}
        </section>
        <section class="cs-track-help-card"><span>${icon("headset")}</span><div><small>Ai nevoie de ajutor?</small><h2>Suntem aici pentru tine.</h2><p>Îți răspundem la întrebări despre comandă și livrare.</p><a href="/contact">Contactează-ne ${icon("arrow")}</a></div></section>
      </aside>
    </div>

    <section class="cs-track-actions" ${!order.can_cancel && !order.can_request_return ? "hidden" : ""}>
      <div><small>Ai nevoie de o modificare?</small><h2>Gestionează comanda</h2><p>Opțiunile sunt afișate numai atunci când starea comenzii le permite.</p></div>
      <div>${order.can_request_return ? `<button class="is-return" type="button" data-open-return>${icon("rotate")}Solicită returul</button>` : ""}${order.can_cancel ? `<button class="is-cancel" type="button" data-open-cancel>${icon("close")}Anulează comanda</button>` : ""}</div>
    </section>
  </div>`;

  resultHost.querySelectorAll(".cs-track-product img").forEach(image => image.addEventListener("error", () => {
    image.closest(".cs-track-product__media").innerHTML = icon("package");
  }, { once: true }));
  resultHost.querySelector("[data-track-another]")?.addEventListener("click", showSearch);
  resultHost.querySelector("[data-open-cancel]")?.addEventListener("click", openCancellation);
  resultHost.querySelector("[data-open-return]")?.addEventListener("click", openReturn);

  stateHost.hidden = true;
  resultHost.hidden = false;
  document.body.classList.add("has-tracked-order");
  requestAnimationFrame(() => window.scrollTo({ top: Math.max(0, resultHost.offsetTop - 20), behavior: "smooth" }));
  if (cancellationIntent && order.can_cancel) setTimeout(openCancellation, 260);
  if (returnIntent && order.can_request_return) setTimeout(openReturn, 260);
}

function showSearch() {
  document.body.classList.remove("has-tracked-order");
  resultHost.hidden = true;
  stateHost.hidden = true;
  activeAccess = null;
  activeOrder = null;
  history.replaceState({}, "", location.pathname);
  document.querySelector(".cs-track-hero")?.scrollIntoView({ behavior: "smooth", block: "start" });
  setTimeout(() => form?.elements.order_number?.focus(), 250);
}

async function loadOrder(query, access) {
  activeAccess = access;
  submit.disabled = true;
  showState("loading", "Verificăm comanda…", "Conectăm în siguranță informațiile tale cu datele magazinului.");
  try {
    const order = localPreview ? previewOrder() : await orderApi.track(query);
    renderOrder(order);
  } catch (error) {
    showState("error", "Comanda nu a fost găsită", error?.message || "Verifică datele și încearcă din nou.");
  } finally {
    submit.disabled = false;
  }
}

function previewOrder() {
  const requested = String(params.get("status") || "shipped");
  const allowed = [...mainStatuses.map(item => item.value), ...Object.keys(exceptionalStatuses)];
  const status = allowed.includes(requested) ? requested : "shipped";
  const current = statusIndex({ status });
  const completedMain = status === "cancelled" ? 1 : Math.max(0, current);
  const history = mainStatuses.slice(0, completedMain + 1).map((item, index) => ({ to_status: item.value, created_at: `2026-10-${String(10 + index).padStart(2, "0")} ${String(9 + index).padStart(2, "0")}:15:00` }));
  if (exceptionalStatuses[status]) history.push({ to_status: status, created_at: "2026-10-13 14:35:00" });
  return {
    order_number: "CS-20261013-48BCA417", status, status_label: exceptionalStatuses[status]?.label || mainStatuses.find(item => item.value === status)?.label,
    payment_status: "paid", payment_method: "card", can_cancel: ["new", "confirmed", "processing"].includes(status), can_request_return: status === "completed",
    return_eligibility: status === "completed" ? { eligible: true, policy_type: "b2c_legal", days_remaining: 12, deadline_at: "2026-10-25 23:59:59", initial_shipping_refundable: true } : {},
    cancellation_reason: status === "cancelled" ? "Comanda a fost plasată din greșeală." : "", refund_status: status === "cancelled" ? "pending" : "none", refund_due_at: "2026-10-28",
    return_reason: status.startsWith("return_") || status === "refunded" ? "Produsul nu corespunde nevoilor mele." : "", return_refund_amount: 112.91,
    configured_return_shipping_cost: 19.99, customer_name: "Alexie Popescu", customer_display_name: "Alexie Popescu", customer_contact_name: "Alexie Popescu",
    customer_phone: "+40 726 285 155", customer_type: "individual", address: "Intrarea Humulești 6A", city: "București", county: "București", postal_code: "050000",
    shipping_method_name: "Livrare rapidă", subtotal: 119.90, discount_total: 11.99, promotion_code: "CUBIS10", promotion_scope: "order", shipping_cost: 5, total: 112.91, vat_payer: true, currency: "RON",
    items: [{ order_item_id: "demo-1", product_name: "Termos inox Trek 750 ml", product_sku: "CUBIS-DEMO-021", quantity: 1, unit_price: 119.90, line_total: 119.90, discount_total: 11.99, discounted_unit_price: 107.91, discounted_line_total: 107.91, image_url: "" }],
    status_history: history, created_at: "2026-10-10 09:15:00", updated_at: "2026-10-13 14:35:00",
  };
}

function openModal(modal, focusTarget) {
  lastFocusedElement = document.activeElement;
  modal.hidden = false;
  document.body.classList.add("cs-track-modal-open");
  requestAnimationFrame(() => modal.classList.add("is-visible"));
  setTimeout(() => focusTarget?.focus(), 100);
}

function closeModal(modal) {
  if (modal.querySelector("button:disabled")) return;
  modal.classList.remove("is-visible");
  setTimeout(() => {
    modal.hidden = true;
    if (cancelModal.hidden && returnModal.hidden) document.body.classList.remove("cs-track-modal-open");
    lastFocusedElement?.focus?.();
  }, 220);
}

function openCancellation() {
  if (!activeOrder?.can_cancel || !activeAccess) return;
  cancelReason.value = "";
  cancelError.textContent = "";
  openModal(cancelModal, cancelReason);
}

async function submitCancellation() {
  const reason = cancelReason.value.trim();
  if (reason.length < 3) {
    cancelError.textContent = "Scrie un motiv de cel puțin 3 caractere.";
    cancelReason.focus();
    return;
  }
  cancelError.textContent = "";
  cancelConfirm.disabled = true;
  cancelConfirm.textContent = "Se anulează…";
  try {
    const result = await orderApi.cancel({ ...activeAccess, reason });
    cancelModal.hidden = true;
    cancelModal.classList.remove("is-visible");
    document.body.classList.remove("cs-track-modal-open");
    renderOrder(result.order);
  } catch (error) {
    cancelError.textContent = error?.message || "Comanda nu a putut fi anulată.";
  } finally {
    cancelConfirm.disabled = false;
    cancelConfirm.textContent = "Confirmă anularea";
  }
}

function normalizeIban(value) {
  return String(value || "").toUpperCase().replace(/\s+/g, "");
}

function validIban(value) {
  const iban = normalizeIban(value);
  if (iban.length < 15 || iban.length > 34 || !/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(iban)) return false;
  if (iban.startsWith("RO") && iban.length !== 24) return false;
  const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`;
  let remainder = 0;
  for (const character of rearranged) {
    const digits = /[A-Z]/.test(character) ? String(character.charCodeAt(0) - 55) : character;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

function validateIban(showEmpty = false) {
  const iban = normalizeIban(returnIban.value);
  const valid = validIban(iban);
  const invalid = Boolean(iban || showEmpty) && !valid;
  returnIban.classList.toggle("is-valid", valid);
  returnIban.classList.toggle("is-invalid", invalid);
  returnIban.setAttribute("aria-invalid", String(invalid));
  returnIbanHelp.textContent = valid ? "IBAN valid." : invalid ? "Introdu un IBAN valid, inclusiv cifrele de control." : "IBAN-ul este verificat înainte de trimitere.";
  returnIbanHelp.className = valid ? "is-valid" : invalid ? "is-invalid" : "";
  return valid;
}

function selectedReturnItems() {
  return [...returnProducts.querySelectorAll("[data-return-product]")].filter(row => row.querySelector("input").checked).map(row => ({
    order_item_id: row.dataset.returnProduct,
    quantity: Number(row.querySelector("select").value || 1),
  }));
}

function updateReturnEstimate() {
  const selections = selectedReturnItems();
  let selectedValue = 0;
  let fullReturn = selections.length === Number(activeOrder?.items?.length || 0);
  for (const selection of selections) {
    const item = activeOrder.items.find(candidate => String(candidate.order_item_id) === selection.order_item_id);
    if (!item) continue;
    if (selection.quantity !== Number(item.quantity || 0)) fullReturn = false;
    selectedValue += Number(item.discounted_unit_price || item.unit_price || 0) * selection.quantity;
  }
  const initialShipping = fullReturn && activeOrder?.return_eligibility?.initial_shipping_refundable ? Number(activeOrder.shipping_cost || 0) : 0;
  const directCost = Number(activeOrder?.configured_return_shipping_cost || 0);
  returnRefund.textContent = money(Math.max(0, selectedValue + initialShipping - directCost), activeOrder.currency);
}

function openReturn() {
  if (!activeOrder?.can_request_return || !activeAccess) return;
  const eligibility = activeOrder.return_eligibility || {};
  const business = eligibility.policy_type === "b2b_commercial";
  returnReason.value = "";
  returnHolder.value = activeOrder.customer_contact_name || activeOrder.customer_name || "";
  returnIban.value = "";
  returnConsent.checked = false;
  returnError.textContent = "";
  returnReasonRequired.hidden = !business;
  returnReasonHelp.textContent = business ? "Pentru returul comercial PJ, motivul este necesar verificării." : "Pentru retragerea PF motivul este opțional.";
  returnConfirm.textContent = business ? "Trimite solicitarea" : "Confirmă retragerea";
  returnDeadline.innerHTML = `<span>${icon(business ? "package" : "shield")}</span><div><small>${business ? "Retur comercial PJ" : "Drept de retragere PF"}</small><strong>${eligibility.deadline_at ? `Disponibil până la ${escapeHtml(dateOnly(eligibility.deadline_at))}` : "Termen verificat automat"}</strong>${Number.isFinite(Number(eligibility.days_remaining)) ? `<p>${Number(eligibility.days_remaining)} zile rămase</p>` : ""}</div>`;
  returnProducts.innerHTML = (activeOrder.items || []).map(item => `<label data-return-product="${escapeHtml(item.order_item_id)}"><input type="checkbox" checked><span class="cs-track-return-product__media">${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="">` : icon("package")}</span><span><strong>${escapeHtml(item.product_name)}</strong><small>${money(item.discounted_unit_price || item.unit_price, activeOrder.currency)} / buc.</small></span><select aria-label="Cantitate pentru ${escapeHtml(item.product_name)}">${Array.from({ length: Number(item.quantity || 1) }, (_, index) => `<option value="${index + 1}">${index + 1} din ${Number(item.quantity || 1)}</option>`).join("")}</select></label>`).join("");
  returnProducts.querySelectorAll("input, select").forEach(control => control.addEventListener("change", updateReturnEstimate));
  returnCourierLabel.textContent = activeOrder.shipping_method_name ? `Retur prin ${activeOrder.shipping_method_name}` : "Cost retur curier";
  returnCost.textContent = money(activeOrder.configured_return_shipping_cost || 0, activeOrder.currency);
  validateIban(false);
  updateReturnEstimate();
  openModal(returnModal, returnProducts.querySelector("input"));
}

async function submitReturn() {
  const business = activeOrder?.return_eligibility?.policy_type === "b2b_commercial";
  const reason = returnReason.value.trim() || (business ? "" : "Retragere fără motiv declarat");
  const holder = returnHolder.value.trim();
  const iban = normalizeIban(returnIban.value);
  const items = selectedReturnItems();
  if (business && reason.length < 3) returnError.textContent = "Completează motivul returului.";
  else if (holder.length < 3) returnError.textContent = "Completează titularul contului.";
  else if (!validateIban(true)) returnError.textContent = "IBAN-ul introdus nu este valid.";
  else if (!items.length) returnError.textContent = "Selectează cel puțin un produs.";
  else if (!returnConsent.checked) returnError.textContent = "Confirmă acordul pentru rambursare.";
  else returnError.textContent = "";
  if (returnError.textContent) return;

  returnConfirm.disabled = true;
  returnConfirm.textContent = "Se trimite…";
  try {
    const result = await orderApi.requestReturn({ ...activeAccess, reason, bank_account_holder: holder, bank_iban: iban, items, refund_consent: true, withdrawal_statement: business ? "" : `Mă retrag din contractul aferent comenzii ${activeOrder.order_number}.` });
    returnModal.hidden = true;
    returnModal.classList.remove("is-visible");
    document.body.classList.remove("cs-track-modal-open");
    renderOrder(result.order);
  } catch (error) {
    returnError.textContent = error?.message || "Solicitarea nu a putut fi trimisă.";
  } finally {
    returnConfirm.disabled = false;
    returnConfirm.textContent = business ? "Trimite solicitarea" : "Confirmă retragerea";
  }
}

form?.elements.order_number?.addEventListener("input", event => {
  const cursor = event.target.selectionStart;
  event.target.value = event.target.value.toUpperCase();
  event.target.setSelectionRange(cursor, cursor);
});

form?.addEventListener("submit", event => {
  event.preventDefault();
  form.dataset.submitted = "true";
  const orderNumber = form.elements.order_number.value.trim().toUpperCase();
  const email = form.elements.email.value.trim().toLowerCase();
  form.querySelectorAll(".cs-track-field").forEach(field => {
    const control = field.querySelector("input");
    const error = field.querySelector("[data-track-error]");
    field.classList.toggle("is-invalid", !control.validity.valid);
    error.textContent = control.validity.valid ? "" : control.type === "email" ? "Introdu o adresă de email validă." : "Completează acest câmp.";
  });
  if (!orderNumber || !form.elements.email.validity.valid) return;
  void loadOrder({ order_number: orderNumber, email }, { order_number: orderNumber, email });
});

form?.querySelectorAll("input").forEach(input => input.addEventListener("input", () => {
  if (form.dataset.submitted !== "true") return;
  const field = input.closest(".cs-track-field");
  field?.classList.toggle("is-invalid", !input.validity.valid);
  const error = field?.querySelector("[data-track-error]");
  if (error && input.validity.valid) error.textContent = "";
}));

cancelModal.querySelectorAll("[data-cancel-close]").forEach(button => button.addEventListener("click", () => closeModal(cancelModal)));
cancelConfirm.addEventListener("click", () => void submitCancellation());
returnModal.querySelectorAll("[data-return-close]").forEach(button => button.addEventListener("click", () => closeModal(returnModal)));
returnConfirm.addEventListener("click", () => void submitReturn());
returnIban.addEventListener("input", () => {
  const cursor = returnIban.selectionStart;
  returnIban.value = returnIban.value.toUpperCase().replace(/[^A-Z0-9 ]/g, "");
  returnIban.setSelectionRange(cursor, cursor);
  validateIban(false);
});
returnIban.addEventListener("blur", () => validateIban(Boolean(normalizeIban(returnIban.value))));

document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  if (!returnModal.hidden) closeModal(returnModal);
  else if (!cancelModal.hidden) closeModal(cancelModal);
});

const token = String(params.get("token") || "").trim();
if (localPreview) {
  void loadOrder({}, { token: "preview" });
} else if (token) {
  void loadOrder({ token }, { token });
}
