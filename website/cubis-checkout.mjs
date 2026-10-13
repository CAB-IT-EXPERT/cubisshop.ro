import { catalogApi, checkoutApi, customerApi, migrateHistoricalStorage, STORAGE_KEYS } from "./cubis-commerce-api.mjs?v=20261013-checkout";
import { commerce, escapeHtml, icon, initShell, money, normalizeProduct, productRoute } from "./cubis-storefront.mjs?v=20261013-checkout";

migrateHistoricalStorage();

const form = document.querySelector("[data-checkout-form]");
const elements = {
  loading: document.querySelector("[data-checkout-loading]"),
  empty: document.querySelector("[data-checkout-empty]"),
  products: document.querySelector("[data-checkout-products]"),
  shippingMethods: document.querySelector("[data-shipping-methods]"),
  paymentMethods: document.querySelector("[data-payment-methods]"),
  savedAddresses: document.querySelector("[data-saved-addresses]"),
  accountNote: document.querySelector("[data-checkout-account-note]"),
  subtotal: document.querySelector("[data-checkout-subtotal]"),
  discountRow: document.querySelector("[data-checkout-discount-row]"),
  discount: document.querySelector("[data-checkout-discount]"),
  promotion: document.querySelector("[data-checkout-promotion]"),
  shipping: document.querySelector("[data-checkout-shipping]"),
  total: document.querySelector("[data-checkout-total]"),
  couponInput: document.querySelector("#checkout-coupon"),
  couponApply: document.querySelector("[data-coupon-apply]"),
  couponStatus: document.querySelector("[data-coupon-status]"),
  error: document.querySelector("[data-checkout-error]"),
  submit: document.querySelector("[data-checkout-submit]"),
  submitLabel: document.querySelector("[data-submit-label]"),
  submitIcon: document.querySelector("[data-submit-icon]"),
  toast: document.querySelector("[data-checkout-toast]"),
};

const state = {
  cart: commerce.cart(),
  rows: [],
  config: null,
  quote: null,
  coupon: "",
  profile: null,
  addresses: [],
  authenticated: false,
  toastTimer: 0,
};

document.querySelector("[data-checkout-hero-lock]").innerHTML = icon("lock");
document.querySelector("[data-checkout-empty-icon]").innerHTML = icon("cart");
document.querySelector("[data-progress-icon]").innerHTML = icon("check");
document.querySelectorAll("[data-section-icon]").forEach(host => { host.innerHTML = icon(host.dataset.sectionIcon); });
document.querySelectorAll("[data-input-icon]").forEach(host => { host.innerHTML = icon(host.dataset.inputIcon); });
document.querySelectorAll("[data-inline-icon]").forEach(host => { host.innerHTML = icon(host.dataset.inlineIcon); });
document.querySelectorAll("[data-assurance-icon]").forEach(host => { host.innerHTML = icon(host.dataset.assuranceIcon); });
document.querySelector("[data-submit-arrow]").innerHTML = icon("arrow");

function readStoredProfile() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.customerProfile) || "null"); }
  catch { return null; }
}

function showToast(message) {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  state.toastTimer = window.setTimeout(() => { elements.toast.hidden = true; }, 3200);
}

function cartQuantity() {
  return state.rows.reduce((sum, row) => sum + row.quantity, 0);
}

function orderItems() {
  return state.rows.filter(row => row.product?.apiId).map(row => ({
    product_id: row.product.apiId,
    quantity: row.quantity,
  }));
}

function localSubtotal() {
  return state.rows.reduce((sum, row) => sum + Number(row.product?.price || 0) * row.quantity, 0);
}

function currentShipping() {
  const selected = form.elements.shipping_method_id?.value;
  return (state.config?.shipping_methods || []).find(method => String(method.id) === String(selected)) || null;
}

function shippingCost(method = currentShipping()) {
  if (!method) return 0;
  const threshold = method.free_above === null || method.free_above === undefined ? null : Number(method.free_above);
  const subtotal = Number(state.quote?.subtotal ?? localSubtotal());
  if (threshold !== null && threshold > 0 && subtotal >= threshold) return 0;
  return Math.max(0, Number(method.cost || 0));
}

