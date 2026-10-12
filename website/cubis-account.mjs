import { customerApi, migrateHistoricalStorage, STORAGE_KEYS } from "./cubis-commerce-api.mjs";
import { escapeHtml, icon, initShell, money } from "./cubis-storefront.mjs?v=20261012-account";

migrateHistoricalStorage();

const app = document.querySelector("[data-account-app]");
const errorBox = document.querySelector("[data-account-error]");
const profileForm = document.querySelector("[data-account-profile-form]");
let state = { customer: null, orders: [], addresses: [], coupons: [] };

const customIcons = {
  logout: '<path d="M10 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h5"></path><path d="m16 17 5-5-5-5M21 12H9"></path>',
  tag: '<path d="M20.5 13.5 13.5 20.5a2.1 2.1 0 0 1-3 0l-7-7a2.1 2.1 0 0 1 0-3L10.5 3.5H20.5v10Z"></path><circle cx="16" cy="8" r="1"></circle>',
};

function accountIcon(name) {
  if (!customIcons[name]) return icon(name);
  return `<svg class="cs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${customIcons[name]}</svg>`;
}

document.querySelectorAll("[data-account-icon]").forEach(host => { host.innerHTML = accountIcon(host.dataset.accountIcon); });
document.querySelector("[data-account-avatar]").innerHTML = accountIcon("user");

function clearSession() {
  localStorage.removeItem(STORAGE_KEYS.customerToken);
  localStorage.removeItem(STORAGE_KEYS.customerProfile);
  document.dispatchEvent(new CustomEvent("cubis:customer-changed", { detail: null }));
}

function loginUrl() {
  return `/login?redirect=${encodeURIComponent(`${location.pathname}${location.search}${location.hash}`)}`;
}

function redirectToLogin() {
  location.replace(loginUrl());
}

function firstName(customer) {
  return String(customer?.full_name || "client").trim().split(/\s+/)[0] || "client";
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(date.valueOf()) ? "" : new Intl.DateTimeFormat("ro-RO", { day: "2-digit", month: "long", year: "numeric" }).format(date);
}

function emptyState(iconName, title, copy, link = "") {
  return `<div class="cs-account-empty"><i>${accountIcon(iconName)}</i><strong>${escapeHtml(title)}</strong><p>${escapeHtml(copy)}</p>${link ? `<a href="${link}">Descoperă produsele →</a>` : ""}</div>`;
}

