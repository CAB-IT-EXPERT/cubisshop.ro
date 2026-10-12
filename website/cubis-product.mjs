import {
  api,
  commerce,
  data,
  escapeHtml,
  icon,
  initShell,
  money,
  productBadge,
  productCard,
  PREVIEW_DEMO,
  productRoute,
} from "./cubis-storefront.mjs";
import { bindNewsletter } from "./cubis-newsletter.mjs";

let currentProduct = null;
let currentConfig = null;
let currentImages = [];
let currentImageIndex = 0;
let imageTransitionId = 0;
let syncProductTabs = () => {};

const shellPromise = initShell({ active: "catalog" });

function productIdentifier() {
  const params = new URLSearchParams(location.search);
  const explicit = params.get("slug") || params.get("id");
  if (explicit) return explicit;
  const match = location.pathname.match(/\/magazin\/produs\/([^/]+)/i);
  return match ? decodeURIComponent(match[1]) : "";
}

function safeRichText(html) {
  const template = document.createElement("template");
  template.innerHTML = String(html || "");
  const allowed = new Set(["P", "BR", "STRONG", "B", "EM", "I", "UL", "OL", "LI", "H2", "H3", "H4", "A", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD"]);
  const nodes = [...template.content.querySelectorAll("*")];
  nodes.forEach(node => {
    if (!allowed.has(node.tagName)) {
      node.replaceWith(...node.childNodes);
      return;
    }
    const href = node.tagName === "A" ? String(node.getAttribute("href") || "") : "";
    [...node.attributes].forEach(attribute => node.removeAttribute(attribute.name));
    if (node.tagName === "A") {
      if (!/^(https?:|mailto:|tel:|\/)/i.test(href)) node.removeAttribute("href");
      else {
        node.setAttribute("href", href);
        node.setAttribute("rel", "noopener noreferrer");
      }
    }
  });
  return template.innerHTML;
}

function stars(value) {
  const rating = Number(value || 0);
  return `<span class="cs-stars" aria-hidden="true">${Array.from({ length: 5 }, (_, index) => `<i class="${rating >= index + 0.5 ? "is-filled" : ""}">★</i>`).join("")}</span>`;
}

async function setImage(index, { animate = true } = {}) {
  if (!currentImages.length) return;
  currentImageIndex = (index + currentImages.length) % currentImages.length;
  const image = currentImages[currentImageIndex];
  const main = document.querySelector("[data-product-image]");
  const dialogImage = document.querySelector("[data-gallery-dialog-image]");
  const transitionId = ++imageTransitionId;
  document.querySelectorAll("[data-gallery-index]").forEach(button => {
    const active = Number(button.dataset.galleryIndex) === currentImageIndex;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
    if (active) button.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  });

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const shouldTransition = animate && main.src && !reduceMotion;
  const shouldAnimate = shouldTransition && typeof main.animate === "function";
  const useCssTransition = shouldTransition && !shouldAnimate;
  const preload = new Image();
  const imageReady = new Promise(resolve => {
    preload.addEventListener("load", resolve, { once: true });
    preload.addEventListener("error", resolve, { once: true });
  });
  preload.src = image.url;

  main.getAnimations?.().forEach(animation => { try { animation.finish(); } catch {} });
  if (useCssTransition) main.classList.add("is-changing");
  if (shouldAnimate) {
    await Promise.all([
      imageReady,
      main.animate([
        { opacity: 1, transform: "scale(1)", filter: "blur(0)" },
        { opacity: .12, transform: "scale(.975)", filter: "blur(3px)" },
      ], { duration: 150, easing: "cubic-bezier(.4, 0, 1, 1)", fill: "forwards" }).finished.catch(() => {}),
    ]);
  } else if (useCssTransition) {
    await Promise.all([imageReady, new Promise(resolve => setTimeout(resolve, 150))]);
  } else {
    await imageReady;
  }
  if (transitionId !== imageTransitionId) return;

  main.src = image.url;
  main.alt = image.alt_text || currentProduct.name;
  dialogImage.src = image.url;
  dialogImage.alt = image.alt_text || currentProduct.name;
  main.getAnimations?.().forEach(animation => { try { animation.finish(); } catch {} });
  if (shouldAnimate) {
    main.animate([
      { opacity: .12, transform: "scale(.975)", filter: "blur(3px)" },
      { opacity: 1, transform: "scale(1)", filter: "blur(0)" },
    ], { duration: 380, easing: "cubic-bezier(.2, .75, .25, 1)", fill: "both" });
  } else if (useCssTransition) {
    requestAnimationFrame(() => main.classList.remove("is-changing"));
  }
}

function renderGallery(product) {
  currentImages = product.images || [];
  const gallery = document.querySelector(".cs-product-gallery");
  const thumbs = document.querySelector("[data-product-thumbs]");
  const image = document.querySelector("[data-product-image]");
  const placeholder = document.querySelector("[data-product-image-placeholder]");
  const prev = document.querySelector("[data-gallery-prev]");
  const next = document.querySelector("[data-gallery-next]");
  if (!currentImages.length) {
    gallery.classList.add("has-no-images");
    thumbs.hidden = true;
    image.hidden = true;
    placeholder.hidden = false;
    placeholder.innerHTML = `${icon("package")}<strong>Imagine indisponibilă</strong>`;
    prev.hidden = true;
    next.hidden = true;
    document.querySelector("[data-product-zoom-label]").hidden = true;
    return;
  }
  gallery.classList.remove("has-no-images");
  thumbs.hidden = false;
  image.hidden = false;
  placeholder.hidden = true;
  thumbs.innerHTML = currentImages.map((item, index) => `<button type="button" data-gallery-index="${index}" aria-label="Imaginea ${index + 1}" aria-pressed="${index === 0}"><img src="${escapeHtml(item.url)}" alt="" width="90" height="90"></button>`).join("");
  thumbs.querySelectorAll("[data-gallery-index]").forEach(button => button.addEventListener("click", () => setImage(Number(button.dataset.galleryIndex))));
  prev.hidden = currentImages.length < 2;
  next.hidden = currentImages.length < 2;
  setImage(0, { animate: false });
}

function renderSummary(product, config) {
  document.querySelector("[data-product-title]").textContent = product.name;
  document.querySelector("[data-product-subtitle]").textContent = product.short_description || product.categoryName || "Detalii din catalogul Cubis Shop";
  document.querySelector("[data-product-sku]").textContent = product.sku ? `SKU: ${product.sku}` : "";
  document.querySelector("[data-product-brand]").textContent = product.brandNames.length ? `Brand: ${product.brandNames.join(", ")}` : product.manufacturerName ? `Producător: ${product.manufacturerName}` : "";
  const badge = document.querySelector("[data-product-badge]");
  const badgeText = productBadge(product);
  badge.textContent = badgeText;
  badge.hidden = !badgeText;

  const rating = document.querySelector("[data-product-rating]");
  const hasReviews = product.rating !== null && Number(product.reviewCount || 0) > 0;
  rating.hidden = !hasReviews;
  rating.innerHTML = hasReviews
    ? `${stars(product.rating)}<strong>${product.rating.toFixed(1)}</strong><a href="#reviews">${product.reviewCount} ${product.reviewCount === 1 ? "recenzie" : "recenzii"}</a>`
    : "";

  document.querySelector("[data-product-price]").innerHTML = `<strong>${escapeHtml(money(product.price, product.currency))}</strong>${product.oldPrice ? `<del>${escapeHtml(money(product.oldPrice, product.currency))}</del>` : ""}`;
  const stock = document.querySelector("[data-product-stock]");
  stock.classList.toggle("is-out", !product.inStock);
  stock.innerHTML = product.inStock
    ? `${icon("check")}<strong>În stoc</strong>${product.stockMode === "tracked" ? `<small>${product.stockQuantity} bucăți disponibile</small>` : ""}`
    : `<strong>Stoc epuizat</strong><small>Produsul nu poate fi adăugat momentan.</small>`;

  const shipping = (config.shipping_methods || []).find(method => method.is_active !== false) || null;
  document.querySelector("[data-delivery-card]").innerHTML = shipping
    ? `${icon("truck")}<div><strong>Livrare estimată: ${escapeHtml(shipping.eta_label || "conform metodei active")}</strong><span>Cost ${escapeHtml(money(shipping.cost, product.currency))}${Number(shipping.free_above || 0) > 0 ? ` · gratuit peste ${escapeHtml(money(shipping.free_above, product.currency))}` : ""}; confirmarea finală se face la checkout.</span></div>`
    : `${icon("truck")}<div><strong>Livrarea se confirmă la checkout</strong><span>Nu există momentan o estimare publică pentru această comandă.</span></div>`;

  const add = document.querySelector("[data-main-add]");
  add.querySelector("[data-main-add-icon]").innerHTML = icon("cart");
  add.disabled = !product.inStock;
  add.querySelector("strong").textContent = product.inStock ? "Adaugă în coș" : "Indisponibil";
  add.addEventListener("click", () => {
    commerce.add(product.id, Number(document.querySelector("[data-quantity]").value || 1));
    add.classList.add("is-added");
    add.querySelector("strong").textContent = "Adăugat în coș";
  });
  const favorite = document.querySelector("[data-main-favorite]");
  const syncFavorite = () => {
    const active = commerce.favorites().includes(product.id);
    favorite.classList.toggle("is-active", active);
    favorite.setAttribute("aria-pressed", String(active));
    favorite.setAttribute("aria-label", active ? "Elimină din favorite" : "Adaugă la favorite");
    favorite.innerHTML = icon("heart");
  };
  favorite.addEventListener("click", () => { commerce.toggleFavorite(product.id); syncFavorite(); });
  commerce.addEventListener("change", syncFavorite);
  syncFavorite();

  const benefits = [
    ["lock", "Plată securizată", config.payments?.card_enabled ? "Tranzacție protejată" : "Metode la checkout"],
    ["rotate", "Retur simplu", "Conform politicii de retur"],
    ["truck", "Livrare rapidă", shipping?.eta_label || "Confirmată la checkout"],
    ["headset", "Suport dedicat", "Ajutor înainte de comandă"],
  ];
  document.querySelector("[data-product-benefits]").innerHTML = benefits.map(([name, title, detail]) => `<span>${icon(name)}<b>${title}</b><small>${escapeHtml(detail)}</small></span>`).join("");
}

function renderFacts(product) {
  const rows = [
    product.categoryName && ["package", "Categorie", product.categoryName],
    product.brandNames.length && ["shield", "Brand", product.brandNames.join(", ")],
    product.manufacturerName && ["info", "Producător", product.manufacturerName],
    product.product_model && ["check", "Model", product.product_model],
    product.unit_of_measure && ["package", "Unitate", product.unit_of_measure],
    product.legal_warranty_months && ["shield", "Garanție legală", `${product.legal_warranty_months} luni`],
  ].filter(Boolean).slice(0, 4);
  const host = document.querySelector("[data-product-facts]");
  host.hidden = rows.length === 0;
  host.innerHTML = rows.map(([name, label, value]) => `<article>${icon(name)}<div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div></article>`).join("");
}

function specsMarkup(product) {
  const specs = Array.isArray(product.specifications) ? product.specifications : [];
  if (!specs.length) return `<div class="cs-empty-state is-small">${icon("info")}<strong>Nu există specificații publicate.</strong><p>Poți cere detalii folosind pagina de contact.</p></div>`;
  const groups = new Map();
  specs.forEach(spec => {
    const name = String(spec.group || "Specificații");
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(spec);
  });
  return [...groups.entries()].map(([group, rows]) => `<div class="cs-spec-group"><h3>${escapeHtml(group)}</h3><dl>${rows.map(row => `<div><dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value)}</dd></div>`).join("")}</dl></div>`).join("");
}

