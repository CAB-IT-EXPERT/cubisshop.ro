import { commerce, data, escapeHtml, icon, initShell, money, previewUrl, productCard, safeUrl } from "./cubis-storefront.mjs?v=20261012-compact-actions";
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
  pageSize: 25,
};

const shellPromise = initShell({ active: "catalog" });

function identity(row) {
  return String(row?.id || row?.slug || row?.name || "");
}

function filterSet(name) {
  return { category: state.categories, brand: state.brands, manufacturer: state.manufacturers, availability: state.availability }[name];
}

function countBy(rows, getter) {
  const counts = new Map();
  rows.forEach(row => {
    const values = Array.isArray(getter(row)) ? getter(row) : [getter(row)];
    values.filter(Boolean).forEach(value => counts.set(String(value), (counts.get(String(value)) || 0) + 1));
  });
  return counts;
}

function filterOption(name, value, label, count, checked = false, depth = 0) {
  const safeDepth = Math.max(0, Number(depth || 0));
  return `<label class="${safeDepth ? "is-child" : "is-root"}" style="--filter-depth:${safeDepth}"><input type="checkbox" name="${name}" value="${escapeHtml(value)}" ${checked ? "checked" : ""}><span>${escapeHtml(label)}</span><b>${Number(count || 0)}</b></label>`;
}

function categoryDepth(category) {
  const byId = new Map(state.filters.categories.map(row => [identity(row), row]));
  let depth = 0;
  let current = category;
  const visited = new Set();
  while (current?.parent_id && !visited.has(String(current.parent_id)) && depth < 5) {
    visited.add(String(current.parent_id));
    current = byId.get(String(current.parent_id));
    depth += 1;
  }
  return depth;
}

function quickCategoryRows() {
  return state.filters.categories.filter(category => !category.parent_id);
}

const unavailableCategoryImages = new Set();

function categoryImageUrl(category) {
  const raw = String(category?.thumbnail_url || "").trim();
  const image = raw ? safeUrl(raw) : "";
  return image && !unavailableCategoryImages.has(image) ? image : "";
}

function categoryProductCount(category) {
  const rows = state.filters.categories || [];
  const ids = new Set([identity(category)]);
  let changed = true;
  while (changed) {
    changed = false;
    rows.forEach(row => {
      if (ids.has(String(row.parent_id || "")) && !ids.has(identity(row))) {
        ids.add(identity(row));
        changed = true;
      }
    });
  }
  const values = new Set();
  rows.forEach(row => {
    if (!ids.has(identity(row))) return;
    values.add(identity(row));
    if (row.slug) values.add(String(row.slug));
  });
  return state.products.filter(product => values.has(String(product.category_id || "")) || values.has(String(product.categorySlug || ""))).length;
}

let updateCategoryCarousel = () => {};

function renderCategoryTabs() {
  const host = document.querySelector("[data-catalog-categories]");
  const categories = quickCategoryRows();
  host.innerHTML = categories.length ? categories.map(category => {
    const productCount = categoryProductCount(category);
    const active = state.categories.has(identity(category)) || state.categories.has(String(category.slug || ""));
    const countLabel = `${productCount} ${productCount === 1 ? "produs" : "produse"}`;
    return `<button type="button" data-category-tab="${escapeHtml(identity(category))}" class="${active ? "is-active" : ""}" aria-pressed="${active}" title="${escapeHtml(category.name)}">
      <span class="cs-category-tabs__content"><span class="cs-category-tabs__text"><strong>${escapeHtml(category.name)}</strong></span></span>
      <span class="cs-category-tabs__footer"><span class="cs-category-tabs__count" aria-label="${escapeHtml(countLabel)}">${productCount}</span></span>
    </button>`;
  }).join("") : `<div class="cs-empty-state">Categoriile nu sunt disponibile momentan.</div>`;
  requestAnimationFrame(updateCategoryCarousel);
}