function displayShipping(method, index) {
  const unsafeCopy = /\b(?:test|fictiv|diagnostic|g[- ]?trots)\b/i.test(`${method?.name || ""} ${method?.description || ""}`);
  return {
    name: unsafeCopy ? (index === 0 ? "Livrare rapidă" : `Metodă de livrare ${index + 1}`) : String(method?.name || "Livrare prin curier"),
    description: unsafeCopy ? "Curier la adresa indicată" : String(method?.description || method?.eta_label || "Livrare la adresa indicată"),
  };
}

function displayPromotionTitle(value) {
  const title = String(value || "").trim();
  if (!title || /\b(?:test|fictiv|diagnostic|g[- ]?trots)\b/i.test(title)) return "Reducere aplicată";
  return title;
}

function renderProducts() {
  elements.products.innerHTML = state.rows.map(({ id, quantity, product }) => {
    if (!product) return `<article class="cs-checkout-product is-unavailable">
      <span class="cs-checkout-product__image">${icon("info")}<b>${quantity}</b></span>
      <div class="cs-checkout-product__copy"><strong>Produs indisponibil</strong><small>Revino în coș pentru a-l elimina</small></div><strong>—</strong>
    </article>`;
    const image = product.imageUrl
      ? `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" width="132" height="132" loading="eager" decoding="async">`
      : icon("package");
    return `<article class="cs-checkout-product">
      <a class="cs-checkout-product__image" href="${escapeHtml(productRoute(product))}">${image}<b>${quantity}</b></a>
      <div class="cs-checkout-product__copy"><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.categoryName || product.sku || "Produs Cubis Shop")}</small></div>
      <strong>${money(product.price * quantity, product.currency)}</strong>
    </article>`;
  }).join("");
}

function renderShippingMethods() {
  const methods = (state.config?.shipping_methods || []).filter(method => method.is_active !== false);
  if (!methods.length) {
    elements.shippingMethods.innerHTML = `<div class="cs-checkout-choice-error">${icon("info")} Nu există momentan o metodă de livrare activă.</div>`;
    return;
  }
  elements.shippingMethods.innerHTML = methods.map((method, index) => {
    const copy = displayShipping(method, index);
    const cost = shippingCost(method);
    const price = cost <= 0 ? "Gratuit" : money(cost);
    const detail = [copy.description, method.eta_label].filter((value, position, list) => value && list.indexOf(value) === position).join(" · ");
    return `<label class="cs-checkout-choice${methods.length === 1 ? " is-single" : ""}">
      <input type="radio" name="shipping_method_id" value="${escapeHtml(method.id)}" ${index === 0 ? "checked" : ""} required>
      <span class="cs-checkout-choice__box"><i class="cs-checkout-choice__icon">${icon("truck")}</i><span class="cs-checkout-choice__copy"><strong>${escapeHtml(copy.name)}</strong><small>${escapeHtml(detail)}</small></span><b class="cs-checkout-choice__price">${escapeHtml(price)}</b></span>
      <i class="cs-checkout-choice__check">${icon("check")}</i>
    </label>`;
  }).join("");
}

function renderPaymentMethods() {
  const payments = state.config?.payments || {};
  const choices = [];
  if (payments.card_enabled) choices.push({ value: "card", icon: "card", name: "Card online", detail: "Plată rapidă și securizată" });
  if (payments.cash_on_delivery_enabled) choices.push({ value: "cash_on_delivery", icon: "package", name: "Ramburs la curier", detail: "Plătești când primești coletul" });
  if (!choices.length) {
    elements.paymentMethods.innerHTML = `<div class="cs-checkout-choice-error">${icon("info")} Nu există momentan o metodă de plată activă.</div>`;
    updateSubmitButton();
    return;
  }
  elements.paymentMethods.innerHTML = choices.map((choice, index) => `<label class="cs-checkout-choice${choices.length === 1 ? " is-single" : ""}">
    <input type="radio" name="payment_method" value="${choice.value}" ${index === 0 ? "checked" : ""} required>
    <span class="cs-checkout-choice__box"><i class="cs-checkout-choice__icon">${icon(choice.icon)}</i><span class="cs-checkout-choice__copy"><strong>${choice.name}</strong><small>${choice.detail}</small></span></span>
    <i class="cs-checkout-choice__check">${icon("check")}</i>
  </label>`).join("");
  updateSubmitButton();
}