function compatibilityMarkup(product) {
  const values = [
    product.brandNames.length && ["Branduri", product.brandNames.join(", ")],
    product.product_model && ["Model", product.product_model],
    product.product_identifier && ["Identificator", product.product_identifier],
    product.categoryName && ["Categorie", product.categoryName],
  ].filter(Boolean);
  return values.length
    ? `<div class="cs-compatibility-list">${values.map(([label, value]) => `<span>${icon("check")}<b>${escapeHtml(label)}</b><small>${escapeHtml(value)}</small></span>`).join("")}</div><p class="cs-panel-note">Verifică întotdeauna modelul și specificațiile dispozitivului înainte de comandă.</p>`
    : `<div class="cs-empty-state is-small">${icon("info")}<strong>Compatibilitatea nu este publicată pentru acest produs.</strong><p>Trimite-ne SKU-ul pentru verificare.</p><a href="/contact">Cere ajutor</a></div>`;
}

async function reviewsMarkup(product) {
  try {
    const response = await api("publicProductReviews", { auth: false, query: { id: product.apiId }, cache: "no-store" });
    const reviews = Array.isArray(response) ? response : Array.isArray(response?.reviews) ? response.reviews : [];
    document.querySelector("[data-product-review-count]").textContent = reviews.length ? `(${reviews.length})` : "";
    if (!reviews.length) return `<div class="cs-empty-state is-small">${icon("star")}<strong>Încă nu există recenzii publicate.</strong><p>Recenziile sunt validate prin numărul comenzii și adresa folosită la cumpărare.</p></div>`;
    return `<div class="cs-reviews-list">${reviews.map(review => `<article><div>${stars(review.rating)}<time>${escapeHtml(review.created_at || "")}</time></div><h3>${escapeHtml(review.customer_name || "Client verificat")}</h3><p>${escapeHtml(review.message || "")}</p>${review.verified_purchase ? `<b>${icon("check")} Achiziție verificată</b>` : ""}</article>`).join("")}</div>`;
  } catch {
    return `<div class="cs-empty-state is-small">${icon("info")}<strong>Recenziile nu sunt disponibile momentan.</strong><p>Restul datelor produsului rămân actualizate.</p></div>`;
  }
}