function bindCategoryCarousel() {
  const carousel = document.querySelector("[data-category-carousel]");
  const rail = carousel?.querySelector("[data-catalog-categories]");
  const previous = carousel?.querySelector("[data-category-prev]");
  const next = carousel?.querySelector("[data-category-next]");
  if (!carousel || !rail || !previous || !next) return;

  let updateTimer = 0;
  const metrics = () => {
    const firstCard = rail.querySelector(":scope > [data-category-tab]");
    const gap = Number.parseFloat(getComputedStyle(rail).columnGap || getComputedStyle(rail).gap) || 0;
    const step = firstCard ? firstCard.getBoundingClientRect().width + gap : rail.clientWidth * .8;
    return { max: Math.max(0, rail.scrollWidth - rail.clientWidth), step };
  };

  updateCategoryCarousel = () => {
    const { max } = metrics();
    const hasOverflow = max > 2;
    carousel.classList.toggle("has-overflow", hasOverflow);
    previous.hidden = !hasOverflow;
    next.hidden = !hasOverflow;
    previous.disabled = rail.scrollLeft <= 2;
    next.disabled = rail.scrollLeft >= max - 2;
  };

  const move = direction => {
    const { step } = metrics();
    const visibleCards = Math.max(1, Math.floor((rail.clientWidth + 1) / step));
    rail.scrollBy({ left: direction * step * visibleCards, behavior: "smooth" });
  };

  previous.addEventListener("click", () => move(-1));
  next.addEventListener("click", () => move(1));
  rail.addEventListener("scroll", () => {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(updateCategoryCarousel, 60);
  }, { passive: true });
  new ResizeObserver(updateCategoryCarousel).observe(rail);
  updateCategoryCarousel();
}