function renderTotals() {
  const subtotal = Number(state.quote?.subtotal ?? localSubtotal());
  const discount = Math.max(0, Number(state.quote?.discount_total || 0));
  const delivery = shippingCost();
  const total = Math.max(0, subtotal - discount + delivery);
  elements.subtotal.textContent = money(subtotal);
  elements.discountRow.hidden = discount <= 0;
  elements.discount.textContent = `−${money(discount)}`;
  elements.promotion.textContent = state.quote?.promotion_title ? displayPromotionTitle(state.quote.promotion_title) : "";
  elements.shipping.textContent = currentShipping() ? (delivery <= 0 ? "Gratuit" : money(delivery)) : "—";
  elements.total.textContent = money(total);
}

function updateSubmitButton() {
  const method = form.elements.payment_method?.value || "";
  const card = method === "card";
  elements.submitLabel.textContent = card ? "Continuă către plata securizată" : "Trimite comanda";
  elements.submitIcon.innerHTML = icon(card ? "card" : "lock");
}

function toggleCompanyFields() {
  const company = form.elements.customer_type?.value === "company";
  const host = document.querySelector("[data-company-fields]");
  host.hidden = !company;
  host.querySelectorAll("input").forEach(input => { input.required = company; });
}

function setFormValue(name, value, { force = false } = {}) {
  const field = form.elements[name];
  if (!field || value === null || value === undefined) return;
  if (force || !String(field.value || "").trim()) field.value = String(value);
}

function applyCustomerData(customer, address = null, { force = false } = {}) {
  if (!customer && !address) return;
  setFormValue("customer_name", address?.recipient_name || customer?.full_name, { force });
  setFormValue("customer_phone", address?.phone || customer?.phone, { force });
  setFormValue("customer_email", customer?.email, { force });
  setFormValue("address", address?.address || customer?.address, { force });
  setFormValue("city", address?.city || customer?.city, { force });
  setFormValue("county", address?.county || customer?.county, { force });
  setFormValue("postal_code", address?.postal_code || customer?.postal_code, { force });
  setFormValue("company_name", customer?.company_name, { force });
  setFormValue("company_cui", customer?.company_cui, { force });
  setFormValue("company_registration_number", customer?.company_registration_number, { force });
  setFormValue("company_address", customer?.company_address, { force });
  if (customer?.customer_type === "company" && form.elements.customer_type) {
    form.elements.customer_type.value = "company";
    toggleCompanyFields();
  }
}

function renderSavedAddresses() {
  if (!state.addresses.length) { elements.savedAddresses.hidden = true; return; }
  elements.savedAddresses.hidden = false;
  elements.savedAddresses.innerHTML = state.addresses.map((address, index) => `<button class="cs-saved-address" type="button" data-saved-address="${index}"><strong>${escapeHtml(address.label || (address.is_default ? "Adresa implicită" : "Adresă salvată"))}</strong><small>${escapeHtml([address.address, address.city].filter(Boolean).join(", "))}</small></button>`).join("");
}

async function loadCustomer() {
  const stored = readStoredProfile();
  state.profile = stored;
  if (stored) applyCustomerData(stored);
  if (!localStorage.getItem(STORAGE_KEYS.customerToken)) return;
  try {
    const [me, addresses] = await Promise.all([
      customerApi.me(),
      customerApi.addresses().catch(() => []),
    ]);
    state.profile = me?.customer || stored;
    state.addresses = Array.isArray(addresses) ? addresses : [];
    state.authenticated = Boolean(me?.customer);
    if (state.profile) {
      localStorage.setItem(STORAGE_KEYS.customerProfile, JSON.stringify(state.profile));
      applyCustomerData(state.profile, state.addresses.find(address => address.is_default) || state.addresses[0]);
    }
    if (state.authenticated) {
      elements.accountNote.classList.add("is-logged-in");
      elements.accountNote.querySelector("strong").textContent = "Date completate din cont";
      elements.accountNote.querySelector("small").textContent = state.profile?.email || "Cont Cubis Shop";
      const link = elements.accountNote.querySelector("a");
      link.textContent = "Contul meu";
      link.href = "/cont";
    }
    renderSavedAddresses();
  } catch {
    // Checkout-ul rămâne disponibil și dacă o sesiune veche nu mai este validă.
  }
}

