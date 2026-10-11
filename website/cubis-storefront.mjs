import { normalize } from "./cubis-search-normalize.mjs";
import { commerceApiRequest, migrateHistoricalStorage, STORAGE_KEYS } from "./cubis-commerce-api.mjs";

export const API_URL = "/shop-api/api-v2.php";
const previewParams = new URLSearchParams(location.search);
export const PREVIEW_DEMO = /^(localhost|127\.0\.0\.1)$/i.test(location.hostname) && previewParams.get("demo") === "1";
export const PREVIEW_STATE = PREVIEW_DEMO && ["full", "one", "empty", "error"].includes(previewParams.get("previewState"))
  ? previewParams.get("previewState")
  : "full";
export const PREVIEW_DELAY = PREVIEW_DEMO
  ? Math.min(2500, Math.max(0, Number(previewParams.get("previewDelay")) || 0))
  : 0;

async function removeLegacyWebRuntime() {
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations
        .filter(registration => [registration.active, registration.waiting, registration.installing]
          .some(worker => worker?.scriptURL?.includes("/search-cache-sw.js")))
        .map(registration => registration.unregister()));
    }
  } catch {
    // Curățarea este best-effort și nu trebuie să blocheze storefrontul.
  }
  try {
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.filter(name => /^g-trots-/i.test(name)).map(name => caches.delete(name)));
    }
  } catch {
    // Unele contexte private pot refuza accesul la CacheStorage.
  }
}

void removeLegacyWebRuntime();

if (!PREVIEW_DEMO) migrateHistoricalStorage();
const STORAGE = PREVIEW_DEMO ? Object.freeze({
  favorites: "cubis-preview-favorites-v1",
  cart: "cubis-preview-cart-v1",
  customerToken: "cubis-preview-session-v1",
  customerProfile: "cubis-preview-profile-v1",
  device: "cubis-preview-device-v1",
}) : STORAGE_KEYS;

const PRODUCT_FIELDS = Object.freeze([
  "id", "slug", "sku", "ean", "name", "short_description", "category_id",
  "category_name", "category_slug", "manufacturer_id", "manufacturer_name",
  "manufacturer_slug", "brands", "image_url", "price", "sale_price",
  "discount_type", "discount_value", "currency", "stock_mode", "stock_quantity",
  "low_stock_threshold", "is_featured", "featured_rank", "promotion_price",
  "price_before_promotion", "promotion_discount_percent", "active_promotion",
  "meta_title", "meta_description", "legal_warranty_months",
  "commercial_warranty_months", "discovery_enrichment_enabled", "is_boomag_source",
  "is_accessory_category", "review_count", "review_average",
]);

let demoFixturePromise = null;

export function previewUrl(value) {
  const raw = String(value || "");
  if (!PREVIEW_DEMO || !raw || /^(mailto:|tel:|javascript:)/i.test(raw)) return raw;
  try {
    const url = new URL(raw, location.origin);
    if (url.origin !== location.origin) return raw;
    url.searchParams.set("demo", "1");
    if (PREVIEW_STATE !== "full" && !url.searchParams.has("previewState")) url.searchParams.set("previewState", PREVIEW_STATE);
    if (PREVIEW_DELAY && !url.searchParams.has("previewDelay")) url.searchParams.set("previewDelay", String(PREVIEW_DELAY));
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return raw;
  }
}

async function demoFixture() {
  demoFixturePromise ||= fetch("/__preview__/cubis-demo.json", {
    cache: "no-store",
    headers: { Accept: "application/json" },
  }).then(async response => {
    if (!response.ok || response.headers.get("X-Cubis-Preview-Only") !== "demo-fixtures") {
      throw new Error("Fixture-urile demo nu sunt active. Pornește serverul local cu --demo-fixtures.");
    }
    return response.json();
  });
  return demoFixturePromise;
}

function compactProductRow(product) {
  return PRODUCT_FIELDS.map(field => {
    if (field === "image_url") return product.images?.[0]?.url || "";
    if (field === "brands") return (product.brands || []).map(brand => [brand.id, brand.name, brand.slug]);
    if (field === "active_promotion" && product.active_promotion) {
      return [product.active_promotion.id, product.active_promotion.code, product.active_promotion.title, product.active_promotion.discount_type, product.active_promotion.discount_value];
    }
    return product[field] ?? null;
  });
}

