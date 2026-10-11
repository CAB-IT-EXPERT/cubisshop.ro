import { data, commerce, escapeHtml, icon, initShell, previewUrl, productCard, productRoute } from "./cubis-storefront.mjs";

const shellPromise = initShell({ active: "home" });

function renderIcons() {
  document.querySelectorAll("[data-icon]").forEach(node => { node.innerHTML = icon(node.dataset.icon); });
  document.querySelectorAll("[data-guide-icon]").forEach(node => { node.innerHTML = icon(node.dataset.guideIcon); });
  const newsletter = document.querySelector("[data-newsletter-icon]");
  if (newsletter) newsletter.innerHTML = icon("mail");
}

function categoryImage(category, products) {
  const direct = String(category?.image_url || category?.image || "");
  if (direct) return direct;
  return products.find(product => String(product.category_id || "") === String(category?.id || ""))?.imageUrl || "";
}

function renderHero(products, config) {
  const host = document.querySelector("[data-hero-products]");
  if (!host) return;
  const visualProducts = products.filter(product => product.imageUrl).slice(0, 5);
  host.innerHTML = `<div class="cs-hero__orb"></div>
    <div class="cs-hero-products ${visualProducts.length < 2 ? "is-sparse" : ""}">
      ${visualProducts.map((product, index) => `<a class="cs-hero-product p${index + 1}" href="${productRoute(product)}" aria-label="${escapeHtml(product.name)}"><img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" width="520" height="420" ${index ? "loading=lazy" : "fetchpriority=high"}></a>`).join("") || `<a class="cs-hero-product-empty" href="${previewUrl("/magazin")}">${icon("package")}<strong>Catalogul Cubis Shop</strong><span>Produsele apar aici imediat ce sunt publicate.</span></a>`}
    </div><p class="cs-hero__note">Piese mici.<br><strong>Posibilități mari.</strong></p>`;

  const benefitHost = document.querySelector("[data-home-benefits]");
  const shipping = config?.shipping_methods?.[0];
  const benefits = [
    ["truck", shipping ? "Livrare configurată" : "Livrare afișată la checkout", shipping?.eta_label || "în funcție de metoda activă"],
    ["rotate", "Retur verificat", "conform eligibilității comenzii"],
    ["lock", config?.payments?.stripe_test_mode ? "Plată online TEST" : "Plată configurată", "procesată securizat"],
    ["headset", "Suport clienți", "pentru alegerea produsului"],
  ];
  benefitHost.innerHTML = benefits.map(([name, title, detail]) => `<span>${icon(name)}<b>${title}</b><small>${detail}</small></span>`).join("");
}

function renderCategories(filters, products) {
  const host = document.querySelector("[data-home-categories]");
  const categories = (filters.categories || []).filter(category => !category.parent_id);
  if (!categories.length) {
    host.innerHTML = `<div class="cs-empty-state">${icon("package")}<strong>Categoriile nu sunt încă publicate</strong><p>Structura se va completa automat din API.</p><a href="/magazin">Deschide catalogul</a></div>`;
    return;
  }
  host.innerHTML = categories.slice(0, 6).map(category => {
    const image = categoryImage(category, products);
    return `<a class="cs-category-card" href="/magazin?category=${encodeURIComponent(category.id || category.slug)}">
      <span>${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" width="300" height="190">` : icon("package")}</span>
      <h3>${escapeHtml(category.name)}</h3><b>Vezi categoria →</b>
    </a>`;
  }).join("");
}

function optionMarkup(rows, placeholder) {
  return `<option value="">${placeholder}</option>${rows.map(row => `<option value="${escapeHtml(row.value)}">${escapeHtml(row.label)}</option>`).join("")}`;
}

function uniqueOptions(rows) {
  const unique = new Map();
  rows.forEach(row => { if (row.value && row.label && !unique.has(row.value)) unique.set(row.value, row); });
  return [...unique.values()].sort((first, second) => first.label.localeCompare(second.label, "ro"));
}

function bindCompatibility(filters, products) {
  const form = document.querySelector("[data-compatibility-form]");
  if (!form) return;
  const category = form.elements.category;
  const brand = form.elements.brand;
  const manufacturer = form.elements.manufacturer;
  const categories = (filters.categories || []).map(row => ({ value: String(row.id || row.slug || ""), label: String(row.name || "") }));
  category.innerHTML = optionMarkup(categories, "Selectează categoria");
  const subset = () => products.filter(product => !category.value || String(product.category_id || "") === category.value);
  const updateBrands = () => {
    const rows = uniqueOptions(subset().flatMap(product => (product.brands || []).map(item => ({ value: String(item.id || item.slug || item.name || ""), label: String(item.name || "") }))));
    brand.innerHTML = optionMarkup(rows, rows.length ? "Selectează marca" : "Nu există mărci disponibile");
    brand.disabled = rows.length === 0;
    updateManufacturers();
  };
  const updateManufacturers = () => {
    const scoped = subset().filter(product => !brand.value || (product.brands || []).some(item => String(item.id || item.slug || item.name || "") === brand.value));
    const rows = uniqueOptions(scoped.map(product => ({ value: String(product.manufacturer_id || product.manufacturer_slug || ""), label: product.manufacturerName })).filter(row => row.value && row.label));
    manufacturer.innerHTML = optionMarkup(rows, rows.length ? "Selectează producătorul" : "Nu există producători disponibili");
    manufacturer.disabled = rows.length === 0;
  };
  category.addEventListener("change", updateBrands);
  brand.addEventListener("change", updateManufacturers);
  form.addEventListener("submit", event => {
    event.preventDefault();
    const query = new URLSearchParams();
    if (category.value) query.set("category", category.value);
    if (brand.value) query.set("brand", brand.value);
    if (manufacturer.value) query.set("manufacturer", manufacturer.value);
    location.href = previewUrl(`/magazin${query.size ? `?${query}` : ""}#catalog`);
  });
}