async function refreshQuote(couponCode = state.coupon) {
  const quote = await checkoutApi.promotionQuote({ items: orderItems(), coupon_code: couponCode });
  state.quote = quote;
  state.coupon = String(quote?.promotion_code || couponCode || "").trim().toUpperCase();
  renderTotals();
  return quote;
}

async function handleCoupon() {
  if (elements.couponApply.disabled) return;
  const removing = Boolean(state.coupon);
  const code = removing ? "" : String(elements.couponInput.value || "").trim().toUpperCase();
  if (!removing && !code) {
    elements.couponStatus.hidden = false;
    elements.couponStatus.className = "is-error";
    elements.couponStatus.textContent = "Introdu un cod înainte de aplicare.";
    elements.couponInput.focus();
    return;
  }
  elements.couponApply.disabled = true;
  elements.couponApply.textContent = removing ? "Eliminăm…" : "Verificăm…";
  elements.couponStatus.hidden = true;
  try {
    const quote = await refreshQuote(code);
    elements.couponInput.value = state.coupon;
    elements.couponApply.textContent = state.coupon ? "Elimină" : "Aplică";
    elements.couponStatus.hidden = false;
    elements.couponStatus.className = "";
    elements.couponStatus.textContent = state.coupon
      ? `${displayPromotionTitle(quote?.promotion_title)} a fost aplicată.`
      : "Codul a fost eliminat.";
  } catch (error) {
    elements.couponStatus.hidden = false;
    elements.couponStatus.className = "is-error";
    elements.couponStatus.textContent = error?.message || "Codul nu a putut fi verificat.";
    elements.couponApply.textContent = state.coupon ? "Elimină" : "Aplică";
  } finally {
    elements.couponApply.disabled = false;
  }
}

function showSubmitError(message) {
  elements.error.textContent = message;
  elements.error.hidden = false;
  elements.error.scrollIntoView({ behavior: "smooth", block: "center" });
}

function orderPayload() {
  const fields = new FormData(form);
  return {
    customer_name: String(fields.get("customer_name") || "").trim(),
    customer_phone: String(fields.get("customer_phone") || "").trim(),
    customer_email: String(fields.get("customer_email") || "").trim(),
    customer_type: String(fields.get("customer_type") || "individual"),
    company_name: String(fields.get("company_name") || "").trim(),
    company_cui: String(fields.get("company_cui") || "").trim(),
    company_registration_number: String(fields.get("company_registration_number") || "").trim(),
    company_address: String(fields.get("company_address") || "").trim(),
    address: String(fields.get("address") || "").trim(),
    city: String(fields.get("city") || "").trim(),
    county: String(fields.get("county") || "").trim(),
    postal_code: String(fields.get("postal_code") || "").trim(),
    customer_notes: String(fields.get("customer_notes") || "").trim(),
    shipping_method_id: String(fields.get("shipping_method_id") || ""),
    payment_method: String(fields.get("payment_method") || ""),
    coupon_code: state.coupon,
    accept_terms: fields.has("accept_terms"),
    newsletter_opt_in: fields.has("newsletter_opt_in"),
    // Stripe acceptă localhost numai în modul TEST; în producție API-ul
    // normalizează strict originea la https://cubisshop.ro.
    return_base_url: location.origin,
    items: orderItems(),
  };
}

form.addEventListener("change", event => {
  if (event.target.name === "customer_type") toggleCompanyFields();
  if (event.target.name === "shipping_method_id") renderTotals();
  if (event.target.name === "payment_method") updateSubmitButton();
  elements.error.hidden = true;
});

