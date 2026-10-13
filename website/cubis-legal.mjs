import { escapeHtml, icon, initShell, money, safeUrl } from "./cubis-storefront.mjs?v=20261013-legal-1";
import { getCookieConsent } from "./cubis-cookie-consent.mjs?v=20261013-legal-1";

const FALLBACK_COMPANY = Object.freeze({
  legal_name: "",
  trade_name: "Cubis Shop",
  cui: "",
  registration_number: "",
  address: "",
  city: "",
  county: "",
  postal_code: "",
  country: "România",
  physical_address: "",
  email: "",
  phone: "",
  website: "https://cubisshop.ro",
  bank_name: "",
  iban: "",
  share_capital: "",
});

function cleanValue(value) {
  const normalized = String(value ?? "").trim();
  return /g[-\s]?trots/i.test(normalized) ? "" : normalized;
}

function companyFromConfig(input) {
  const company = { ...FALLBACK_COMPANY };
  Object.keys(company).forEach(key => {
    const value = cleanValue(input?.[key]);
    if (value) company[key] = value;
  });
  return company;
}

function phoneHref(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("0040")) digits = digits.slice(2);
  if (digits.startsWith("40")) return `+${digits}`;
  if (digits.startsWith("0")) return `+40${digits.slice(1)}`;
  return digits ? `+${digits}` : "";
}

function fullAddress(company) {
  return [company.address, company.postal_code, company.city, company.county, company.country]
    .filter(Boolean)
    .filter((value, index, rows) => rows.indexOf(value) === index)
    .join(", ");
}

function companyBindings(company) {
  const values = { ...company, full_address: fullAddress(company) };
  document.querySelectorAll("[data-company]").forEach(node => {
    const key = node.dataset.company;
    const value = values[key] || "Date neconfigurate";
    node.textContent = value;
    if (node instanceof HTMLAnchorElement) {
      if (key === "email" && company.email) node.href = `mailto:${company.email}`;
      else if (key === "phone" && company.phone) node.href = `tel:${phoneHref(company.phone)}`;
      else if (key === "website" && safeUrl(company.website)) node.href = safeUrl(company.website);
      else if (value === "Date neconfigurate") node.removeAttribute("href");
    }
  });
}

function profileRows(company) {
  const address = fullAddress(company);
  const rows = [
    ["Denumire juridică", company.legal_name],
    ["Denumire comercială", company.trade_name],
    ["CUI / CIF", company.cui],
    ["Registrul Comerțului", company.registration_number],
    ["Sediu social", address],
    ["Adresă publică / zonă", company.physical_address],
    ["Telefon", company.phone, company.phone ? `tel:${phoneHref(company.phone)}` : ""],
    ["E-mail", company.email, company.email ? `mailto:${company.email}` : ""],
    ["Website", company.website, safeUrl(company.website)],
    ["Date bancare", [company.bank_name, company.iban].filter(Boolean).join(" · ")],
    ["Capital social", company.share_capital],
  ].filter(([, value]) => value);
  return rows.map(([label, value, href]) => `<div><dt>${escapeHtml(label)}</dt><dd>${href ? `<a href="${escapeHtml(href)}">${escapeHtml(value)}</a>` : escapeHtml(value)}</dd></div>`).join("");
}

function renderCompanyProfile(company) {
  document.querySelectorAll("[data-company-profile]").forEach(host => {
    const rows = profileRows(company);
    host.innerHTML = rows
      ? `<div class="cs-legal-profile__heading"><span>DATE OFICIALE</span><h2>Comerciantul din spatele Cubis Shop</h2><p>Aceste informații sunt citite din „Datele firmei” și se actualizează automat după salvarea lor în aplicațiile Cubis Shop.</p></div><dl class="cs-legal-profile__grid">${rows}</dl>`
      : `<div class="cs-legal-live-empty"><strong>Datele firmei nu sunt încă publicate.</strong><p>Completează firma implicită în aplicația de administrare pentru ca informațiile să apară simultan aici și în footer.</p></div>`;
  });
}