async function renderPanels(product, config) {
  const description = safeRichText(product.description_html || "") || `<p>${escapeHtml(product.short_description || "Descrierea detaliată nu este încă publicată.")}</p>`;
  document.querySelector('[data-product-panel="description"]').innerHTML = `<div class="cs-description-layout"><div class="cs-rich-text"><h2>${escapeHtml(product.description_title || "Descriere produs")}</h2>${description}</div><aside class="cs-catalog-note"><span>${icon("shield")}</span><div><small>DETALII VERIFICATE</small><h3>Informații din catalogul oficial</h3></div></aside></div>`;
  document.querySelector('[data-product-panel="specifications"]').innerHTML = specsMarkup(product);
  document.querySelector('[data-product-panel="compatibility"]').innerHTML = compatibilityMarkup(product);
  document.querySelector('[data-product-panel="reviews"]').innerHTML = `<div class="cs-panel-loading">Se încarcă recenziile…</div>`;
  document.querySelector('[data-product-panel="reviews"]').innerHTML = await reviewsMarkup(product);
  const shipping = (config.shipping_methods || []).find(method => method.is_active !== false);
  document.querySelector('[data-product-panel="delivery"]').innerHTML = `<div class="cs-delivery-details"><article>${icon("truck")}<div><h3>Livrare</h3><p>${shipping ? `${escapeHtml(shipping.eta_label || "Termen confirmat la checkout")}; cost ${escapeHtml(money(shipping.cost, product.currency))}.` : "Opțiunile sunt confirmate la checkout."}</p></div></article><article>${icon("rotate")}<div><h3>Retur</h3><p>Eligibilitatea și costul returului sunt verificate conform politicii magazinului și datelor comenzii.</p></div></article><article>${icon("lock")}<div><h3>Plată</h3><p>Metodele active și sigure sunt afișate la checkout.</p></div></article></div>`;
}

