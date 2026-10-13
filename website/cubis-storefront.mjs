import { normalize } from "./cubis-search-normalize.mjs";
import { commerceApiRequest, migrateHistoricalStorage, STORAGE_KEYS } from "./cubis-commerce-api.mjs";
import { bindNewsletter } from "./cubis-newsletter.mjs";

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
  "is_accessory_category", "review_count", "review_average", "view_count", "created_at",
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
    document: '<rect x="5" y="2" width="14" height="20" rx="2"></rect><path d="M9 7h6M9 12h6M9 17h6"></path>',
    card: '<rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M2 9h20M6 15h5"></path>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z"></path>',
    laptop: '<path d="M4 5h16v11H4z"></path><path d="M2 19h20M9 19h6"></path>',
    mobile: '<rect x="7" y="2" width="10" height="20" rx="2"></rect><path d="M10 5h4M11 19h2"></path>',
    monitor: '<rect x="3" y="3" width="18" height="13" rx="2"></rect><path d="M8 21h8M12 16v5"></path>',
    headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"></path><rect x="3" y="14" width="4" height="7" rx="2"></rect><rect x="17" y="14" width="4" height="7" rx="2"></rect>',
    watch: '<rect x="7" y="6" width="10" height="12" rx="3"></rect><path d="m9 6 1-4h4l1 4M9 18l1 4h4l1-4"></path>',
    home: '<path d="m3 11 9-8 9 8"></path><path d="M5 10v11h14V10M9 21v-7h6v7"></path>',
    camera: '<path d="M4 7h4l2-3h4l2 3h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"></path><circle cx="12" cy="14" r="4"></circle>',
    battery: '<rect x="3" y="6" width="16" height="12" rx="2"></rect><path d="M21 10v4M7 12h8"></path>',
    tag: '<path d="M20 3h-7L2 14l8 8L21 11V4a1 1 0 0 0-1-1Z"></path><circle cx="17" cy="7" r="1"></circle>',
    trash: '<path d="M4 7h16M9 3h6l1 4H8l1-4Z"></path><path d="m7 7 1 14h8l1-14M10 11v6M14 11v6"></path>',
    share: '<circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><path d="m8.7 10.7 6.6-4.3M8.7 13.3l6.6 4.3"></path>',
    bolt: '<path d="m13 2-9 12h8l-1 8 9-12h-8l1-8Z"></path>',
    message: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z"></path><path d="M8 9h8M8 13h5"></path>',
    whatsapp: '<path fill="currentColor" stroke="none" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.198.297-.767.966-.94 1.164-.173.198-.347.223-.644.074-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.009-.371-.011-.57-.011s-.52.074-.792.372c-.272.297-1.04 1.016-1.04 2.479s1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.262.489 1.694.626.712.227 1.36.195 1.871.118.57-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.981.998-3.646-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.894 9.891-9.894 2.641 0 5.124 1.03 6.99 2.898a9.825 9.825 0 0 1 2.9 6.994c-.003 5.45-4.447 9.893-9.897 9.893m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.3-1.654a11.88 11.88 0 0 0 5.69 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.481-8.413Z"></path>',
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
    viewCount: Number.isFinite(Number(product.view_count)) && product.view_count !== undefined && product.view_count !== null
      ? Math.max(0, Number(product.view_count)) : null,
    createdAt: String(product.created_at || ""),
    isNew: Boolean(product.is_new || product.is_new_arrival || product.new_arrival),
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

  clearCart() {
    const next = [];
    writeJson(STORAGE.cart, next);
    this.#changed("cart", next);
    return next;
  }

  #changed(type, detail) {
    this.dispatchEvent(new CustomEvent("change", { detail: { type, value: detail } }));
    document.dispatchEvent(new CustomEvent(`cubis:${type}-changed`, { detail }));
    this.sync({ animate: type === "cart" });
  }

  sync({ animate = false } = {}) {
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
      const product = this.products[button.dataset.productAdd];
      const card = button.closest("[data-product-card]");
      const cardToggle = Boolean(card);
      const unavailable = Boolean(product && !product.inStock);
      const wasActive = button.classList.contains("is-added");
      if (cardToggle) {
        button.disabled = !active && unavailable;
        button.setAttribute("aria-pressed", String(active));
        button.title = active ? "Elimină produsul din coș" : "";
      }
      button.classList.toggle("is-added", active);
      card?.classList?.toggle("is-in-cart", active);
      button.setAttribute("aria-label", active && cardToggle ? "Elimină din coș" : button.disabled ? "Produs indisponibil" : "Adaugă în coș");
      const label = button.querySelector("[data-add-label]");
      if (label) label.textContent = active ? "Adăugat în coș" : button.disabled ? "Indisponibil" : "Adaugă în coș";
      const iconHost = button.querySelector("[data-add-icon]");
      const iconName = active ? "check" : "cart";
      if (iconHost?.dataset && iconHost.dataset.addIcon !== iconName) {
        iconHost.dataset.addIcon = iconName;
        iconHost.innerHTML = icon(iconName);
      }
      if (animate && cardToggle && wasActive !== active) {
        button.classList.remove("is-cart-changing");
        void button.offsetWidth;
        button.classList.add("is-cart-changing");
      }
      if (animate && cardToggle && wasActive && !active && !button.matches?.(":focus-visible")) button.blur?.();
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
  if (Number(product?.oldPrice || 0) > Number(product?.price || 0)) {
    const discountPercent = Math.round((1 - Number(product.price) / Number(product.oldPrice)) * 100);
    if (discountPercent > 0) return `-${discountPercent}%`;
  }
  if (product?.active_promotion?.title) return String(product.active_promotion.title);
  if (product?.isNew) return "Nou";
  if (product?.featured) return "Popular";
  return "";
}