async function demoApi(action, { query = {} } = {}) {
  if (PREVIEW_DELAY) await new Promise(resolve => setTimeout(resolve, PREVIEW_DELAY));
  if (PREVIEW_STATE === "error") throw new Error("Eroare simulată local pentru validarea stării de indisponibilitate.");
  const fixture = await demoFixture();
  const products = PREVIEW_STATE === "empty" ? [] : PREVIEW_STATE === "one" ? fixture.products.slice(0, 1) : fixture.products;
  if (action === "publicCatalogFilters") return structuredClone(fixture.filters);
  if (action === "publicShopConfig") return structuredClone(fixture.config);
  if (action === "publicProductsPage") {
    const pageSize = Math.max(1, Number(query.page_size || 200));
    const page = Math.max(1, Number(query.page || 1));
    const start = (page - 1) * pageSize;
    return { p: products.slice(start, start + pageSize).map(compactProductRow), total: products.length, page, page_size: pageSize };
  }
  if (action === "publicProduct") {
    const identifier = String(query.slug || query.id || "");
    const product = products.find(row => row.slug === identifier || row.id === identifier);
    if (!product) throw new Error("Produsul demonstrativ nu există în starea de preview selectată.");
    return structuredClone(product);
  }
  if (action === "publicProductReviews") return structuredClone(fixture.reviews?.[String(query.id || "")] || []);
  throw new Error(`Acțiunea ${action} nu este disponibilă în previewul demo.`);
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

export function safeUrl(value) {
  try {
    const url = new URL(String(value || ""), location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function money(value, currency = "RON") {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: String(currency || "RON").toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export function icon(name, className = "") {
  const paths = {
    search: '<circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path>',
    user: '<circle cx="12" cy="8" r="4"></circle><path d="M4.5 21a7.5 7.5 0 0 1 15 0"></path>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"></path>',
    cart: '<circle cx="9" cy="20" r="1"></circle><circle cx="18" cy="20" r="1"></circle><path d="M3 3h2l2.4 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.6L21 7H6"></path>',
    truck: '<path d="M10 17h4V5H2v12h3"></path><path d="M14 9h4l4 4v4h-3"></path><circle cx="7.5" cy="17.5" r="2.5"></circle><circle cx="16.5" cy="17.5" r="2.5"></circle>',
    rotate: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5"></path>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path>',
    headset: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"></path><path d="M18 19c0 1.1-.9 2-2 2h-3"></path><rect x="3" y="13" width="4" height="6" rx="2"></rect><rect x="17" y="13" width="4" height="6" rx="2"></rect>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"></path>',
    close: '<path d="m6 6 12 12M18 6 6 18"></path>',
    chevron: '<path d="m9 18 6-6-6-6"></path>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"></path>',
    plus: '<path d="M12 5v14M5 12h14"></path>',
    minus: '<path d="M5 12h14"></path>',
    check: '<path d="m5 12 4 4L19 6"></path>',
    filter: '<path d="M4 5h16M7 12h10M10 19h4"></path>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"></path><path d="m9 12 2 2 4-4"></path>',
    package: '<path d="m21 8-9 5-9-5 9-5 9 5Z"></path><path d="m3 8 9 5 9-5v9l-9 5-9-5V8Z"></path>',
    star: '<path d="m12 2.8 2.8 5.7 6.3.9-4.6 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2-4.6-4.4 6.3-.9L12 2.8Z"></path>',
    zoom: '<circle cx="10" cy="10" r="6"></circle><path d="m15 15 6 6M10 7v6M7 10h6"></path>',
    info: '<circle cx="12" cy="12" r="9"></circle><path d="M12 11v6M12 7h.01"></path>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m3 7 9 7 9-7"></path>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z"></path>',
  };
  return `<svg class="cs-icon ${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name] || paths.info}</svg>`;
}

export async function api(action, { method = "GET", query = {}, body, auth = true, timeout = 14000, cache = "default" } = {}) {
  if (PREVIEW_DEMO && method === "GET") return demoApi(action, { query });
  return commerceApiRequest(action, { method, query, body, auth, timeout, cache });
}

function decodeCompactRow(row) {
  if (!Array.isArray(row)) return row;
  const product = Object.fromEntries(PRODUCT_FIELDS.map((field, index) => [field, row[index]]));
  product.brands = (product.brands || []).map(brand => Array.isArray(brand)
    ? { id: brand[0], name: brand[1], slug: brand[2] }
    : brand);
  if (Array.isArray(product.active_promotion)) {
    product.active_promotion = {
      id: product.active_promotion[0], code: product.active_promotion[1],
      title: product.active_promotion[2], discount_type: product.active_promotion[3],
      discount_value: product.active_promotion[4],
    };
  }
  product.images = product.image_url ? [{ url: product.image_url, alt_text: product.name }] : [];
  delete product.image_url;
  return product;
}

export function normalizeProduct(raw) {
  const product = decodeCompactRow(raw || {});
  const diagnosticProduct = /\b(test|fictiv|diagnostic)\b/i.test([
    product.name,
    product.short_description,
    product.description_title,
    product.description_html,
  ].filter(Boolean).join(" "));
  const promotionPrice = Number(product.promotion_price);
  const salePrice = Number(product.sale_price);
  const basePrice = Number(product.price || 0);
  const effectivePrice = Number.isFinite(promotionPrice) && promotionPrice > 0
    ? promotionPrice
    : Number.isFinite(salePrice) && salePrice > 0 ? salePrice : basePrice;
  const oldPrice = Number(product.price_before_promotion || 0) > effectivePrice
    ? Number(product.price_before_promotion)
    : basePrice > effectivePrice ? basePrice : null;
  const images = (Array.isArray(product.images) ? product.images : [])
    .map(image => typeof image === "string" ? { url: safeUrl(image), alt_text: product.name } : {
      ...image,
      url: safeUrl(image?.url),
      alt_text: String(image?.alt_text || product.name || "Produs Cubis Shop"),
    })
    .filter(image => image.url && !(diagnosticProduct && /\b(fictiv|test|diagnostic)\b/i.test(String(image.alt_text || ""))));
  const stockMode = String(product.stock_mode || "tracked");
  const stockQuantity = Number(product.stock_quantity || 0);
  const inStock = stockMode === "unlimited" || stockQuantity > 0 || product.stock_available === true;
  const id = String(product.slug || product.id || "");
  return {
    ...product,
    id,
    apiId: String(product.id || ""),
    slug: String(product.slug || product.id || ""),
    sku: String(product.sku || ""),
    name: String(product.name || "Produs Cubis Shop"),
    categoryName: String(product.category_name || ""),
    categorySlug: String(product.category_slug || ""),
    manufacturerName: String(product.manufacturer_name || ""),
    brandNames: (product.brands || []).map(brand => String(brand?.name || "")).filter(Boolean),
    images,
    imageUrl: images[0]?.url || "",
    currency: String(product.currency || "RON"),
    price: effectivePrice,
    oldPrice,
    inStock,
    stockMode,
    stockQuantity,
    rating: product.review_average === null || product.review_average === undefined ? null : Number(product.review_average),
    reviewCount: Math.max(0, Number(product.review_count || 0)),
    featured: Boolean(product.is_featured),
    diagnostic: diagnosticProduct,
  };
}

class StorefrontData {
  #filters;
  #config;
  #catalog;

  filters({ refresh = false } = {}) {
    if (refresh) this.#filters = null;
    this.#filters ||= api("publicCatalogFilters", { auth: false, cache: refresh ? "no-store" : "default" });
    return this.#filters;
  }

  config({ refresh = false } = {}) {
    if (refresh) this.#config = null;
    this.#config ||= api("publicShopConfig", { auth: false, cache: refresh ? "no-store" : "default" });
    return this.#config;
  }

  async catalog({ refresh = false } = {}) {
    if (refresh) this.#catalog = null;
    this.#catalog ||= (async () => {
      const first = await api("publicProductsPage", {
        auth: false,
        query: { page: 1, page_size: 200 },
        cache: refresh ? "no-store" : "default",
      });
      const rows = Array.isArray(first) ? first : Array.isArray(first?.p) ? first.p : [];
      const total = Number(first?.total ?? rows.length);
      const pageSize = Number(first?.page_size || 200);
      const pageCount = Math.max(1, Math.ceil(total / pageSize));
      const remaining = pageCount > 1
        ? await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) => api("publicProductsPage", {
          auth: false,
          query: { page: index + 2, page_size: pageSize },
        })))
        : [];
      const allRows = [...rows, ...remaining.flatMap(payload => Array.isArray(payload?.p) ? payload.p : [])];
      const unique = new Map();
      allRows.map(normalizeProduct).forEach(product => {
        if (!product.id) return;
        const key = product.sku ? `sku:${normalize(product.sku)}` : `slug:${normalize(product.slug)}`;
        if (!unique.has(key) || (!unique.get(key).inStock && product.inStock)) unique.set(key, product);
      });
      return [...unique.values()];
    })();
    const products = await this.#catalog;
    commerce.registerProducts(products);
    return products;
  }

  async product(identifier) {
    const value = String(identifier || "").trim();
    if (!value) return null;
    return normalizeProduct(await api("publicProduct", { auth: false, query: { slug: value } }));
  }
}