elements.savedAddresses.addEventListener("click", event => {
  const button = event.target.closest("[data-saved-address]");
  if (!button) return;
  const address = state.addresses[Number(button.dataset.savedAddress)];
  if (!address) return;
  applyCustomerData(state.profile, address, { force: true });
  showToast(`Am completat ${address.label || "adresa salvată"}.`);
});

elements.couponApply.addEventListener("click", handleCoupon);
elements.couponInput.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); void handleCoupon(); } });

form.addEventListener("submit", async event => {
  event.preventDefault();
  elements.error.hidden = true;
  if (!form.checkValidity()) {
    form.reportValidity();
    form.querySelector(":invalid")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (state.rows.some(row => !row.product)) {
    showSubmitError("Un produs din coș nu mai este disponibil. Revino în coș și elimină-l înainte de comandă.");
    return;
  }
  elements.submit.disabled = true;
  elements.submit.classList.add("is-loading");
  elements.submitLabel.textContent = form.elements.payment_method.value === "card" ? "Pregătim plata…" : "Înregistrăm comanda…";
  try {
    const order = await checkoutApi.createOrder(orderPayload());
    sessionStorage.setItem(STORAGE_KEYS.checkout, JSON.stringify({
      order_number: order?.order_number || "",
      tracking_token: order?.tracking_token || "",
      payment_method: order?.payment_method || "",
      total: order?.total || 0,
    }));
    if (order?.stripe_checkout_url) {
      location.assign(order.stripe_checkout_url);
      return;
    }
    const orderNumber = String(order?.order_number || "").trim();
    const paymentMethod = String(order?.payment_method || form.elements.payment_method.value || "").trim();
    if (paymentMethod !== "cash_on_delivery" || !orderNumber) {
      throw new Error("Comanda a fost înregistrată, dar răspunsul de confirmare este incomplet. Contactează-ne înainte de a retrimite formularul.");
    }
    const resultUrl = new URL("/plata-finalizata", location.origin);
    resultUrl.searchParams.set("comanda", orderNumber);
    resultUrl.searchParams.set("metoda", "cash_on_delivery");
    resultUrl.searchParams.set("status", "cod");
    commerce.clearCart();
    location.assign(`${resultUrl.pathname}${resultUrl.search}`);
  } catch (error) {
    showSubmitError(error?.message || "Comanda nu a putut fi trimisă. Verifică datele și încearcă din nou.");
    elements.submit.disabled = false;
    elements.submit.classList.remove("is-loading");
    updateSubmitButton();
  }
});

async function boot() {
  const shellPromise = initShell({ active: "cart" });
  if (!state.cart.length) {
    await shellPromise;
    elements.loading.hidden = true;
    elements.empty.hidden = false;
    return;
  }
  try {
    const [rawProducts, config] = await Promise.all([
      checkoutApi.products(state.cart.map(row => row.id)),
      catalogApi.config(),
      loadCustomer(),
      shellPromise,
    ]);
    state.config = config || { payments: {}, shipping_methods: [] };
    const products = (Array.isArray(rawProducts) ? rawProducts : []).map(normalizeProduct);
    commerce.registerProducts(products);
    const byId = new Map();
    products.forEach(product => [product.id, product.slug, product.apiId, product.sku].filter(Boolean).forEach(key => byId.set(String(key), product)));
    state.rows = state.cart.map(row => ({ ...row, product: byId.get(row.id) || null }));
    renderProducts();
    renderShippingMethods();
    renderPaymentMethods();
    toggleCompanyFields();
    try { await refreshQuote(""); } catch { renderTotals(); }
    elements.loading.hidden = true;
    form.hidden = false;
    if (state.rows.some(row => !row.product)) showSubmitError("Un produs nu mai este disponibil. Revino în coș pentru a-l elimina.");
  } catch (error) {
    await shellPromise;
    elements.loading.innerHTML = `${icon("info")}<strong>Checkout-ul nu a putut fi încărcat</strong><small>${escapeHtml(error?.message || "Încearcă din nou în câteva momente.")}</small><button type="button" data-checkout-retry>Reîncearcă</button>`;
    elements.loading.querySelector("[data-checkout-retry]")?.addEventListener("click", () => location.reload());
  }
}

void boot();