function showTab(name, { updateHash = true } = {}) {
  const target = document.querySelector(`[data-account-panel="${CSS.escape(name)}"]`) ? name : "overview";
  document.querySelectorAll("[data-account-tab]").forEach(button => {
    const active = button.dataset.accountTab === target;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-account-panel]").forEach(panel => {
    const active = panel.dataset.accountPanel === target;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
  if (updateHash) history.replaceState(null, "", target === "overview" ? location.pathname : `#${target}`);
  if (matchMedia("(max-width: 900px)").matches) document.querySelector(".cs-account-content")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderProfile() {
  const customer = state.customer || {};
  document.querySelector("[data-account-first-name]").textContent = `${firstName(customer)}!`;
  document.querySelector("[data-account-email]").textContent = customer.email || "Cont Cubis Shop";
  const fields = ["full_name", "phone", "address", "city", "county", "postal_code", "company_name", "company_cui", "company_registration_number", "company_address"];
  fields.forEach(name => { if (profileForm?.elements[name]) profileForm.elements[name].value = customer[name] || ""; });
  const type = customer.customer_type === "company" ? "company" : "individual";
  if (profileForm?.elements.customer_type) profileForm.elements.customer_type.value = type;
  toggleCompanyFields(type);
}

function renderOverview() {
  const orders = state.orders;
  const activeStatuses = new Set(["new", "pending", "confirmed", "processing", "shipped"]);
  const active = orders.filter(order => activeStatuses.has(String(order.status || "").toLowerCase())).length;
  const value = orders.filter(order => !["cancelled", "refunded"].includes(String(order.status || "").toLowerCase())).reduce((sum, order) => sum + Number(order.total || 0), 0);
  document.querySelector("[data-stat-orders]").textContent = String(orders.length);
  document.querySelector("[data-stat-active]").textContent = String(active);
  document.querySelector("[data-stat-value]").textContent = money(value);
  const latest = document.querySelector("[data-account-latest]");
  if (!orders.length) latest.innerHTML = emptyState("document", "Prima comandă va apărea aici", "Catalogul Cubis Shop te așteaptă.", "/magazin");
  else {
    const order = orders[0];
    latest.innerHTML = `<div class="cs-order-card"><i>${accountIcon("package")}</i><div><h3>Comanda ${escapeHtml(order.order_number || "")}</h3><p>${escapeHtml(order.status_label || "Status în curs")} · ${escapeHtml(formatDate(order.created_at))}</p></div><strong>${money(order.total, order.currency)}</strong><a href="${escapeHtml(order.tracking_url || "/urmarire-comanda")}">Vezi statusul</a></div>`;
  }
}

function renderOrders() {
  const host = document.querySelector("[data-account-orders]");
  if (!state.orders.length) {
    host.innerHTML = emptyState("document", "Nu ai încă nicio comandă", "Produsele comandate cu acest e-mail vor apărea aici.", "/magazin");
    return;
  }
  host.innerHTML = state.orders.map(order => `<article class="cs-order-card"><i>${accountIcon("package")}</i><div><h3>Comanda ${escapeHtml(order.order_number || "")}</h3><p>${escapeHtml(order.status_label || "Status în curs")} · ${escapeHtml(formatDate(order.created_at))} · ${Number(order.items?.length || 0)} produse</p></div><strong>${money(order.total, order.currency)}</strong><a href="${escapeHtml(order.tracking_url || "/urmarire-comanda")}">Urmărește</a></article>`).join("");
}

function renderAddresses() {
  const host = document.querySelector("[data-account-addresses]");
  if (!state.addresses.length) {
    host.innerHTML = emptyState("home", "Nu ai adrese salvate", "Completează datele personale pentru un checkout mai rapid.");
    return;
  }
  host.innerHTML = state.addresses.map(address => `<article class="cs-address-card">${address.is_default ? "<b>Implicită</b>" : ""}<h3>${escapeHtml(address.label || "Adresă")}</h3><p><strong>${escapeHtml(address.recipient_name || "")}</strong></p><p>${escapeHtml(address.address || "")}</p><p>${escapeHtml([address.city,address.county,address.postal_code].filter(Boolean).join(", "))}</p><p>${escapeHtml(address.phone || "")}</p></article>`).join("");
}

const addressDialog = document.querySelector("[data-address-dialog]");
const addressForm = document.querySelector("[data-address-form]");

function openAddressDialog() {
  const customer = state.customer || {};
  addressForm.reset();
  addressForm.elements.label.value = "Acasă";
  addressForm.elements.recipient_name.value = customer.full_name || "";
  addressForm.elements.phone.value = customer.phone || "";
  addressForm.elements.address.value = customer.address || "";
  addressForm.elements.city.value = customer.city || "";
  addressForm.elements.county.value = customer.county || "";
  addressForm.elements.postal_code.value = customer.postal_code || "";
  const status = document.querySelector("[data-address-status]");
  status.hidden = true;
  addressDialog.showModal();
}

document.querySelector("[data-address-open]")?.addEventListener("click", openAddressDialog);
document.querySelectorAll("[data-address-close]").forEach(button => button.addEventListener("click", () => addressDialog.close()));
addressDialog?.addEventListener("click", event => { if (event.target === addressDialog) addressDialog.close(); });
addressForm?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!addressForm.reportValidity()) return;
  const submit = addressForm.querySelector("button[type='submit']");
  const status = document.querySelector("[data-address-status]");
  const formData = new FormData(addressForm);
  const payload = Object.fromEntries(formData);
  payload.is_default = formData.has("is_default");
  submit.disabled = true;
  status.hidden = false;
  status.className = "cs-profile-status";
  status.textContent = "Salvăm adresa…";
  try {
    const saved = await customerApi.createAddress(payload);
    state.addresses = [saved, ...state.addresses.filter(address => address.id !== saved.id)].map(address => ({ ...address, is_default: saved.is_default ? address.id === saved.id : address.is_default }));
    renderAddresses();
    renderCounts();
    addressDialog.close();
  } catch (error) {
    status.classList.add("is-error");
    status.textContent = error?.message || "Adresa nu a putut fi salvată.";
  } finally {
    submit.disabled = false;
  }
});

function discountLabel(coupon) {
  const amount = Number(coupon.discount_value || 0);
  return coupon.discount_type === "percent" ? `${amount}% reducere` : `${money(amount)} reducere`;
}