export const data = new StorefrontData();

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

class CommerceStore extends EventTarget {
  products = {};

  favorites() {
    const rows = readJson(STORAGE.favorites, []);
    return Array.isArray(rows) ? [...new Set(rows.map(String).filter(Boolean))] : [];
  }

  cart() {
    const rows = readJson(STORAGE.cart, []);
    if (!Array.isArray(rows)) return [];
    return rows.map(row => ({ id: String(row?.id || ""), quantity: Math.max(1, Number(row?.quantity || 1)) })).filter(row => row.id);
  }

  registerProducts(rows) {
    (rows || []).forEach(product => {
      const normalizedProduct = product?.apiId ? product : normalizeProduct(product);
      if (normalizedProduct.id) this.products[normalizedProduct.id] = normalizedProduct;
    });
    this.sync();
  }

  toggleFavorite(id) {
    const key = String(id || "");
    const current = this.favorites();
    const next = current.includes(key) ? current.filter(value => value !== key) : [...current, key];
    writeJson(STORAGE.favorites, next);
    this.#changed("favorites", next);
    return next.includes(key);
  }

  add(id, quantity = 1) {
    const key = String(id || "");
    const rows = this.cart();
    const found = rows.find(row => row.id === key);
    if (found) found.quantity += Math.max(1, Number(quantity || 1));
    else rows.push({ id: key, quantity: Math.max(1, Number(quantity || 1)) });
    writeJson(STORAGE.cart, rows);
    this.#changed("cart", rows);
    return rows;
  }