function bindTabs() {
  const tabs = [...document.querySelectorAll("[data-product-tab]")];
  const rail = document.querySelector("[data-product-tabs]");
  const back = document.querySelector("[data-product-tabs-back]");
  const more = document.querySelector("[data-product-tabs-more]");
  tabs.forEach(tab => tab.addEventListener("click", () => {
    tabs.forEach(button => button.setAttribute("aria-selected", String(button === tab)));
    document.querySelectorAll("[data-product-panel]").forEach(panel => { panel.hidden = panel.dataset.productPanel !== tab.dataset.productTab; });
  }));
  back.innerHTML = icon("chevron");
  more.innerHTML = icon("chevron");
  syncProductTabs = () => {
    const canScroll = rail.scrollWidth > rail.clientWidth + 3;
    const atStart = rail.scrollLeft <= 3;
    const atEnd = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 3;
    back.hidden = !canScroll || atStart;
    more.hidden = !canScroll || atEnd;
  };
  back.addEventListener("click", () => rail.scrollBy({ left: -Math.max(150, rail.clientWidth * .62), behavior: "smooth" }));
  more.addEventListener("click", () => rail.scrollBy({ left: Math.max(150, rail.clientWidth * .62), behavior: "smooth" }));
  rail.addEventListener("scroll", syncProductTabs, { passive: true });
  addEventListener("resize", syncProductTabs, { passive: true });
}