function renderCoupons() {
  const host = document.querySelector("[data-account-coupons]");
  if (!state.coupons.length) {
    host.innerHTML = emptyState("tag", "Nu ai reduceri active acum", "Când apare o ofertă pentru contul tău, o vei găsi aici cu toate condițiile explicate.", "/magazin");
    return;
  }
  host.innerHTML = state.coupons.map(coupon => `<article class="cs-coupon-card"><code>${escapeHtml(coupon.code || "OFERTĂ")}</code><h3>${escapeHtml(coupon.title || discountLabel(coupon))}</h3><p><strong>${escapeHtml(discountLabel(coupon))}</strong></p><p>${escapeHtml(coupon.description || "Disponibilă pentru cumpărăturile eligibile.")}</p>${coupon.valid_until ? `<p>Valabilă până la ${escapeHtml(formatDate(coupon.valid_until))}</p>` : ""}</article>`).join("");
}

function renderCounts() {
  const counts = { orders: state.orders.length, addresses: state.addresses.length, coupons: state.coupons.length };
  Object.entries(counts).forEach(([name, value]) => {
    const badge = document.querySelector(`[data-account-count="${name}"]`);
    if (!badge) return;
    badge.textContent = value > 99 ? "99+" : String(value);
    badge.hidden = value <= 0;
  });
}

function toggleCompanyFields(type) {
  const company = type === "company";
  const host = document.querySelector("[data-company-fields]");
  if (!host) return;
  host.hidden = !company;
  host.querySelectorAll("input").forEach(input => { input.required = company; });
}

document.querySelectorAll("[data-account-tab]").forEach(button => button.addEventListener("click", () => showTab(button.dataset.accountTab)));
document.querySelectorAll("[data-account-jump]").forEach(button => button.addEventListener("click", () => showTab(button.dataset.accountJump)));
profileForm?.elements.customer_type?.forEach?.(radio => radio.addEventListener("change", () => toggleCompanyFields(profileForm.elements.customer_type.value)));

profileForm?.addEventListener("submit", async event => {
  event.preventDefault();
  const status = document.querySelector("[data-profile-status]");
  const submit = profileForm.querySelector("button[type='submit']");
  if (!profileForm.reportValidity()) return;
  const data = Object.fromEntries(new FormData(profileForm));
  submit.disabled = true;
  status.hidden = false;
  status.className = "cs-profile-status";
  status.textContent = "Salvăm datele…";
  try {
    const result = await customerApi.updateProfile(data);
    state.customer = result.customer;
    localStorage.setItem(STORAGE_KEYS.customerProfile, JSON.stringify(state.customer));
    renderProfile();
    status.textContent = "Datele tale au fost salvate.";
  } catch (error) {
    status.classList.add("is-error");
    status.textContent = error?.message || "Datele nu au putut fi salvate.";
  } finally { submit.disabled = false; }
});

document.querySelector("[data-account-logout]")?.addEventListener("click", async () => {
  const button = document.querySelector("[data-account-logout]");
  button.disabled = true;
  try { await customerApi.logout(); } catch { /* Sesiunea locală trebuie închisă chiar dacă serverul nu mai răspunde. */ }
  clearSession();
  location.replace("/login");
});

async function boot() {
  const token = localStorage.getItem(STORAGE_KEYS.customerToken);
  if (!token) { redirectToLogin(); return; }
  const shell = initShell({ active: "account" });
  try {
    const me = await customerApi.me();
    state.customer = me.customer;
    localStorage.setItem(STORAGE_KEYS.customerProfile, JSON.stringify(state.customer));
    const [orders, addresses, coupons] = await Promise.all([
      customerApi.orders().catch(() => []),
      customerApi.addresses().catch(() => []),
      customerApi.coupons().catch(() => []),
    ]);
    state.orders = Array.isArray(orders) ? orders : [];
    state.addresses = Array.isArray(addresses) ? addresses : [];
    state.coupons = Array.isArray(coupons) ? coupons : [];
    renderProfile(); renderCounts(); renderOverview(); renderOrders(); renderAddresses(); renderCoupons();
    app.setAttribute("aria-busy", "false");
    const requested = location.hash.slice(1);
    showTab(requested || "overview", { updateHash: false });
  } catch (error) {
    clearSession();
    app.setAttribute("aria-busy", "false");
    errorBox.hidden = false;
    errorBox.innerHTML = `${escapeHtml(error?.message || "Sesiunea contului a expirat.")} <a href="${loginUrl()}">Intră din nou în cont</a>`;
    window.setTimeout(redirectToLogin, 900);
  }
  await shell;
}

boot();