  remove(id) {
    const rows = this.cart().filter(row => row.id !== String(id || ""));
    writeJson(STORAGE.cart, rows);
    this.#changed("cart", rows);
    return rows;
  }

  toggleCart(id) {
    return this.cart().some(row => row.id === String(id || "")) ? this.remove(id) : this.add(id);
  }

  changeQuantity(id, change) {
    const key = String(id || "");
    const rows = this.cart();
    const found = rows.find(row => row.id === key);
    if (!found) return rows;
    found.quantity = Math.max(0, found.quantity + Number(change || 0));
    const next = rows.filter(row => row.quantity > 0);
    writeJson(STORAGE.cart, next);
    this.#changed("cart", next);
    return next;
  }

  #changed(type, detail) {
    this.dispatchEvent(new CustomEvent("change", { detail: { type, value: detail } }));
    document.dispatchEvent(new CustomEvent(`cubis:${type}-changed`, { detail }));
    this.sync();
  }

  sync() {
    const favorites = new Set(this.favorites());
    const cart = this.cart();
    const cartIds = new Set(cart.map(row => row.id));
    document.querySelectorAll("[data-product-favorite]").forEach(button => {
      const active = favorites.has(button.dataset.productFavorite);
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
      button.setAttribute("aria-label", active ? "Elimină din favorite" : "Adaugă la favorite");
    });
    document.querySelectorAll("[data-product-add]").forEach(button => {
      const active = cartIds.has(button.dataset.productAdd);
      button.classList.toggle("is-added", active);
      button.setAttribute("aria-label", active ? "Produs adăugat în coș" : "Adaugă în coș");
      const label = button.querySelector("[data-add-label]");
      if (label) label.textContent = active ? "În coș" : "Adaugă în coș";
    });
    const favoriteCount = favorites.size;
    const cartCount = cart.reduce((sum, row) => sum + row.quantity, 0);
    document.querySelectorAll("[data-favorite-count]").forEach(node => {
      node.textContent = String(favoriteCount);
      node.hidden = favoriteCount === 0;
    });
    document.querySelectorAll("[data-cart-count]").forEach(node => {
      node.textContent = String(cartCount);
      node.hidden = cartCount === 0;
    });
  }
}

export const commerce = new CommerceStore();

export function productRoute(product) {
  return previewUrl(`/magazin/produs/${encodeURIComponent(product?.slug || product?.id || "")}/`);
}

export function productBadge(product) {
  if (Number(product?.promotion_discount_percent || 0) > 0) return `-${Math.round(Number(product.promotion_discount_percent))}%`;
  if (product?.active_promotion?.title) return String(product.active_promotion.title);
  if (product?.featured) return "Recomandat";
  return "";
}