function bindControls() {
  const quantity = document.querySelector("[data-quantity]");
  const minus = document.querySelector("[data-quantity-minus]");
  const plus = document.querySelector("[data-quantity-plus]");
  const previous = document.querySelector("[data-gallery-prev]");
  const next = document.querySelector("[data-gallery-next]");
  const zoomLabel = document.querySelector("[data-product-zoom-label]");
  minus.innerHTML = icon("minus");
  plus.innerHTML = icon("plus");
  previous.innerHTML = icon("chevron");
  next.innerHTML = icon("chevron");
  zoomLabel.innerHTML = `${icon("zoom")}<span>Mărește</span>`;
  minus.addEventListener("click", () => { quantity.value = String(Math.max(1, Number(quantity.value || 1) - 1)); });
  plus.addEventListener("click", () => { quantity.value = String(Math.min(99, Number(quantity.value || 1) + 1)); });
  previous.addEventListener("click", () => setImage(currentImageIndex - 1));
  next.addEventListener("click", () => setImage(currentImageIndex + 1));
  const dialog = document.querySelector("[data-gallery-dialog]");
  const open = () => { if (currentImages.length) dialog.showModal(); };
  document.querySelector("[data-product-zoom]").addEventListener("click", open);
  document.querySelector("[data-product-zoom-label]").addEventListener("click", open);
  document.querySelector("[data-gallery-close]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
}

function updateMetadata(product) {
  const title = product.meta_title || `${product.name} | Cubis Shop`;
  const description = product.meta_description || product.short_description || `Detalii pentru ${product.name}.`;
  document.title = title;
  document.querySelector('meta[name="description"]').content = description;
  const canonical = `https://cubisshop.ro${productRoute(product)}`;
  document.querySelector('link[rel="canonical"]').href = canonical;
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku || undefined,
    image: product.images.map(image => image.url),
    description,
    offers: {
      "@type": "Offer",
      priceCurrency: product.currency,
      price: product.price,
      availability: product.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: canonical,
    },
  });
  document.head.append(script);
}