export function productCard(product, { compact = false, showDescription = false } = {}) {
  const route = productRoute(product);
  const badge = productBadge(product);
  const badgeClass = badge === "Popular" ? " is-popular" : badge.startsWith("-") ? " is-discount" : "";
  const categoryLabel = product.categoryName || product.brandNames.join(", ") || product.manufacturerName || "Catalog Cubis Shop";
  const shortDescription = String(product.short_description || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  const rating = product.rating !== null && Number.isFinite(product.rating)
    ? `<div class="cs-product-card__rating" aria-label="Rating ${product.rating.toFixed(1)} din 5">${icon("star")}<strong>${product.rating.toFixed(1)}</strong><span>(${product.reviewCount})</span></div>`
    : "";
  const addButton = placement => `<button class="cs-add-button${placement ? ` cs-add-button--${placement}` : ""}" type="button" data-product-add="${escapeHtml(product.id)}" ${product.inStock ? "" : "disabled"}><span class="cs-add-button__icon" data-add-icon="cart">${icon("cart")}</span><span data-add-label>${product.inStock ? "Adaugă în coș" : "Indisponibil"}</span></button>`;
  return `<article class="cs-product-card${compact ? " is-compact" : ""}${product.oldPrice ? " is-discounted" : ""}" data-product-card="${escapeHtml(product.id)}">
    <div class="cs-product-card__media">
      ${PREVIEW_DEMO ? `<span class="cs-demo-chip">DEMO</span>` : badge ? `<span class="cs-product-badge${badgeClass}">${escapeHtml(badge)}</span>` : ""}
      ${PREVIEW_DEMO && badge ? `<span class="cs-product-badge is-secondary${badgeClass}">${escapeHtml(badge)}</span>` : ""}
      <button class="cs-icon-button cs-product-card__favorite" type="button" data-product-favorite="${escapeHtml(product.id)}" aria-label="Adaugă la favorite" aria-pressed="false">${icon("heart")}</button>
      <a href="${route}" aria-label="Vezi ${escapeHtml(product.name)}">
        ${product.imageUrl ? `<img class="cs-product-card__image-backdrop" src="${escapeHtml(product.imageUrl)}" alt="" aria-hidden="true" loading="${PREVIEW_DEMO ? "eager" : "lazy"}" decoding="async" width="360" height="300"><img class="cs-product-card__image" src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" loading="${PREVIEW_DEMO ? "eager" : "lazy"}" decoding="async" width="360" height="300">` : `<span class="cs-product-placeholder">${icon("package")}</span>`}
      </a>
      ${showDescription ? addButton("media") : ""}
    </div>
    <div class="cs-product-card__body">
      ${showDescription ? `<p class="cs-product-card__compatibility">${escapeHtml(categoryLabel)}</p>` : ""}
      <a class="cs-product-card__title" href="${route}">${escapeHtml(product.name)}</a>
      ${showDescription && shortDescription ? `<p class="cs-product-card__description">${escapeHtml(shortDescription)}</p>` : ""}
      ${showDescription ? "" : `<p class="cs-product-card__compatibility">${escapeHtml(categoryLabel)}</p>`}
      ${rating}
      <div class="cs-product-card__price"><strong>${escapeHtml(money(product.price, product.currency))}</strong>${product.oldPrice ? `<del>${escapeHtml(money(product.oldPrice, product.currency))}</del>` : ""}</div>
      ${addButton(showDescription ? "body" : "")}
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

function categoryIdentity(category) {
  return String(category?.id || category?.slug || category?.name || "");
}

function categoryRoute(category) {
  return previewUrl(`/magazin?category=${encodeURIComponent(categoryIdentity(category))}#catalog`);
}

function categoryTree(rows) {
  const categories = (Array.isArray(rows) ? rows : []).filter(category => category && categoryIdentity(category));
  const nodes = new Map(categories.map(category => [categoryIdentity(category), { category, children: [] }]));
  const roots = [];
  nodes.forEach(node => {
    const parentId = String(node.category.parent_id || "");
    const parent = parentId && parentId !== categoryIdentity(node.category) ? nodes.get(parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });
  return roots;
}

function desktopCategoryBranch(nodes, depth = 0, ancestry = new Set()) {
  if (!nodes.length || depth > 10) return "";
  return `<ul class="cs-category-flyout${depth ? " is-submenu" : ""}" role="menu" data-category-depth="${depth}">${nodes.map(node => {
    const id = categoryIdentity(node.category);
    if (ancestry.has(id)) return "";
    const nextAncestry = new Set(ancestry).add(id);
    const children = node.children.filter(child => !nextAncestry.has(categoryIdentity(child.category)));
    return `<li class="${children.length ? "has-children" : ""}" role="none"><a role="menuitem" href="${categoryRoute(node.category)}"><span>${escapeHtml(node.category.name)}</span>${children.length ? icon("chevron") : ""}</a>${desktopCategoryBranch(children, depth + 1, nextAncestry)}</li>`;
  }).join("")}</ul>`;
}

function mobileCategoryBranch(nodes, depth = 0, ancestry = new Set(), branchId = "") {
  if (!nodes.length || depth > 10) return "";
  return `<ul class="cs-mobile-category-list${depth ? " is-submenu" : ""}"${branchId ? ` id="${escapeHtml(branchId)}"` : ""} ${depth ? "hidden" : ""}>${nodes.map(node => {
    const id = categoryIdentity(node.category);
    if (ancestry.has(id)) return "";
    const nextAncestry = new Set(ancestry).add(id);
    const children = node.children.filter(child => !nextAncestry.has(categoryIdentity(child.category)));
    const submenuId = `cs-mobile-category-${depth}-${encodeURIComponent(id)}`;
    const rawThumbnail = String(node.category.thumbnail_url || "").trim();
    const thumbnail = rawThumbnail ? safeUrl(rawThumbnail) : "";
    return `<li><div class="cs-mobile-category-row"><a href="${categoryRoute(node.category)}">${thumbnail ? `<span class="cs-mobile-category-image"><img src="${escapeHtml(thumbnail)}" alt="" width="40" height="40" loading="lazy" data-mobile-category-image></span>` : ""}<span>${escapeHtml(node.category.name)}</span>${children.length ? "" : icon("chevron", "cs-mobile-category-leaf-chevron")}</a>${children.length ? `<button type="button" data-mobile-category-toggle aria-expanded="false" aria-controls="${escapeHtml(submenuId)}" aria-label="Arată subcategoriile pentru ${escapeHtml(node.category.name)}">${icon("chevron")}</button>` : ""}</div>${mobileCategoryBranch(children, depth + 1, nextAncestry, submenuId)}</li>`;
  }).join("")}</ul>`;
}

function shellHeader(active, filters, config) {
  const categoryRoots = categoryTree(filters?.categories);
  const customer = readJson(STORAGE.customerProfile, null);
  const favoritesHref = "/favorite";
  return `<a class="cs-skip-link" href="#main">Sari la conținut</a>
    ${PREVIEW_DEMO ? `<div class="cs-demo-banner" role="status"><strong>PREVIEW DEMO</strong><span>Date locale izolate · ${PREVIEW_STATE === "full" ? "catalog complet" : PREVIEW_STATE === "one" ? "un produs" : PREVIEW_STATE === "empty" ? "catalog gol" : "eroare simulată"}</span><a href="${previewUrl("/?previewState=full")}">Homepage</a><a href="${previewUrl("/magazin?previewState=full")}">Magazin</a></div>` : ""}
    <header class="cs-header">
      <div class="cs-container cs-header__main">
        <button class="cs-mobile-menu" type="button" data-mobile-menu-open aria-label="Deschide meniul" aria-expanded="false" aria-haspopup="dialog" aria-controls="cs-mobile-menu-panel">${icon("menu")}</button>
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
          <a href="${favoritesHref}" class="cs-nav-badge">${icon("heart")}<span>Favorite</span><b data-favorite-count hidden>0</b></a>
          <a href="/cos" class="cs-nav-badge">${icon("cart")}<span>Coș</span><b data-cart-count hidden>0</b></a>
        </nav>
      </div>
      <div class="cs-category-bar"><nav class="cs-container" aria-label="Categorii principale">
        <div class="cs-category-menu">
          <a class="cs-all-categories" href="${previewUrl("/magazin#catalog")}" aria-haspopup="true">${icon("menu")}<span>Toate categoriile</span>${icon("chevron", "cs-category-bar__chevron")}</a>
          ${desktopCategoryBranch(categoryRoots)}
        </div>
        <div class="cs-primary-categories">${categoryRoots.map(({ category }) => `<a href="${categoryRoute(category)}"><span>${escapeHtml(category.name)}</span></a>`).join("")}</div>
      </nav></div>
    </header>
    <div class="cs-mobile-drawer" data-mobile-drawer hidden>
      <button class="cs-mobile-drawer__scrim" type="button" data-mobile-menu-close aria-label="Închide meniul" tabindex="-1"></button>
      <aside id="cs-mobile-menu-panel" role="dialog" aria-modal="true" aria-labelledby="cs-mobile-menu-title" tabindex="-1">
        <div class="cs-mobile-drawer__head"><a class="cs-mobile-drawer__brand" href="/" aria-label="Cubis Shop — Acasă"><img src="/assets/cubis-shop-icon.png" alt="" width="42" height="42"><span><b>Cubis</b> Shop</span><small>TOT CE AI NEVOIE, ZI DE ZI</small></a><button type="button" data-mobile-menu-close aria-label="Închide meniul">${icon("close")}</button></div>
        <div class="cs-mobile-drawer__scroll" data-mobile-menu-scroll>
          <h2 id="cs-mobile-menu-title">Toate categoriile</h2>
          <nav class="cs-mobile-categories" aria-label="Categorii produse"><a class="cs-mobile-categories__all" href="${previewUrl("/magazin#catalog")}">${icon("grid")}<span>Toate produsele</span>${icon("chevron")}</a>${mobileCategoryBranch(categoryRoots)}</nav>
          <nav class="cs-mobile-drawer__quick" aria-label="Cont și cumpărături"><a href="${customer ? "/cont" : "/login"}">${icon("user")}<span>Contul meu</span></a><a href="${favoritesHref}">${icon("heart")}<span>Favorite</span></a><a href="/cos">${icon("cart")}<span>Coș</span></a></nav>
          <nav class="cs-mobile-drawer__support" aria-label="Linkuri utile"><a href="/urmarire-comanda">${icon("package")}<span>Urmărire comandă</span>${icon("chevron")}</a><a href="/contact">${icon("headset")}<span>Contact</span>${icon("chevron")}</a><a href="${previewUrl("/#newsletter-title")}">${icon("mail")}<span>Newsletter</span>${icon("chevron")}</a></nav>
          <a class="cs-mobile-drawer__newsletter" href="${previewUrl("/#newsletter-title")}">${icon("tag")}<span>Oferte și noutăți direct în inbox<small>Abonează-te la newsletter</small></span>${icon("chevron")}</a>
        </div>
      </aside>
    </div>`;
}

function shellFooter(filters, config) {
  const categories = Array.isArray(filters?.categories) ? filters.categories.filter(category => !category.parent_id).slice(0, 6) : [];
  const company = cleanCompany(config?.company);
  const designer = `<a class="cs-footer__designer" href="https://cab-it.ro/" target="_blank" rel="noopener noreferrer" aria-label="Designed by cab-it.ro — deschide într-o filă nouă"><span>Designed by <b>cab-it.ro</b></span><img src="/assets/cab-it-original.png" alt="Logo CAB-IT" width="42" height="42" loading="lazy"></a>`;
  return `<footer class="cs-footer">
    <div class="cs-container cs-footer__grid">
      <div class="cs-footer__brand">
        <a class="cs-brand is-footer" href="/" aria-label="Cubis Shop — Acasă"><img src="/assets/cubis-shop-icon.png" alt="" width="84" height="84" loading="lazy"><span><b>Cubis</b> <em>Shop</em></span></a>
        ${designer}
        <p class="cs-footer__description">Produse utile pentru o viață<br>mai simplă, acasă și în mișcare.</p>
        <a class="cs-footer__anpc" href="https://anpc.ro/sal/" target="_blank" rel="noopener noreferrer" aria-label="ANPC — Soluționarea alternativă a litigiilor, deschide într-o filă nouă"><img src="/assets/anpc-sal.png" alt="ANPC — Soluționarea alternativă a litigiilor — SAL" width="201" height="50" loading="lazy"></a>
        ${company.legalName || company.address ? `<small class="cs-footer__legal">${escapeHtml(company.legalName)}${company.address ? `<br>${escapeHtml(company.address)}` : ""}</small>` : ""}
      </div>
      <details class="cs-footer__section" data-footer-section open><summary>${icon("document")}<h2>Informații</h2>${icon("chevron", "cs-footer__chevron")}</summary><div class="cs-footer__links"><a href="/livrare-si-plata">Livrare și plată</a><a href="/politica-de-retur">Retururi</a><a href="/termeni-si-conditii">Termeni și condiții</a><a href="/politica-de-confidentialitate">Confidențialitate</a><a href="/contact">Contact</a></div></details>
      <details class="cs-footer__section" data-footer-section open><summary>${icon("grid")}<h2>Categorii</h2>${icon("chevron", "cs-footer__chevron")}</summary><div class="cs-footer__links">${categories.map(category => `<a href="/magazin?category=${encodeURIComponent(category.id || category.slug)}">${escapeHtml(category.name)}</a>`).join("") || `<a href="/magazin">Vezi catalogul</a>`}</div></details>
      <details class="cs-footer__section" data-footer-section open><summary>${icon("headset")}<h2>Suport clienți</h2>${icon("chevron", "cs-footer__chevron")}</summary><div class="cs-footer__links"><a href="/urmarire-comanda">Urmărire comandă</a><a href="/solicita-retur">Solicită retur</a><a href="/garantii-si-reclamatii">Garanții și reclamații</a>${company.email ? `<a class="cs-footer__contact" href="mailto:${escapeHtml(company.email)}">${icon("mail")} ${escapeHtml(company.email)}</a>` : ""}${company.phone ? `<a class="cs-footer__contact" href="tel:${escapeHtml(company.phone.replace(/[^+\d]/g, ""))}">${icon("phone")} ${escapeHtml(company.phone)}</a>` : ""}</div></details>
      <details class="cs-footer__section cs-footer__section--security" data-footer-section open><summary>${icon("shield")}<h2>Magazin online sigur</h2>${icon("chevron", "cs-footer__chevron")}</summary><div class="cs-footer__security"><div class="cs-footer__assurance"><span>${icon("card")}</span><div><h3>Plăți procesate securizat</h3><p>Tranzacții sigure, parteneri de încredere.</p></div></div><div class="cs-footer__assurance"><span>${icon("lock")}</span><div><h3>Date protejate</h3><p>Confidențialitatea ta este prioritatea noastră.</p></div></div><a href="/politica-cookies" data-cookie-settings>Preferințe cookie</a></div></details>
    </div>
    <div class="cs-footer__bottom"><div class="cs-container"><span>© ${new Date().getFullYear()} Cubis Shop. Toate drepturile rezervate.</span>${designer}</div></div>
  </footer>`;
}

function bindFooterSections() {
  const sections = [...document.querySelectorAll("[data-footer-section]")];
  if (!sections.length) return;
  const mobile = window.matchMedia("(max-width: 768px)");
  const adaptSections = () => sections.forEach(section => {
    section.open = !mobile.matches || section.classList.contains("cs-footer__section--security");
    section.querySelector("summary").tabIndex = mobile.matches ? 0 : -1;
  });
  sections.forEach(section => section.querySelector("summary").addEventListener("click", event => {
    if (!mobile.matches) event.preventDefault();
  }));
  mobile.addEventListener("change", adaptSections);
  adaptSections();
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

function bindMobileDrawer() {
  const drawer = document.querySelector("[data-mobile-drawer]");
  const opener = document.querySelector("[data-mobile-menu-open]");
  const panel = drawer?.querySelector("aside");
  if (!drawer || !opener || !panel) return;
  const desktop = window.matchMedia("(min-width: 901px)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let closeTimer;
  let backgroundState = [];
  const closeDrawer = ({ restoreFocus = true, afterClose } = {}) => {
    clearTimeout(closeTimer);
    drawer.classList.remove("is-open");
    opener.setAttribute("aria-expanded", "false");
    document.body.classList.remove("cs-menu-open");
    backgroundState.forEach(({ node, inert }) => { node.inert = inert; });
    backgroundState = [];
    if (restoreFocus) opener.focus({ preventScroll: true });
    closeTimer = setTimeout(() => {
      drawer.hidden = true;
      afterClose?.();
    }, reducedMotion.matches ? 0 : 250);
  };
  opener.addEventListener("click", () => {
    if (desktop.matches) return;
    clearTimeout(closeTimer);
    drawer.hidden = false;
    opener.setAttribute("aria-expanded", "true");
    document.body.classList.add("cs-menu-open");
    backgroundState = [...document.querySelectorAll(".cs-header, .cs-skip-link, main, [data-site-footer]")].map(node => ({ node, inert: node.inert }));
    backgroundState.forEach(({ node }) => { node.inert = true; });
    requestAnimationFrame(() => {
      if (opener.getAttribute("aria-expanded") !== "true") return;
      drawer.classList.add("is-open");
      panel.querySelector("[data-mobile-menu-close]")?.focus({ preventScroll: true });
    });
  });
  drawer.querySelectorAll("[data-mobile-menu-close]").forEach(button => button.addEventListener("click", () => closeDrawer()));
  drawer.querySelectorAll("[data-mobile-category-toggle]").forEach(button => button.addEventListener("click", () => {
    const submenu = button.closest("li")?.querySelector(":scope > .cs-mobile-category-list");
    if (!submenu) return;
    const expanded = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!expanded));
    button.closest(".cs-mobile-category-row")?.classList.toggle("is-expanded", !expanded);
    submenu.hidden = expanded;
  }));
  drawer.querySelectorAll("[data-mobile-category-image]").forEach(image => {
    const removeUnavailableImage = () => image.closest(".cs-mobile-category-image")?.remove();
    image.addEventListener("error", removeUnavailableImage, { once: true });
    if (image.complete && !image.naturalWidth) removeUnavailableImage();
  });
  panel.addEventListener("click", event => {
    const link = event.target.closest("a[href]");
    if (!link || event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const href = link.href;
    event.preventDefault();
    closeDrawer({ restoreFocus: false, afterClose: () => { location.href = href; } });
  });
  document.addEventListener("keydown", event => {
    if (!drawer.classList.contains("is-open")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeDrawer();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...panel.querySelectorAll('a[href], button:not([disabled]), [tabindex="0"]')].filter(node => !node.closest("[hidden]") && node.getClientRects().length);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first) return;
    if (!panel.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  desktop.addEventListener("change", () => {
    if (desktop.matches && !drawer.hidden) closeDrawer({ restoreFocus: false });
  });
}

function bindShellInteractions() {
  bindMobileDrawer();
  if (PREVIEW_DEMO) {
    document.addEventListener("click", event => {
      const link = event.target.closest("a[href]");
      if (!link || link.target === "_blank") return;
      const next = previewUrl(link.getAttribute("href"));
      if (next) link.setAttribute("href", next);
    }, true);
  }
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
      if (add.closest("[data-product-card]")) {
        commerce.toggleCart(add.dataset.productAdd);
        return;
      }
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
  bindFooterSections();
  bindShellInteractions();
  bindGlobalSearch();
  bindNewsletter({ previewDemo: PREVIEW_DEMO });
  commerce.sync();
  return { filters, config };
}

window.CubisShop = { api, data, commerce, money, normalizeProduct, productCard, productRoute, previewUrl, previewDemo: PREVIEW_DEMO, previewState: PREVIEW_STATE };