function renderFilterGroups() {
  const brandCounts = countBy(state.products, product => (product.brands || []).flatMap(brand => [String(brand.id || ""), String(brand.slug || "")]).filter(Boolean));
  const manufacturerCounts = countBy(state.products, product => [String(product.manufacturer_id || ""), String(product.manufacturer_slug || "")]);
  const categoryHost = document.querySelector("[data-filter-categories]");
  const brandHost = document.querySelector("[data-filter-brands]");
  const manufacturerHost = document.querySelector("[data-filter-manufacturers]");
  categoryHost.innerHTML = state.filters.categories.length
    ? state.filters.categories.map(row => filterOption("category", identity(row), row.name, categoryProductCount(row), state.categories.has(identity(row)), categoryDepth(row))).join("")
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

function expandedCategorySelection() {
  if (!state.categories.size) return state.categories;
  const rows = state.filters.categories || [];
  const selectedIds = new Set();
  rows.forEach(row => {
    if (state.categories.has(identity(row)) || state.categories.has(String(row.slug || ""))) selectedIds.add(identity(row));
  });
  let changed = true;
  while (changed) {
    changed = false;
    rows.forEach(row => {
      if (selectedIds.has(String(row.parent_id || "")) && !selectedIds.has(identity(row))) {
        selectedIds.add(identity(row));
        changed = true;
      }
    });
  }
  const values = new Set(state.categories);
  rows.forEach(row => {
    if (!selectedIds.has(identity(row))) return;
    values.add(identity(row));
    if (row.slug) values.add(String(row.slug));
  });
  return values;
}

function filteredRows() {
  const categorySelection = expandedCategorySelection();
  const rows = state.products.map(product => ({ product, search: searchScore(product, state.query) })).filter(({ product, search }) => {
    if (state.query && search <= 0) return false;
    if (!matchesSet(categorySelection, [product.category_id, product.categorySlug])) return false;
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
    const label = String(row?.name || value);
    chips.push(`<button type="button" data-remove-filter="${type}" data-value="${escapeHtml(value)}" aria-label="Elimină filtrul ${escapeHtml(label)}"><span>${escapeHtml(label)}</span>${icon("close")}</button>`);
  }));
  state.availability.forEach(value => chips.push(`<button type="button" data-remove-filter="availability" data-value="${value}" aria-label="Elimină filtrul ${value === "in_stock" ? "În stoc" : "Stoc epuizat"}"><span>${value === "in_stock" ? "În stoc" : "Stoc epuizat"}</span>${icon("close")}</button>`));
  if (state.query) chips.push(`<button type="button" data-remove-filter="query" aria-label="Elimină filtrul de căutare"><span>Căutare: ${escapeHtml(state.query)}</span>${icon("close")}</button>`);
  if (state.min > 0 || state.max < state.priceCeiling) chips.push(`<button type="button" data-remove-filter="price" aria-label="Elimină filtrul de preț"><span>${escapeHtml(money(state.min))} – ${escapeHtml(money(state.max))}</span>${icon("close")}</button>`);
  if (chips.length) chips.push(`<button class="is-reset" type="button" data-reset-filters>${icon("rotate")}<span>Resetează toate filtrele</span></button>`);
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
  grid.dataset.visibleCount = String(Math.min(visible.length, 5));
  const lastRowCount = visible.length ? visible.length % 5 || Math.min(visible.length, 5) : 0;
  grid.dataset.lastRowCount = String(lastRowCount);
  grid.innerHTML = visible.length
    ? visible.map(product => productCard(product, { showDescription: true })).join("")
    : `<div class="cs-empty-state">${icon("search")}<strong>Nu am găsit produse</strong><p>Elimină unul dintre filtre sau încearcă o căutare mai generală.</p><button type="button" data-reset-filters>Resetează filtrele</button></div>`;
  if (visible.length > 5 && lastRowCount <= 2) {
    [...grid.querySelectorAll(".cs-product-card")].slice(-lastRowCount).forEach(card => card.classList.add("is-wide-card"));
  }
  const range = document.querySelector("[data-results-range]");
  range.textContent = rows.length ? `${start + 1}–${Math.min(start + state.pageSize, rows.length)} din ${rows.length} produse` : "0 produse";
  const pager = document.querySelector("[data-catalog-pagination]");
  pager.innerHTML = `<button class="is-nav is-prev" type="button" data-page="${state.page - 1}" ${state.page <= 1 ? "disabled" : ""} aria-label="Pagina anterioară">${icon("chevron")}</button>${paginationSequence(pageCount).map(page => page === "…" ? `<span class="cs-pagination__ellipsis">…</span>` : `<button type="button" data-page="${page}" class="${page === state.page ? "is-active" : ""}" ${page === state.page ? 'aria-current="page"' : ""} aria-label="Pagina ${page}">${page}</button>`).join("")}<button class="is-nav is-next" type="button" data-page="${state.page + 1}" ${state.page >= pageCount ? "disabled" : ""} aria-label="Pagina următoare">${icon("chevron")}</button>`;
  renderChips();
  renderCategoryTabs();
  const loadMore = document.querySelector("[data-mobile-load-more]");
  if (loadMore) loadMore.hidden = start + visible.length >= rows.length;
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

function syncPriceTrack() {
  const panel = document.querySelector("[data-filter-panel]");
  const track = panel?.querySelector(".cs-price-range-wrap");
  if (!track) return;
  const ceiling = Math.max(1, state.priceCeiling);
  track.style.setProperty("--range-min", `${Math.min(100, Math.max(0, state.min / ceiling * 100))}%`);
  track.style.setProperty("--range-max", `${Math.min(100, Math.max(0, state.max / ceiling * 100))}%`);
}

function resetFilters() {
  state.query = "";
  state.categories.clear(); state.brands.clear(); state.manufacturers.clear(); state.availability.clear();
  state.min = 0; state.max = state.priceCeiling; state.page = 1;
  document.querySelectorAll("[data-filter-panel] input[type='checkbox']").forEach(input => { input.checked = false; });
  document.querySelector('[name="price_min"]').value = "0";
  document.querySelector('[name="price_max"]').value = String(state.priceCeiling);
  document.querySelector('[name="price_range_min"]').value = "0";
  document.querySelector('[name="price_range"]').value = String(state.priceCeiling);
  const brandSearch = document.querySelector("[data-brand-filter-search]");
  if (brandSearch) {
    brandSearch.value = "";
    filterBrandOptions("");
  }
  history.replaceState(null, "", previewUrl("/magazin#catalog"));
  document.querySelectorAll("[data-price-preset]").forEach(button => button.classList.remove("is-active"));
  syncPriceTrack();
  renderCatalog();
}

function filterBrandOptions(query) {
  const needle = normalize(query);
  const labels = [...document.querySelectorAll("[data-filter-brands] label")];
  let visible = 0;
  labels.forEach(label => {
    const matches = !needle || normalize(label.textContent).includes(needle);
    label.classList.toggle("is-search-hidden", !matches);
    if (matches) visible += 1;
  });
  const empty = document.querySelector("[data-brand-search-empty]");
  if (empty) empty.hidden = visible > 0 || labels.length === 0;
}

function bindFilters() {
  const panel = document.querySelector("[data-filter-panel]");
  panel.addEventListener("change", event => {
    if (event.target.matches('input[type="checkbox"]')) syncFromControls();
  });
  panel.addEventListener("input", event => {
    if (!["price_min", "price_max", "price_range_min", "price_range"].includes(event.target.name)) return;
    const minInput = panel.querySelector('[name="price_min"]');
    const maxInput = panel.querySelector('[name="price_max"]');
    const minRange = panel.querySelector('[name="price_range_min"]');
    const maxRange = panel.querySelector('[name="price_range"]');
    if (event.target.name === "price_range_min") minInput.value = String(Math.min(Number(event.target.value), Number(maxRange.value)));
    if (event.target.name === "price_range") maxInput.value = String(Math.max(Number(event.target.value), Number(minRange.value)));
    if (event.target.name === "price_min") minRange.value = String(Math.min(Number(event.target.value || 0), Number(maxInput.value || state.priceCeiling)));
    if (event.target.name === "price_max") maxRange.value = String(Math.max(Number(event.target.value || state.priceCeiling), Number(minInput.value || 0)));
    panel.querySelectorAll("[data-price-preset]").forEach(button => button.classList.remove("is-active"));
    syncFromControls();
    syncPriceTrack();
  });
  document.querySelector("[data-brand-filter-search]")?.addEventListener("input", event => filterBrandOptions(event.target.value));
  panel.querySelectorAll("[data-filter-group-toggle]").forEach(button => button.addEventListener("click", () => {
    const group = button.closest(".cs-filter-group");
    const expanded = button.getAttribute("aria-expanded") !== "false";
    button.setAttribute("aria-expanded", String(!expanded));
    group?.classList.toggle("is-collapsed", expanded);
    if (!expanded && group) {
      group.classList.remove("is-opening");
      void group.offsetWidth;
      group.classList.add("is-opening");
      window.setTimeout(() => group.classList.remove("is-opening"), 420);
    }
  }));
  document.addEventListener("click", event => {
    const pricePreset = event.target.closest("[data-price-preset]");
    if (pricePreset) {
      const [rawMin, rawMax] = String(pricePreset.dataset.pricePreset || "0:").split(":");
      const minimum = Math.min(state.priceCeiling, Math.max(0, Number(rawMin || 0)));
      const maximum = rawMax === "" ? state.priceCeiling : Math.min(state.priceCeiling, Math.max(minimum, Number(rawMax || state.priceCeiling)));
      panel.querySelector('[name="price_min"]').value = String(minimum);
      panel.querySelector('[name="price_max"]').value = String(maximum);
      panel.querySelector('[name="price_range_min"]').value = String(minimum);
      panel.querySelector('[name="price_range"]').value = String(maximum);
      panel.querySelectorAll("[data-price-preset]").forEach(button => button.classList.toggle("is-active", button === pricePreset));
      syncFromControls();
      syncPriceTrack();
      return;
    }
    const reset = event.target.closest("[data-reset-filters]");
    if (reset) { event.preventDefault(); resetFilters(); return; }
    const remove = event.target.closest("[data-remove-filter]");
    if (remove) {
      const type = remove.dataset.removeFilter;
      if (type === "query") state.query = "";
      else if (type === "price") { state.min = 0; state.max = state.priceCeiling; panel.querySelector('[name="price_min"]').value = 0; panel.querySelector('[name="price_max"]').value = state.priceCeiling; panel.querySelector('[name="price_range_min"]').value = 0; panel.querySelector('[name="price_range"]').value = state.priceCeiling; syncPriceTrack(); }
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
  document.querySelectorAll("[data-catalog-sort]").forEach(select => select.addEventListener("change", event => {
    state.sort = event.target.value;
    state.page = 1;
    document.querySelectorAll("[data-catalog-sort]").forEach(peer => { peer.value = state.sort; });
    const label = document.querySelector("[data-mobile-sort-label]");
    if (label) label.textContent = event.target.selectedOptions[0]?.textContent || "Recomandate";
    renderCatalog();
  }));
  document.querySelector("[data-page-size]").addEventListener("change", event => { state.pageSize = Number(event.target.value || 25); state.page = 1; renderCatalog(); });
  document.querySelector("[data-mobile-load-more]")?.addEventListener("click", () => {
    state.page = 1;
    state.pageSize = Math.min(state.products.length || state.pageSize + 5, state.pageSize + 5);
    renderCatalog();
  });
}

function bindFilterDrawer() {
  const panel = document.querySelector("[data-filter-panel]");
  const scrim = document.querySelector("[data-filter-scrim]");
  const trigger = document.querySelector("[data-filter-open]");
  const panelAnchor = document.createComment("filter-panel-anchor");
  const scrimAnchor = document.createComment("filter-scrim-anchor");
  panel.before(panelAnchor);
  scrim.before(scrimAnchor);
  let closeTimer = 0;
  let openFrame = 0;

  const restoreDrawer = () => {
    if (panelAnchor.isConnected) panelAnchor.after(panel);
    if (scrimAnchor.isConnected) scrimAnchor.after(scrim);
  };
  const open = () => {
    window.clearTimeout(closeTimer);
    window.cancelAnimationFrame(openFrame);
    if (matchMedia("(max-width: 768px)").matches) document.body.append(scrim, panel);
    scrim.hidden = false;
    document.body.classList.add("cs-filter-open");
    trigger.setAttribute("aria-expanded", "true");
    void panel.offsetWidth;
    openFrame = requestAnimationFrame(() => {
      openFrame = 0;
      panel.classList.add("is-open");
      scrim.classList.add("is-open");
      panel.querySelector("[data-filter-close]")?.focus();
    });
  };
  const close = () => {
    if (!panel.classList.contains("is-open") && !openFrame) return;
    window.cancelAnimationFrame(openFrame);
    openFrame = 0;
    panel.classList.remove("is-open");
    scrim.classList.remove("is-open");
    document.body.classList.remove("cs-filter-open");
    trigger.setAttribute("aria-expanded", "false");
    closeTimer = window.setTimeout(() => {
      if (panel.classList.contains("is-open")) return;
      scrim.hidden = true;
      restoreDrawer();
    }, 360);
  };
  trigger.addEventListener("click", open);
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
  const mobileToggle = form.querySelector("[data-compatibility-mobile-toggle]");
  category.innerHTML = optionMarkup(state.filters.categories, "Selectează categoria");
  const update = () => {
    const categoryProducts = state.products.filter(product => !category.value || [product.category_id, product.categorySlug].map(String).includes(category.value));
    const brandRows = [...new Map(categoryProducts.flatMap(product => product.brands || []).map(row => [identity(row), row])).values()].filter(row => identity(row));
    brand.innerHTML = optionMarkup(brandRows, brandRows.length ? "Selectează marca" : "Nu există mărci disponibile"); brand.disabled = !brandRows.length;
    const manufacturerRows = state.filters.manufacturers.filter(row => categoryProducts.some(product => [product.manufacturer_id, product.manufacturer_slug].map(String).includes(identity(row))) && (!brand.value || categoryProducts.some(product => (product.brands || []).some(row => identity(row) === brand.value))));
    manufacturer.innerHTML = optionMarkup(manufacturerRows, manufacturerRows.length ? "Selectează producătorul" : "Nu există producători disponibili"); manufacturer.disabled = !manufacturerRows.length;
  };
  category.addEventListener("change", update); brand.addEventListener("change", update);
  mobileToggle?.addEventListener("click", () => {
    const open = form.classList.toggle("is-mobile-open");
    mobileToggle.setAttribute("aria-expanded", String(open));
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    state.categories = new Set(category.value ? [category.value] : []);
    state.brands = new Set(brand.value ? [brand.value] : []);
    state.manufacturers = new Set(manufacturer.value ? [manufacturer.value] : []);
    document.querySelectorAll("[data-filter-panel] input[type='checkbox']").forEach(input => { input.checked = filterSet(input.name)?.has(input.value) || false; });
    form.classList.remove("is-mobile-open");
    mobileToggle?.setAttribute("aria-expanded", "false");
    state.page = 1; renderCatalog({ scroll: true });
  });
}

function applyUrlState() {
  const params = new URLSearchParams(location.search);
  state.query = params.get("q") || "";
  const targets = { category: state.categories, brand: state.brands, manufacturer: state.manufacturers };
  Object.entries(targets).forEach(([name, target]) => {
    const value = params.get(name);
    if (value) target.add(value);
  });
  if (params.get("sort")) state.sort = params.get("sort");
  document.querySelectorAll("[data-catalog-sort]").forEach(select => { select.value = state.sort; });
  const label = document.querySelector("[data-mobile-sort-label]");
  if (label) label.textContent = document.querySelector("[data-catalog-sort] option:checked")?.textContent || "Recomandate";
}

async function initialize() {
  bindCategoryCarousel();
  document.querySelector("[data-assistance-icon]").innerHTML = icon("user");
  document.querySelector("[data-filter-icon]").innerHTML = icon("filter");
  document.querySelector("[data-brand-search-icon]").innerHTML = icon("search");
  document.querySelector("[data-compatibility-icon]").innerHTML = icon("search");
  document.querySelector("[data-compatibility-search-icon]").innerHTML = icon("search");
  document.querySelector("[data-compatibility-mobile-icon]").innerHTML = icon("search");
  document.querySelectorAll("[data-reset-filter-icon]").forEach(node => { node.innerHTML = icon("rotate"); });
  document.querySelector("[data-filter-help-icon]").innerHTML = icon("headset");
  document.querySelectorAll("[data-filter-close-icon]").forEach(node => { node.innerHTML = icon("close"); });
  document.querySelectorAll("[data-filter-chevron]").forEach(node => { node.innerHTML = icon("chevron"); });
  document.querySelector("[data-mobile-load-more-icon]").innerHTML = icon("chevron");
  document.querySelectorAll("[data-filter-group-icon]").forEach(node => { node.innerHTML = icon(node.dataset.filterGroupIcon); });
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
    panel.querySelector('[name="price_range_min"]').max = String(state.priceCeiling);
    panel.querySelector('[name="price_range_min"]').value = "0";
    panel.querySelector('[name="price_range"]').max = String(state.priceCeiling);
    panel.querySelector('[name="price_range"]').value = String(state.priceCeiling);
    applyUrlState();
    renderFilterGroups();
    bindFilters();
    bindFilterDrawer();
    bindCompatibility();
    syncPriceTrack();
    panel.querySelectorAll("input[type='checkbox']").forEach(input => { input.checked = filterSet(input.name)?.has(input.value) || false; });
    renderCatalog();
  } catch (error) {
    document.querySelector("[data-catalog-categories]").innerHTML = `<div class="cs-empty-state">Categoriile nu sunt disponibile momentan.</div>`;
    document.querySelector("[data-catalog-grid]").innerHTML = `<div class="cs-empty-state">${icon("info")}<strong>Catalogul nu a putut fi încărcat</strong><p>${escapeHtml(error.message)}</p><button type="button" onclick="location.reload()">Încearcă din nou</button></div>`;
  }
}

initialize();