function bindRelatedCarousel(section) {
  if (section.dataset.carouselBound === "true") return;
  const rail = section.querySelector("[data-related-grid]");
  const controls = section.querySelector(".cs-carousel-controls");
  const previous = section.querySelector("[data-related-carousel-prev]");
  const next = section.querySelector("[data-related-carousel-next]");
  const count = section.querySelector("[data-related-carousel-count]");
  const progress = section.querySelector("[data-related-carousel-progress]");
  const cards = [...rail.querySelectorAll(":scope > .cs-product-card")];
  const cardCount = cards.length;
  if (!cardCount) {
    controls.hidden = true;
    return;
  }
  section.dataset.carouselBound = "true";
  previous.innerHTML = icon("chevron");
  next.innerHTML = icon("chevron");
  cards.forEach(card => {
    const clone = card.cloneNode(true);
    clone.classList.add("is-carousel-clone");
    clone.setAttribute("aria-hidden", "true");
    clone.inert = true;
    clone.querySelectorAll("a, button, input, select, textarea, [tabindex]").forEach(control => control.setAttribute("tabindex", "-1"));
    rail.append(clone);
  });

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const paused = new Set();
  let autoTimer = 0;
  let resumeTimer = 0;
  let normalizeTimer = 0;
  let animationFrame = 0;
  let animationVersion = 0;
  const gap = () => parseFloat(getComputedStyle(rail).gap || 0);
  const step = () => cards[0]?.getBoundingClientRect().width + gap() || rail.clientWidth;
  const cycleWidth = () => cardCount * step();
  const logicalIndex = () => {
    const unit = step();
    return unit ? ((Math.round(rail.scrollLeft / unit) % cardCount) + cardCount) % cardCount : 0;
  };
  const hasOverflow = () => cardCount * step() - gap() > rail.clientWidth + 2;
  const update = () => {
    const overflowing = hasOverflow();
    const index = logicalIndex();
    controls.hidden = !overflowing;
    count.textContent = `${String(index + 1).padStart(2, "0")} / ${String(cardCount).padStart(2, "0")}`;
    previous.disabled = !overflowing;
    next.disabled = !overflowing;
    progress.style.transform = `scaleX(${(index + 1) / cardCount})`;
  };
  const normalizeLoop = () => {
    const cycle = cycleWidth();
    if (cycle && rail.scrollLeft >= cycle - 1) rail.scrollLeft %= cycle;
    update();
  };
  const stopAnimation = () => {
    animationVersion += 1;
    animationFrame = 0;
    rail.classList.remove("is-carousel-animating");
  };
  const animateTo = (target, duration) => {
    stopAnimation();
    const version = animationVersion;
    const start = rail.scrollLeft;
    const distance = target - start;
    if (!distance || reducedMotion.matches) {
      rail.scrollLeft = target;
      update();
      return Promise.resolve(true);
    }
    const startedAt = performance.now();
    rail.classList.add("is-carousel-animating");
    return new Promise(resolve => {
      const frame = now => {
        if (version !== animationVersion) return resolve(false);
        const elapsed = Math.min(1, (now - startedAt) / duration);
        rail.scrollLeft = start + distance * (1 - (1 - elapsed) ** 3);
        if (elapsed < 1) animationFrame = requestAnimationFrame(frame);
        else {
          animationFrame = 0;
          rail.classList.remove("is-carousel-animating");
          resolve(true);
        }
      };
      animationFrame = requestAnimationFrame(frame);
    });
  };
  const move = async (direction, duration = 900) => {
    if (!hasOverflow()) return;
    const unit = step();
    const cycle = cycleWidth();
    let rawIndex = Math.round(rail.scrollLeft / unit);
    if (direction < 0 && rawIndex <= 0) {
      rail.scrollLeft = cycle;
      rawIndex = cardCount;
    } else if (rawIndex >= cardCount) {
      rail.scrollLeft %= cycle;
      rawIndex = Math.round(rail.scrollLeft / unit);
    }
    if (await animateTo((rawIndex + direction) * unit, duration)) normalizeLoop();
  };
  const schedule = (delay = 1100) => {
    clearTimeout(autoTimer);
    if (reducedMotion.matches || paused.size || document.hidden || !hasOverflow()) return;
    autoTimer = setTimeout(async () => {
      if (paused.size || document.hidden) return;
      await move(1);
      schedule();
    }, delay);
  };
  const pause = reason => {
    paused.add(reason);
    clearTimeout(autoTimer);
    clearTimeout(resumeTimer);
    if (reason !== "visibility") stopAnimation();
  };
  const resume = (reason, delay = 1100) => {
    paused.delete(reason);
    clearTimeout(resumeTimer);
    if (!paused.size) resumeTimer = setTimeout(() => schedule(delay), 220);
  };
  const manualMove = direction => {
    pause("manual");
    void move(direction, 450).finally(() => resume("manual"));
  };
  previous.addEventListener("click", () => manualMove(-1));
  next.addEventListener("click", () => manualMove(1));
  rail.addEventListener("scroll", () => {
    update();
    clearTimeout(normalizeTimer);
    normalizeTimer = setTimeout(normalizeLoop, 150);
  }, { passive: true });
  rail.addEventListener("keydown", event => {
    if (event.target !== rail || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    manualMove(event.key === "ArrowRight" ? 1 : -1);
  });
  rail.addEventListener("touchstart", () => pause("touch"), { passive: true });
  rail.addEventListener("touchend", () => resume("touch"), { passive: true });
  rail.addEventListener("mouseenter", () => pause("hover"));
  rail.addEventListener("mouseleave", () => resume("hover"));
  rail.addEventListener("wheel", () => {
    pause("wheel");
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => resume("wheel"), 1400);
  }, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause("visibility");
    else resume("visibility", 1000);
  });
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) pause("motion");
    else resume("motion", 1000);
  });
  new ResizeObserver(update).observe(rail);
  update();
  schedule(1000);
}