function renderShipping(methods) {
  const active = (Array.isArray(methods) ? methods : []).filter(method => method?.is_active !== false);
  document.querySelectorAll("[data-shipping-methods]").forEach(host => {
    if (!active.length) {
      host.innerHTML = `<div class="cs-legal-live-empty"><strong>Metodele de livrare nu sunt încă publicate.</strong><p>Costurile active vor fi afișate în checkout înainte de trimiterea comenzii.</p></div>`;
      return;
    }
    host.innerHTML = active.map(method => `<article class="cs-legal-shipping-card">
      <div class="cs-legal-shipping-card__head"><span>${icon("truck")}</span><div><strong>${escapeHtml(method.name || "Curier")}</strong><small>${escapeHtml(method.eta_label || method.description || "Termen comunicat în checkout")}</small></div></div>
      ${method.description && method.description !== method.eta_label ? `<p>${escapeHtml(method.description)}</p>` : ""}
      <dl><div><dt>Livrare</dt><dd>${escapeHtml(money(method.cost, "RON"))}</dd></div>${method.free_above == null ? "" : `<div><dt>Gratuit peste</dt><dd>${escapeHtml(money(method.free_above, "RON"))}</dd></div>`}<div><dt>Retur organizat</dt><dd>${escapeHtml(money(method.return_cost, "RON"))}</dd></div></dl>
    </article>`).join("");
  });
}

function renderPayments(payments = {}) {
  const methods = [];
  if (payments.card_enabled) methods.push({ icon: "card", title: payments.card_label || "Card online", text: "Plata este procesată securizat de furnizorul activ; Cubis Shop nu primește datele complete ale cardului." });
  if (payments.cash_on_delivery_enabled) methods.push({ icon: "package", title: payments.cash_on_delivery_label || "Ramburs la curier", text: "Plata este datorată la livrare, prin opțiunile acceptate de curier." });
  document.querySelectorAll("[data-payment-methods]").forEach(host => {
    host.innerHTML = methods.length
      ? methods.map(method => `<article><span>${icon(method.icon)}</span><div><strong>${escapeHtml(method.title)}</strong><p>${escapeHtml(method.text)}</p></div></article>`).join("")
      : `<div class="cs-legal-live-empty"><strong>Metodele de plată se confirmă în checkout.</strong><p>Checkout-ul afișează numai opțiunile active pentru comanda ta.</p></div>`;
  });
}

function renderTax(config) {
  document.querySelectorAll("[data-tax-summary]").forEach(host => {
    host.textContent = config?.tax?.vat_payer
      ? "Prețurile afișate includ TVA, conform cotei configurate pentru comerciant."
      : "Prețurile finale sunt afișate în checkout conform regimului fiscal configurat pentru comerciant.";
  });
}

function renderConsentState() {
  const consent = getCookieConsent();
  document.querySelectorAll("[data-cookie-state]").forEach(host => {
    host.textContent = consent?.preferences ? "Preferințele locale opționale sunt permise." : "Sunt active numai funcțiile strict necesare.";
  });
}

function appendOrganizationSchema(company) {
  if (document.querySelector("[data-cubis-organization-schema]")) return;
  const schema = {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    name: company.trade_name || company.legal_name || "Cubis Shop",
    url: "https://cubisshop.ro/",
    logo: "https://cubisshop.ro/assets/cubis-shop-logo.png",
    hasMerchantReturnPolicy: {
      "@type": "MerchantReturnPolicy",
      applicableCountry: "RO",
      returnPolicyCountry: "RO",
      returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
      merchantReturnDays: 30,
      returnMethod: "https://schema.org/ReturnByMail",
      returnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
      merchantReturnLink: "https://cubisshop.ro/politica-de-retur",
    },
  };
  if (company.legal_name) schema.legalName = company.legal_name;
  if (company.cui) schema.taxID = company.cui;
  if (company.email) schema.email = company.email;
  if (company.phone) schema.telephone = company.phone;
  if (company.address || company.city || company.county || company.postal_code) schema.address = {
    "@type": "PostalAddress",
    streetAddress: company.address || undefined,
    postalCode: company.postal_code || undefined,
    addressLocality: company.city || undefined,
    addressRegion: company.county || undefined,
    addressCountry: "RO",
  };
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.dataset.cubisOrganizationSchema = "";
  script.textContent = JSON.stringify(schema);
  document.head.append(script);
}

document.querySelectorAll("[data-legal-icon]").forEach(host => { host.innerHTML = icon(host.dataset.legalIcon); });
window.addEventListener("cubis:consent-changed", renderConsentState);

const { config } = await initShell();
const company = companyFromConfig(config?.company);
companyBindings(company);
renderCompanyProfile(company);
renderShipping(config?.shipping_methods);
renderPayments(config?.payments);
renderTax(config);
renderConsentState();
appendOrganizationSchema(company);
