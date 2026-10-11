import { commerce, data, escapeHtml, icon, initShell, money, previewUrl, productCard } from "./cubis-storefront.mjs";
import { normalize, trigrams } from "./cubis-search-normalize.mjs";

const state = {
  products: [],
  filters: { categories: [], brands: [], manufacturers: [] },
  query: "",
  categories: new Set(),
  brands: new Set(),
  manufacturers: new Set(),
  availability: new Set(),
  min: 0,
  max: Infinity,
  priceCeiling: 1000,
  sort: "recommended",
  page: 1,
  pageSize: 12,
};

const shellPromise = initShell({ active: "catalog" });

function identity(row) {
  return String(row?.id || row?.slug || row?.name || "");
}

function countBy(rows, getter) {
  const counts = new Map();
  rows.forEach(row => {
    const values = Array.isArray(getter(row)) ? getter(row) : [getter(row)];
    values.filter(Boolean).forEach(value => counts.set(String(value), (counts.get(String(value)) || 0) + 1));
  });
  return counts;
}

function filterOption(name, value, label, count, checked = false) {
  return `<label><input type="checkbox" name="${name}" value="${escapeHtml(value)}" ${checked ? "checked" : ""}><span>${escapeHtml(label)}</span><b>${Number(count || 0)}</b></label>`;
}

function renderCategoryTabs() {
  const host = document.querySelector("[data-catalog-categories]");
  const categories = state.filters.categories.filter(row => !row.parent_id).slice(0, 5);
  host.innerHTML = categories.map(category => `<button type="button" data-category-tab="${escapeHtml(identity(category))}" class="${state.categories.has(identity(category)) ? "is-active" : ""}">${icon("package")}<span>${escapeHtml(category.name)}</span></button>`).join("");
}

function renderFilterGroups() {
  const categoryCounts = countBy(state.products, product => [String(product.category_id || ""), String(product.categorySlug || "")]);
  const brandCounts = countBy(state.products, product => (product.brands || []).flatMap(brand => [String(brand.id || ""), String(brand.slug || "")]).filter(Boolean));
  const manufacturerCounts = countBy(state.products, product => [String(product.manufacturer_id || ""), String(product.manufacturer_slug || "")]);
  const categoryHost = document.querySelector("[data-filter-categories]");
  const brandHost = document.querySelector("[data-filter-brands]");
  const manufacturerHost = document.querySelector("[data-filter-manufacturers]");
  categoryHost.innerHTML = state.filters.categories.length
    ? state.filters.categories.map(row => filterOption("category", identity(row), row.name, categoryCounts.get(identity(row)), state.categories.has(identity(row)))).join("")
    : `<p class="cs-filter-empty">Nu există categorii publice.</p>`;
  brandHost.innerHTML = state.filters.brands.length
    ? state.filters.brands.map(row => filterOption("brand", identity(row), row.name, brandCounts.get(identity(row)), state.brands.has(identity(row)))).join("")
    : `<p class="cs-filter-empty">Nu există branduri publice.</p>`;
  manufacturerHost.innerHTML = state.filters.manufacturers.length
    ? state.filters.manufacturers.map(row => filterOption("manufacturer", identity(row), row.name, manufacturerCounts.get(identity(row)), state.manufacturers.has(identity(row)))).join("")
    : `<p class="cs-filter-empty">Nu există producători publici.</p>`;
  document.querySelector("[data-count-in-stock]").textContent = String(state.products.filter(product => product.inStock).length);
  document.querySelector("[data-count-out-stock]").textContent = String(state.products.filter(product => !product.inStock).length);
}

function trigramSimilarity(left, right) {
  const first = new Set(trigrams(left));
  const second = new Set(trigrams(right));
  if (!first.size || !second.size) return 0;
  let overlap = 0;
  first.forEach(value => { if (second.has(value)) overlap += 1; });
  return overlap / Math.sqrt(first.size * second.size);
}

function searchScore(product, rawQuery) {
  const query = normalize(rawQuery);
  if (!query) return 1;
  const name = normalize(product.name);
  const sku = normalize(product.sku);
  const text = normalize([product.name, product.sku, product.categoryName, product.manufacturerName, product.brandNames.join(" "), product.short_description].join(" "));
  let score = 0;
  if (sku === query) score += 1000;
  if (name === query) score += 900;
  if (name.startsWith(query)) score += 420;
  if (name.includes(query)) score += 260;
  if (text.includes(query)) score += 160;
  const tokens = query.split(" ").filter(token => token.length > 1);
  score += tokens.reduce((total, token) => total + (text.includes(token) ? 30 : 0), 0);
  score += trigramSimilarity(query, text) * 120;
  return score;
}

function matchesSet(set, values) {
  if (!set.size) return true;
  return values.some(value => set.has(String(value || "")));
}