export function productCard(product, { compact = false } = {}) {
  const route = productRoute(product);
  const badge = productBadge(product);
  const rating = product.rating !== null && Number.isFinite(product.rating)
    ? `<div class="cs-product-card__rating" aria-label="Rating ${product.rating.toFixed(1)} din 5">${icon("star")}<strong>${product.rating.toFixed(1)}</strong><span>(${product.reviewCount})</span></div>`
    : `<div class="cs-product-card__rating is-empty"><span>Fără recenzii</span></div>`;
  return `<article class="cs-product-card${compact ? " is-compact" : ""}" data-product-card="${escapeHtml(product.id)}">
    <div class="cs-product-card__media">
      ${PREVIEW_DEMO ? `<span class="cs-demo-chip">DEMO</span>` : badge ? `<span class="cs-product-badge">${escapeHtml(badge)}</span>` : ""}
      ${PREVIEW_DEMO && badge ? `<span class="cs-product-badge is-secondary">${escapeHtml(badge)}</span>` : ""}
      <button class="cs-icon-button cs-product-card__favorite" type="button" data-product-favorite="${escapeHtml(product.id)}" aria-label="Adaugă la favorite" aria-pressed="false">${icon("heart")}</button>
      <a href="${route}" aria-label="Vezi ${escapeHtml(product.name)}">
        ${product.imageUrl ? `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" loading="${PREVIEW_DEMO ? "eager" : "lazy"}" decoding="async" width="360" height="300">` : `<span class="cs-product-placeholder">${icon("package")}</span>`}
      </a>
    </div>
    <div class="cs-product-card__body">
      <a class="cs-product-card__title" href="${route}">${escapeHtml(product.name)}</a>
      <p class="cs-product-card__compatibility">${escapeHtml(product.brandNames.join(", ") || product.manufacturerName || product.categoryName || "Catalog Cubis Shop")}</p>
      ${rating}
      <div class="cs-product-card__price"><strong>${escapeHtml(money(product.price, product.currency))}</strong>${product.oldPrice ? `<del>${escapeHtml(money(product.oldPrice, product.currency))}</del>` : ""}</div>
      <button class="cs-add-button" type="button" data-product-add="${escapeHtml(product.id)}" ${product.inStock ? "" : "disabled"}>${icon("cart")}<span data-add-label>${product.inStock ? "Adaugă în coș" : "Indisponibil"}</span></button>
    </div>
  </article>`;
}

function cleanCompany(raw) {
  const source = raw || {};
  const invalid = value => /g[-\s]?trots/i.test(String(value || ""));
  const clean = value => invalid(value) ? "" : String(value || "").trim();
  return {
    legalName: clean(source.legal_name),
    tradeName: clean(source.trade_name) || "Cubis Shop",
    email: clean(source.email),
    phone: clean(source.phone),
    address: [clean(source.address), clean(source.city), clean(source.county)].filter(Boolean).join(", "),
  };
}

function benefitItems(config) {
  const shipping = Array.isArray(config?.shipping_methods) ? config.shipping_methods : [];
  const payments = config?.payments || {};
  const rows = [];
  if (shipping.length) rows.push({ icon: "truck", title: "Livrare configurată", detail: shipping[0].eta_label || "Opțiuni afișate la checkout" });
  rows.push({ icon: "rotate", title: "Retur conform politicii", detail: "Eligibilitatea este verificată de magazin" });
  if (payments.card_enabled) rows.push({ icon: "lock", title: payments.stripe_test_mode ? "Plată online TEST" : "Plată online", detail: "Procesată securizat prin Stripe" });
  rows.push({ icon: "headset", title: "Asistență", detail: "Te ajutăm să verifici compatibilitatea" });
  return rows.slice(0, 4);
}

function shellHeader(active, filters, config) {
  const categories = Array.isArray(filters?.categories) ? filters.categories.filter(category => !category.parent_id).slice(0, 6) : [];
  const customer = readJson(STORAGE.customerProfile, null);
  const benefits = benefitItems(config);
  return `<a class="cs-skip-link" href="#main">Sari la conținut</a>
    ${PREVIEW_DEMO ? `<div class="cs-demo-banner" role="status"><strong>PREVIEW DEMO</strong><span>Date locale izolate · ${PREVIEW_STATE === "full" ? "catalog complet" : PREVIEW_STATE === "one" ? "un produs" : PREVIEW_STATE === "empty" ? "catalog gol" : "eroare simulată"}</span><a href="${previewUrl("/?previewState=full")}">Homepage</a><a href="${previewUrl("/magazin?previewState=full")}">Magazin</a></div>` : ""}
    <div class="cs-topbar"><div class="cs-container cs-topbar__inner">${benefits.map(item => `<span>${icon(item.icon)}<b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.detail)}</small></span>`).join("")}</div></div>
    <header class="cs-header">
      <div class="cs-container cs-header__main">
        <button class="cs-mobile-menu" type="button" data-mobile-menu-open aria-label="Deschide meniul" aria-expanded="false">${icon("menu")}</button>
        <a class="cs-brand" href="/" aria-label="Cubis Shop - Acasă"><img src="/assets/cubis-shop-icon.png" alt="" width="72" height="72"><span><b>Cubis</b> <em>Shop</em></span></a>
        <form class="cs-search" role="search" data-global-search autocomplete="off">
          <label class="sr-only" for="global-search-input">Caută produse</label>
          <span class="cs-search__icon">${icon("search")}</span>
          <input id="global-search-input" name="q" type="search" placeholder="Caută produse, mărci sau modele compatibile…" aria-autocomplete="list" aria-expanded="false" aria-controls="global-search-results">
          <button type="submit" aria-label="Caută">${icon("search")}</button>
          <div class="cs-search-results" id="global-search-results" role="listbox" hidden></div>
        </form>
        <nav class="cs-account-nav" aria-label="Cont și cumpărături">
          <a href="${customer ? "/cont" : "/login"}">${icon("user")}<span>${customer ? escapeHtml(String(customer.full_name || "Contul meu").split(/\s+/)[0]) : "Contul meu"}</span></a>
          <a href="/favorite" class="cs-nav-badge">${icon("heart")}<span>Favorite</span><b data-favorite-count hidden>0</b></a>
          <a href="/cos" class="cs-nav-badge">${icon("cart")}<span>Coș</span><b data-cart-count hidden>0</b></a>
        </nav>
      </div>
      <div class="cs-category-bar"><nav class="cs-container" aria-label="Categorii principale">
        ${categories.map(category => `<a href="/magazin?category=${encodeURIComponent(category.id || category.slug)}">${icon("package")}<span>${escapeHtml(category.name)}</span></a>`).join("")}
      </nav></div>
    </header>
    <div class="cs-mobile-drawer" data-mobile-drawer hidden>
      <button class="cs-mobile-drawer__scrim" type="button" data-mobile-menu-close aria-label="Închide meniul"></button>
      <aside aria-label="Meniu mobil"><div class="cs-mobile-drawer__head"><a class="cs-brand" href="/"><img src="/assets/cubis-shop-icon.png" alt="" width="60" height="60"><span><b>Cubis</b> <em>Shop</em></span></a><button type="button" data-mobile-menu-close aria-label="Închide meniul">${icon("close")}</button></div>
        <nav><a href="/magazin"><strong>${icon("grid")}Toate produsele</strong>${icon("chevron")}</a>${categories.map(category => `<a href="/magazin?category=${encodeURIComponent(category.id || category.slug)}"><span>${escapeHtml(category.name)}</span>${icon("chevron")}</a>`).join("")}</nav>
        <div class="cs-mobile-drawer__quick"><a href="/cont">${icon("user")}Contul meu</a><a href="/favorite">${icon("heart")}Favorite</a><a href="/cos">${icon("cart")}Coș</a></div>
      </aside>
    </div>`;
}

function shellFooter(filters, config) {
  const categories = Array.isArray(filters?.categories) ? filters.categories.filter(category => !category.parent_id).slice(0, 6) : [];
  const company = cleanCompany(config?.company);
  return `<footer class="cs-footer">
    <div class="cs-container cs-footer__grid">
      <div class="cs-footer__brand"><a class="cs-brand is-footer" href="/"><img src="/assets/cubis-shop-icon.png" alt="" width="60" height="60"><span><b>Cubis</b> <em>Shop</em></span></a><p>Piese mici. Posibilități mari.</p>${company.legalName || company.address ? `<small>${escapeHtml(company.legalName)}${company.address ? `<br>${escapeHtml(company.address)}` : ""}</small>` : `<small>Datele juridice vor fi afișate după configurarea publică a magazinului.</small>`}</div>
      <div><h2>Informații</h2><a href="/livrare-si-plata">Livrare și plată</a><a href="/politica-de-retur">Retururi</a><a href="/termeni-si-conditii">Termeni și condiții</a><a href="/politica-de-confidentialitate">Confidențialitate</a><a href="/contact">Contact</a></div>
      <div><h2>Categorii</h2>${categories.map(category => `<a href="/magazin?category=${encodeURIComponent(category.id || category.slug)}">${escapeHtml(category.name)}</a>`).join("") || `<a href="/magazin">Vezi catalogul</a>`}</div>
      <div><h2>Suport clienți</h2><a href="/urmarire-comanda">Urmărește comanda</a><a href="/solicita-retur">Solicită retur</a><a href="/garantii-si-reclamatii">Garanții și reclamații</a>${company.email ? `<a href="mailto:${escapeHtml(company.email)}">${icon("mail")} ${escapeHtml(company.email)}</a>` : ""}${company.phone ? `<a href="tel:${escapeHtml(company.phone.replace(/[^+\d]/g, ""))}">${icon("phone")} ${escapeHtml(company.phone)}</a>` : ""}</div>
      <div><h2>Magazin online sigur</h2><p class="cs-footer__secure">${icon("shield")} Plăți procesate securizat și date protejate.</p><a href="/politica-cookies" data-cookie-settings>Preferințe cookie</a></div>
    </div>
    <div class="cs-footer__bottom"><div class="cs-container"><span>© ${new Date().getFullYear()} Cubis Shop. Toate drepturile rezervate.</span><span>Creat pentru pasionații de tehnologie. <b>♥</b></span></div></div>
  </footer>`;
}

class CatalogSearch {
  worker = null;
  products = [];
  ready = null;

  init(products) {
    this.products = products || [];
    if (!("Worker" in window)) return Promise.resolve();
    this.worker = new Worker(new URL("./cubis-search-worker.mjs", import.meta.url), { type: "module" });
    this.ready = new Promise(resolve => {
      const onMessage = event => {
        if (event.data?.type === "READY") {
          this.worker.removeEventListener("message", onMessage);
          resolve();
        }
      };
      this.worker.addEventListener("message", onMessage);
      this.worker.postMessage({ type: "INIT", products: this.products.map(product => ({
        id: product.id,
        slug: product.slug,
        name: product.name,
        sku: product.sku,
        category: product.categoryName,
        manufacturer: product.manufacturerName,
        brands: product.brandNames,
        description: product.short_description || "",
      })) });
    });
    return this.ready;
  }

  async search(query, limit = 8) {
    const value = String(query || "").trim();
    if (value.length < 2) return [];
    if (!this.worker) {
      const needle = normalize(value);
      return this.products.filter(product => normalize([product.name, product.sku, product.categoryName, product.manufacturerName, product.brandNames.join(" ")].join(" ")).includes(needle)).slice(0, limit);
    }
    await this.ready;
    const requestId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    return new Promise(resolve => {
      let settled = false;
      const onMessage = event => {
        if (event.data?.type !== "RESULT" || event.data?.requestId !== requestId) return;
        if (settled) return;
        settled = true;
        this.worker.removeEventListener("message", onMessage);
        const byId = new Map(this.products.map(product => [product.id, product]));
        resolve((event.data.ids || []).map(id => byId.get(id)).filter(Boolean).slice(0, limit));
      };
      this.worker.addEventListener("message", onMessage);
      this.worker.postMessage({ type: "SEARCH", requestId, query: value, limit });
      setTimeout(() => {
        if (settled) return;
        settled = true;
        this.worker?.removeEventListener("message", onMessage);
        const needle = normalize(value);
        resolve(this.products.filter(product => normalize([product.name, product.sku, product.categoryName, product.manufacturerName, product.brandNames.join(" ")].join(" ")).includes(needle)).slice(0, limit));
      }, 1500);
    });
  }
}

const catalogSearch = new CatalogSearch();

function bindGlobalSearch() {
  const form = document.querySelector("[data-global-search]");
  const input = form?.querySelector("input[type='search']");
  const results = form?.querySelector("[role='listbox']");
  if (!form || !input || !results) return;
  let products = [];
  let activeIndex = -1;
  let sequence = 0;
  data.catalog().then(rows => {
    products = rows;
    return catalogSearch.init(rows);
  }).catch(() => {});

  const hide = () => {
    results.hidden = true;
    results.innerHTML = "";
    input.setAttribute("aria-expanded", "false");
    activeIndex = -1;
  };
  const paintActive = () => results.querySelectorAll("[role='option']").forEach((node, index) => {
    node.classList.toggle("is-active", index === activeIndex);
    node.setAttribute("aria-selected", String(index === activeIndex));
  });
  const render = rows => {
    if (!rows.length) {
      results.innerHTML = `<div class="cs-search-results__empty">Nu am găsit produse pentru „${escapeHtml(input.value)}”.</div>`;
    } else {
      results.innerHTML = rows.map(product => `<a role="option" aria-selected="false" href="${productRoute(product)}">
        <span>${product.imageUrl ? `<img src="${escapeHtml(product.imageUrl)}" alt="" width="54" height="54">` : icon("package")}</span>
        <span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml([product.sku, product.categoryName].filter(Boolean).join(" · "))}</small></span>
        <b>${escapeHtml(money(product.price, product.currency))}</b>
      </a>`).join("");
    }
    results.hidden = false;
    input.setAttribute("aria-expanded", "true");
    activeIndex = -1;
  };
  input.addEventListener("input", async () => {
    const current = ++sequence;
    if (input.value.trim().length < 2) return hide();
    results.hidden = false;
    results.innerHTML = `<div class="cs-search-results__empty">Se caută în catalog…</div>`;
    const rows = await catalogSearch.search(input.value, 8).catch(() => []);
    if (current === sequence) render(rows);
  });
  input.addEventListener("keydown", event => {
    const options = [...results.querySelectorAll("[role='option']")];
    if (event.key === "Escape") return hide();
    if (!options.length || results.hidden) return;
    if (event.key === "ArrowDown") { event.preventDefault(); activeIndex = (activeIndex + 1) % options.length; paintActive(); }
    if (event.key === "ArrowUp") { event.preventDefault(); activeIndex = (activeIndex - 1 + options.length) % options.length; paintActive(); }
    if (event.key === "Enter" && activeIndex >= 0) { event.preventDefault(); location.href = options[activeIndex].href; }
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    const query = input.value.trim();
    if (query) location.href = previewUrl(`/magazin?q=${encodeURIComponent(query)}#catalog`);
  });
  document.addEventListener("pointerdown", event => { if (!form.contains(event.target)) hide(); });
}