function renderProducts(products) {
  const featured = products.filter(product => product.featured && product.inStock);
  const featuredRows = (featured.length ? featured : products).slice(0, 6);
  const title = document.querySelector("[data-featured-title]");
  if (title && !featured.length) title.textContent = "Produse din catalog";
  const featuredHost = document.querySelector("[data-home-featured]");
  const newHost = document.querySelector("[data-home-new]");
  const empty = `<div class="cs-empty-state">${icon("package")}<strong>Catalogul nu conține încă produse publice</strong><p>Secțiunea se completează automat când produsele sunt activate în API.</p></div>`;
  featuredHost.innerHTML = featuredRows.length ? featuredRows.map(product => productCard(product)).join("") : empty;
  newHost.innerHTML = products.length ? products.slice(0, 4).map(product => productCard(product, { compact: true })).join("") : empty;
  commerce.sync();
}

function renderBrands(filters) {
  const host = document.querySelector("[data-home-brands]");
  const rows = (filters.brands || []).map(row => ({ ...row, type: "brand" }));
  if (!rows.length) {
    host.innerHTML = `<div class="cs-empty-inline">Brandurile și producătorii vor apărea automat după publicarea lor în catalog.</div>`;
    return;
  }
  host.innerHTML = rows.slice(0, 10).map(row => `<a href="/magazin?${row.type}=${encodeURIComponent(row.id || row.slug)}">${row.logo_url ? `<img src="${escapeHtml(row.logo_url)}" alt="${escapeHtml(row.name)}" loading="lazy">` : `<strong>${escapeHtml(row.name)}</strong>`}</a>`).join("");
}

function renderBanners(filters, products) {
  const host = document.querySelector("[data-home-banners]");
  const categories = (filters.categories || []).filter(category => !category.parent_id).slice(0, 3);
  const fallback = [
    { name: "Toate produsele", copy: "Descoperă catalogul public Cubis Shop.", href: "/magazin", image: products[0]?.imageUrl || "" },
    { name: "Verifică compatibilitatea", copy: "Restrânge catalogul după datele disponibile.", href: "#compatibilitate", image: products[1]?.imageUrl || "" },
    { name: "Ai nevoie de ajutor?", copy: "Trimite-ne detaliile înainte de comandă.", href: "/contact", image: products[2]?.imageUrl || "" },
  ];
  const rows = categories.length >= 3 ? categories.map(category => ({
    name: category.name,
    copy: "Vezi produsele disponibile în această categorie.",
    href: `/magazin?category=${encodeURIComponent(category.id || category.slug)}`,
    image: categoryImage(category, products),
  })) : fallback;
  host.innerHTML = rows.map((row, index) => `<a class="cs-promo-card p${index + 1}" href="${row.href}">${row.image ? `<img src="${escapeHtml(row.image)}" alt="" loading="lazy">` : `<span>${icon(index === 1 ? "search" : index === 2 ? "headset" : "package")}</span>`}<div><h3>${escapeHtml(row.name)}</h3><p>${escapeHtml(row.copy)}</p><b>Vezi mai mult →</b></div></a>`).join("");
}

function bindNewsletter() {
  const form = document.querySelector("[data-newsletter-form]");
  const message = document.querySelector("[data-newsletter-message]");
  form?.addEventListener("submit", event => {
    event.preventDefault();
    message.hidden = false;
    message.textContent = "Abonarea separată nu este încă activată în API. Poți selecta consimțământul pentru newsletter, nebifat implicit, la finalizarea unei comenzi.";
    message.focus?.();
  });
}

async function initialize() {
  renderIcons();
  bindNewsletter();
  try {
    const [{ filters, config }, products] = await Promise.all([shellPromise, data.catalog()]);
    renderHero(products, config);
    renderCategories(filters, products);
    bindCompatibility(filters, products);
    renderProducts(products);
    renderBrands(filters);
    renderBanners(filters, products);
  } catch (error) {
    document.querySelectorAll(".cs-loading-card").forEach(node => {
      node.className = "cs-empty-state";
      node.innerHTML = `${icon("info")}<strong>Catalogul nu a putut fi încărcat</strong><p>${escapeHtml(error.message)}</p><button type="button" onclick="location.reload()">Încearcă din nou</button>`;
    });
  }
}

initialize();