function filteredRows() {
  const rows = state.products.map(product => ({ product, search: searchScore(product, state.query) })).filter(({ product, search }) => {
    if (state.query && search <= 0) return false;
    if (!matchesSet(state.categories, [product.category_id, product.categorySlug])) return false;
    if (!matchesSet(state.brands, (product.brands || []).flatMap(brand => [brand.id, brand.slug, brand.name]))) return false;
    if (!matchesSet(state.manufacturers, [product.manufacturer_id, product.manufacturer_slug, product.manufacturerName])) return false;
    if (state.availability.has("in_stock") && !product.inStock) return false;
    if (state.availability.has("out_of_stock") && product.inStock) return false;
    if (product.price < state.min || product.price > state.max) return false;
    return true;
  });
  rows.sort((first, second) => {
    if (state.sort === "price_asc") return first.product.price - second.product.price;
    if (state.sort === "price_desc") return second.product.price - first.product.price;
    if (state.sort === "name_asc") return first.product.name.localeCompare(second.product.name, "ro");
    if (state.sort === "rating_desc") return (second.product.rating || 0) - (first.product.rating || 0);
    if (state.query) return second.search - first.search;
    return Number(second.product.inStock) - Number(first.product.inStock)
      || Number(second.product.featured) - Number(first.product.featured)
      || Number(first.product.featured_rank ?? Number.MAX_SAFE_INTEGER) - Number(second.product.featured_rank ?? Number.MAX_SAFE_INTEGER);
  });
  return rows.map(row => row.product);
}

function activeFilterCount() {
  return state.categories.size + state.brands.size + state.manufacturers.size + state.availability.size + Number(Boolean(state.query)) + Number(state.min > 0) + Number(state.max < state.priceCeiling);
}

function renderChips() {
  const host = document.querySelector("[data-active-filters]");
  const definitions = [
    ["category", state.categories, state.filters.categories],
    ["brand", state.brands, state.filters.brands],
    ["manufacturer", state.manufacturers, state.filters.manufacturers],
  ];
  const chips = [];
  definitions.forEach(([type, selected, rows]) => selected.forEach(value => {
    const row = rows.find(item => identity(item) === value);
    chips.push(`<button type="button" data-remove-filter="${type}" data-value="${escapeHtml(value)}">${escapeHtml(row?.name || value)} ×</button>`);
  }));
  state.availability.forEach(value => chips.push(`<button type="button" data-remove-filter="availability" data-value="${value}">${value === "in_stock" ? "În stoc" : "Stoc epuizat"} ×</button>`));
  if (state.query) chips.push(`<button type="button" data-remove-filter="query">Căutare: ${escapeHtml(state.query)} ×</button>`);
  if (state.min > 0 || state.max < state.priceCeiling) chips.push(`<button type="button" data-remove-filter="price">${escapeHtml(money(state.min))} – ${escapeHtml(money(state.max))} ×</button>`);
  if (chips.length) chips.push(`<button class="is-reset" type="button" data-reset-filters>Resetează toate filtrele</button>`);
  host.innerHTML = chips.join("");
  const mobileCount = document.querySelector("[data-mobile-filter-count]");
  mobileCount.textContent = String(activeFilterCount());
  mobileCount.hidden = activeFilterCount() === 0;
}

function paginationSequence(pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const pages = new Set([1, pageCount, state.page - 1, state.page, state.page + 1].filter(page => page >= 1 && page <= pageCount));
  const sorted = [...pages].sort((a, b) => a - b);
  const output = [];
  sorted.forEach((page, index) => {
    if (index && page - sorted[index - 1] > 1) output.push("…");
    output.push(page);
  });
  return output;
}

function renderCatalog({ scroll = false } = {}) {
  const rows = filteredRows();
  const pageCount = Math.max(1, Math.ceil(rows.length / state.pageSize));
  state.page = Math.min(state.page, pageCount);
  const start = (state.page - 1) * state.pageSize;
  const visible = rows.slice(start, start + state.pageSize);
  const grid = document.querySelector("[data-catalog-grid]");
  grid.innerHTML = visible.length
    ? visible.map(product => productCard(product)).join("")
    : `<div class="cs-empty-state">${icon("search")}<strong>Nu am găsit produse</strong><p>Elimină unul dintre filtre sau încearcă o căutare mai generală.</p><button type="button" data-reset-filters>Resetează filtrele</button></div>`;
  const range = document.querySelector("[data-results-range]");
  range.textContent = rows.length ? `${start + 1}–${Math.min(start + state.pageSize, rows.length)} din ${rows.length} produse` : "0 produse";
  const pager = document.querySelector("[data-catalog-pagination]");
  pager.innerHTML = `<button type="button" data-page="${state.page - 1}" ${state.page <= 1 ? "disabled" : ""} aria-label="Pagina anterioară">‹</button>${paginationSequence(pageCount).map(page => page === "…" ? `<span>…</span>` : `<button type="button" data-page="${page}" class="${page === state.page ? "is-active" : ""}" ${page === state.page ? 'aria-current="page"' : ""}>${page}</button>`).join("")}<button type="button" data-page="${state.page + 1}" ${state.page >= pageCount ? "disabled" : ""} aria-label="Pagina următoare">›</button>`;
  renderChips();
  renderCategoryTabs();
  commerce.sync();
  if (scroll) document.querySelector("[data-catalog-grid]")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}