function bindShellInteractions() {
  const drawer = document.querySelector("[data-mobile-drawer]");
  const opener = document.querySelector("[data-mobile-menu-open]");
  const closeDrawer = () => {
    if (!drawer) return;
    drawer.classList.remove("is-open");
    opener?.setAttribute("aria-expanded", "false");
    document.body.classList.remove("cs-menu-open");
    setTimeout(() => { drawer.hidden = true; }, 180);
  };
  opener?.addEventListener("click", () => {
    drawer.hidden = false;
    requestAnimationFrame(() => drawer.classList.add("is-open"));
    opener.setAttribute("aria-expanded", "true");
    document.body.classList.add("cs-menu-open");
    drawer.querySelector("aside button")?.focus();
  });
  drawer?.querySelectorAll("[data-mobile-menu-close]").forEach(button => button.addEventListener("click", closeDrawer));
  if (PREVIEW_DEMO) {
    document.addEventListener("click", event => {
      const link = event.target.closest("a[href]");
      if (!link || link.target === "_blank") return;
      const next = previewUrl(link.getAttribute("href"));
      if (next) link.setAttribute("href", next);
    }, true);
  }
  document.addEventListener("keydown", event => { if (event.key === "Escape" && drawer?.classList.contains("is-open")) closeDrawer(); });
  document.addEventListener("click", event => {
    const favorite = event.target.closest("[data-product-favorite]");
    if (favorite) {
      event.preventDefault();
      commerce.toggleFavorite(favorite.dataset.productFavorite);
      return;
    }
    const add = event.target.closest("[data-product-add]");
    if (add && !add.disabled) {
      event.preventDefault();
      const quantitySource = document.querySelector(`[data-product-quantity='${CSS.escape(add.dataset.productAdd)}']`);
      commerce.add(add.dataset.productAdd, Number(quantitySource?.value || 1));
    }
  });
  addEventListener("storage", event => {
    if ([STORAGE.favorites, STORAGE.cart, STORAGE.customerProfile, STORAGE.customerToken].includes(event.key)) commerce.sync();
  });
}

export async function initShell({ active = "" } = {}) {
  document.documentElement.dataset.theme = "light";
  document.documentElement.style.colorScheme = "light";
  document.body.classList.toggle("cs-demo-mode", PREVIEW_DEMO);
  const header = document.querySelector("[data-site-header]");
  const footer = document.querySelector("[data-site-footer]");
  let filters = { categories: [], brands: [], manufacturers: [] };
  let config = { company: {}, payments: {}, shipping_methods: [] };
  try {
    [filters, config] = await Promise.all([data.filters(), data.config()]);
  } catch {
    // Shell-ul rămâne navigabil și fără configurarea API.
  }
  if (header) header.innerHTML = shellHeader(active, filters, config);
  if (footer) footer.innerHTML = shellFooter(filters, config);
  bindShellInteractions();
  bindGlobalSearch();
  commerce.sync();
  return { filters, config };
}

window.CubisShop = { api, data, commerce, money, normalizeProduct, productCard, productRoute, previewUrl, previewDemo: PREVIEW_DEMO, previewState: PREVIEW_STATE };