async function renderRelated(product, allProducts) {
  const matched = allProducts.filter(candidate => candidate.id !== product.id && (
    (product.category_id && String(candidate.category_id) === String(product.category_id))
    || product.brandNames.some(brand => candidate.brandNames.includes(brand))
  ));
  const matchedIds = new Set(matched.map(candidate => candidate.id));
  const rows = [...matched, ...allProducts.filter(candidate => candidate.id !== product.id && !matchedIds.has(candidate.id))].slice(0, 6);
  const section = document.querySelector("[data-related-section]");
  section.hidden = rows.length === 0;
  if (rows.length) {
    document.querySelector("[data-related-grid]").innerHTML = rows.map(item => productCard(item)).join("");
    commerce.registerProducts(rows);
    bindRelatedCarousel(section);
  }
}

function initializeNewsletter() {
  const iconHost = document.querySelector("[data-newsletter-icon]");
  if (iconHost) iconHost.innerHTML = icon("mail");
  bindNewsletter({ previewDemo: PREVIEW_DEMO });
}

async function loadProduct() {
  const loading = document.querySelector("[data-product-loading]");
  const error = document.querySelector("[data-product-error]");
  const detail = document.querySelector("[data-product-detail]");
  loading.hidden = false;
  error.hidden = true;
  detail.hidden = true;
  try {
    const catalogPromise = data.catalog();
    const identifier = productIdentifier();
    const catalog = identifier ? await catalogPromise : await catalogPromise;
    const fallback = catalog.find(product => product.slug === identifier || product.apiId === identifier) || catalog[0];
    const product = identifier ? await data.product(identifier).catch(() => fallback) : fallback;
    if (!product?.id) throw new Error("Catalogul nu conține momentan un produs public care poate fi afișat.");
    currentProduct = product;
    currentConfig = await data.config().catch(() => ({ payments: {}, shipping_methods: [] }));
    commerce.registerProducts([product]);
    renderGallery(product);
    renderSummary(product, currentConfig);
    renderFacts(product);
    await renderPanels(product, currentConfig);
    await renderRelated(product, catalog);
    updateMetadata(product);
    document.querySelector("[data-product-breadcrumb]").innerHTML = `<a href="/">Acasă</a><span>›</span><a href="/magazin">Magazin</a>${product.categoryName ? `<span>›</span><a href="/magazin?category=${encodeURIComponent(product.category_id || product.categorySlug)}">${escapeHtml(product.categoryName)}</a>` : ""}<span>›</span><span aria-current="page">${escapeHtml(product.name)}</span>`;
    document.querySelector("[data-product-info]").hidden = false;
    loading.hidden = true;
    detail.hidden = false;
    requestAnimationFrame(syncProductTabs);
  } catch (failure) {
    loading.hidden = true;
    error.hidden = false;
    document.querySelector("[data-product-error-message]").textContent = failure?.message || "Produsul nu a putut fi încărcat.";
  }
}

bindTabs();
bindControls();
initializeNewsletter();
document.querySelector("[data-product-retry]").addEventListener("click", loadProduct);
await Promise.allSettled([shellPromise, loadProduct()]);