function syncFromControls() {
  const panel = document.querySelector("[data-filter-panel]");
  state.categories = new Set([...panel.querySelectorAll('input[name="category"]:checked')].map(input => input.value));
  state.brands = new Set([...panel.querySelectorAll('input[name="brand"]:checked')].map(input => input.value));
  state.manufacturers = new Set([...panel.querySelectorAll('input[name="manufacturer"]:checked')].map(input => input.value));
  state.availability = new Set([...panel.querySelectorAll('input[name="availability"]:checked')].map(input => input.value));
  state.min = Math.max(0, Number(panel.querySelector('[name="price_min"]').value || 0));
  state.max = Math.max(state.min, Number(panel.querySelector('[name="price_max"]').value || state.priceCeiling));
  state.page = 1;
  renderCatalog();
}

function resetFilters() {
  state.query = "";
  state.categories.clear(); state.brands.clear(); state.manufacturers.clear(); state.availability.clear();
  state.min = 0; state.max = state.priceCeiling; state.page = 1;
  document.querySelectorAll("[data-filter-panel] input[type='checkbox']").forEach(input => { input.checked = false; });
  document.querySelector('[name="price_min"]').value = "0";
  document.querySelector('[name="price_max"]').value = String(state.priceCeiling);
  document.querySelector('[name="price_range"]').value = String(state.priceCeiling);
  history.replaceState(null, "", previewUrl("/magazin#catalog"));
  renderCatalog();
}

function bindFilters() {
  const panel = document.querySelector("[data-filter-panel]");
  panel.addEventListener("change", event => {
    if (event.target.name === "price_range") {
      panel.querySelector('[name="price_max"]').value = event.target.value;
    }
    syncFromControls();
  });
  panel.addEventListener("input", event => {
    if (["price_min", "price_max", "price_range"].includes(event.target.name)) syncFromControls();
  });
  document.addEventListener("click", event => {
    const reset = event.target.closest("[data-reset-filters]");
    if (reset) { event.preventDefault(); resetFilters(); return; }
    const remove = event.target.closest("[data-remove-filter]");
    if (remove) {
      const type = remove.dataset.removeFilter;
      if (type === "query") state.query = "";
      else if (type === "price") { state.min = 0; state.max = state.priceCeiling; panel.querySelector('[name="price_min"]').value = 0; panel.querySelector('[name="price_max"]').value = state.priceCeiling; panel.querySelector('[name="price_range"]').value = state.priceCeiling; }
      else {
        state[`${type}${type === "availability" ? "" : "s"}`]?.delete(remove.dataset.value);
        const input = panel.querySelector(`input[name='${type}'][value='${CSS.escape(remove.dataset.value || "")}']`);
        if (input) input.checked = false;
      }
      state.page = 1; renderCatalog(); return;
    }
    const page = event.target.closest("[data-page]");
    if (page && !page.disabled) { state.page = Number(page.dataset.page); renderCatalog({ scroll: true }); return; }
    const tab = event.target.closest("[data-category-tab]");
    if (tab) {
      state.categories.clear();
      if (tab.dataset.categoryTab) state.categories.add(tab.dataset.categoryTab);
      panel.querySelectorAll('input[name="category"]').forEach(input => { input.checked = state.categories.has(input.value); });
      state.page = 1; renderCatalog({ scroll: true });
    }
  });
  document.querySelector("[data-catalog-sort]").addEventListener("change", event => { state.sort = event.target.value; state.page = 1; renderCatalog(); });
  document.querySelector("[data-page-size]").addEventListener("change", event => { state.pageSize = Number(event.target.value || 12); state.page = 1; renderCatalog(); });
}

function bindFilterDrawer() {
  const panel = document.querySelector("[data-filter-panel]");
  const scrim = document.querySelector("[data-filter-scrim]");
  const open = () => { panel.classList.add("is-open"); scrim.hidden = false; requestAnimationFrame(() => scrim.classList.add("is-open")); document.body.classList.add("cs-filter-open"); panel.querySelector("[data-filter-close]")?.focus(); };
  const close = () => { panel.classList.remove("is-open"); scrim.classList.remove("is-open"); document.body.classList.remove("cs-filter-open"); setTimeout(() => { scrim.hidden = true; }, 180); };
  document.querySelector("[data-filter-open]").addEventListener("click", open);
  document.querySelectorAll("[data-filter-close]").forEach(button => button.addEventListener("click", close));
  document.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
}

function optionMarkup(rows, placeholder) {
  return `<option value="">${placeholder}</option>${rows.map(row => `<option value="${escapeHtml(identity(row))}">${escapeHtml(row.name)}</option>`).join("")}`;
}

function bindCompatibility() {
  const form = document.querySelector("[data-catalog-compatibility]");
  const category = form.elements.category;
  const brand = form.elements.brand;
  const manufacturer = form.elements.manufacturer;
  category.innerHTML = optionMarkup(state.filters.categories, "Selectează categoria");
  const update = () => {
    const categoryProducts = state.products.filter(product => !category.value || [product.category_id, product.categorySlug].map(String).includes(category.value));
    const brandRows = [...new Map(categoryProducts.flatMap(product => product.brands || []).map(row => [identity(row), row])).values()].filter(row => identity(row));
    brand.innerHTML = optionMarkup(brandRows, brandRows.length ? "Selectează marca" : "Nu există mărci disponibile"); brand.disabled = !brandRows.length;
    const manufacturerRows = state.filters.manufacturers.filter(row => categoryProducts.some(product => [product.manufacturer_id, product.manufacturer_slug].map(String).includes(identity(row))) && (!brand.value || categoryProducts.some(product => (product.brands || []).some(row => identity(row) === brand.value))));
    manufacturer.innerHTML = optionMarkup(manufacturerRows, manufacturerRows.length ? "Selectează producătorul" : "Nu există producători disponibili"); manufacturer.disabled = !manufacturerRows.length;
  };
  category.addEventListener("change", update); brand.addEventListener("change", update);
  form.addEventListener("submit", event => {
    event.preventDefault();
    state.categories = new Set(category.value ? [category.value] : []);
    state.brands = new Set(brand.value ? [brand.value] : []);
    state.manufacturers = new Set(manufacturer.value ? [manufacturer.value] : []);
    document.querySelectorAll("[data-filter-panel] input[type='checkbox']").forEach(input => { input.checked = state[input.name === "availability" ? "availability" : `${input.name}s`]?.has(input.value) || false; });
    state.page = 1; renderCatalog({ scroll: true });
  });
}

function applyUrlState() {
  const params = new URLSearchParams(location.search);
  state.query = params.get("q") || "";
  ["category", "brand", "manufacturer"].forEach(name => { const value = params.get(name); if (value) state[`${name}s`].add(value); });
  if (params.get("sort")) state.sort = params.get("sort");
  document.querySelector("[data-catalog-sort]").value = state.sort;
}

async function initialize() {
  document.querySelector("[data-assistance-icon]").innerHTML = icon("user");
  document.querySelector("[data-filter-icon]").innerHTML = icon("filter");
  document.querySelectorAll("[data-catalog-trust]").forEach(node => { node.innerHTML = icon(node.dataset.catalogTrust); });
  try {
    const [{ filters }, products] = await Promise.all([shellPromise, data.catalog()]);
    state.filters = filters;
    state.products = products;
    const prices = products.map(product => product.price).filter(Number.isFinite);
    state.priceCeiling = Math.max(1, Math.ceil(Math.max(...prices, 100) / 10) * 10);
    state.max = state.priceCeiling;
    const panel = document.querySelector("[data-filter-panel]");
    panel.querySelector('[name="price_min"]').value = "0";
    panel.querySelector('[name="price_max"]').value = String(state.priceCeiling);
    panel.querySelector('[name="price_range"]').max = String(state.priceCeiling);
    panel.querySelector('[name="price_range"]').value = String(state.priceCeiling);
    applyUrlState();
    renderFilterGroups();
    bindFilters();
    bindFilterDrawer();
    bindCompatibility();
    panel.querySelectorAll("input[type='checkbox']").forEach(input => { input.checked = state[input.name === "availability" ? "availability" : `${input.name}s`]?.has(input.value) || false; });
    renderCatalog();
  } catch (error) {
    document.querySelector("[data-catalog-categories]").innerHTML = `<div class="cs-empty-state">Categoriile nu sunt disponibile momentan.</div>`;
    document.querySelector("[data-catalog-grid]").innerHTML = `<div class="cs-empty-state">${icon("info")}<strong>Catalogul nu a putut fi încărcat</strong><p>${escapeHtml(error.message)}</p><button type="button" onclick="location.reload()">Încearcă din nou</button></div>`;
  }
}

initialize();
