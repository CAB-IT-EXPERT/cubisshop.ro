import { data, commerce, escapeHtml, icon, initShell, productCard, PREVIEW_DEMO } from "./cubis-storefront.mjs";
import { bindNewsletter } from "./cubis-newsletter.mjs";

const shellPromise = initShell({ active: "home" });

function renderIcons() {
  document.querySelectorAll("[data-icon]").forEach(node => { node.innerHTML = icon(node.dataset.icon); });
  document.querySelectorAll("[data-guide-icon]").forEach(node => { node.innerHTML = icon(node.dataset.guideIcon); });
  const newsletter = document.querySelector("[data-newsletter-icon]");
  if (newsletter) newsletter.innerHTML = icon("mail");
}

function renderHero() {
  const host = document.querySelector("[data-hero-products]");
  if (!host) return;
  host.innerHTML = `<svg class="cs-hero__mobile-art" viewBox="0 550 941 800" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><image href="/assets/cubis-home-hero-mobile.png" width="941" height="1672" /></svg>`;

  const benefitHost = document.querySelector("[data-home-benefits]");
  const benefits = [
    ["truck", "Livrare rapidă", "în toată România"],
    ["rotate", "Retur 14 zile", "fără bătăi de cap"],
    ["lock", "Plată securizată", "100% sigur"],
    ["headset", "Suport clienți", "Luni - Vineri, 09:00 - 18:00"],
  ];
  benefitHost.innerHTML = benefits.map(([name, title, detail]) => `<span>${icon(name)}<b>${title}</b><small>${detail}</small></span>`).join("");
}

function renderProducts(products) {
  const orderBy = (rows, metric) => rows.map((product, index) => ({ product, index }))
    .sort((first, second) => {
      const left = metric(first.product);
      const right = metric(second.product);
      if (left === null && right === null) return first.index - second.index;
      if (left === null) return 1;
      if (right === null) return -1;
      return right - left || first.index - second.index;
    }).map(row => row.product);
  const featuredRows = orderBy(products, product => product.viewCount).slice(0, 20);
  const recentRows = orderBy(products, product => {
    const timestamp = Date.parse(String(product.createdAt || "").replace(" ", "T"));
    return Number.isFinite(timestamp) ? timestamp : null;
  }).slice(0, 20);
  const featuredHost = document.querySelector("[data-home-featured]");
  const newHost = document.querySelector("[data-home-new]");
  const empty = `<div class="cs-empty-state">${icon("package")}<strong>Catalogul nu conține încă produse publice</strong><p>Secțiunea se completează automat când produsele sunt activate în API.</p></div>`;
  featuredHost.innerHTML = featuredRows.length ? featuredRows.map(product => productCard(product)).join("") : empty;
  newHost.innerHTML = recentRows.length ? recentRows.map(product => productCard(product)).join("") : empty;
  document.querySelectorAll("[data-product-carousel]").forEach((section, index) => bindProductCarousel(section, index));
  commerce.sync();
}

function bindProductCarousel(section, carouselIndex = 0) {
  const AUTO_SCROLL_DURATION = 900;
  const MANUAL_SCROLL_DURATION = 450;
  const CAROUSEL_STAGGER = 1000;
  const AUTO_SCROLL_REST = 1100;
  const rail = section.querySelector(".cs-product-grid--carousel");
  const controls = section.querySelector(".cs-carousel-controls");
  const previous = section.querySelector("[data-carousel-prev]");
  const next = section.querySelector("[data-carousel-next]");
  const count = section.querySelector("[data-carousel-count]");
  const progress = section.querySelector("[data-carousel-progress]");
  const cards = [...rail.querySelectorAll(":scope > .cs-product-card")];
  const cardCount = cards.length;
  if (!cardCount) {
    controls.hidden = true;
    return;
  }
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
    if (!cycle) return;
    if (rail.scrollLeft >= cycle - 1) rail.scrollLeft %= cycle;
    update();
  };
  const cancelAnimation = () => {
    animationVersion += 1;
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    rail.classList.remove("is-carousel-animating");
  };
  const animateTo = (target, duration) => {
    cancelAnimation();
    const version = animationVersion;
    const start = rail.scrollLeft;
    const distance = target - start;
    if (!distance || reducedMotion.matches || duration <= 0) {
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
        const eased = 1 - (1 - elapsed) ** 3;
        rail.scrollLeft = start + distance * eased;
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
  const move = async (direction, duration = AUTO_SCROLL_DURATION) => {
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
    const target = (rawIndex + direction) * unit;
    if (await animateTo(target, duration)) normalizeLoop();
  };

  const scheduleAuto = delay => {
    clearTimeout(autoTimer);
    if (reducedMotion.matches || paused.size || document.hidden || !hasOverflow()) return;
    autoTimer = setTimeout(async () => {
      if (paused.size || document.hidden) return;
      await move(1, AUTO_SCROLL_DURATION);
      scheduleAuto(AUTO_SCROLL_REST);
    }, delay);
  };
  const pause = reason => {
    paused.add(reason);
    clearTimeout(autoTimer);
    clearTimeout(resumeTimer);
    if (reason !== "visibility") cancelAnimation();
  };
  const resume = (reason, delay = AUTO_SCROLL_REST) => {
    paused.delete(reason);
    clearTimeout(resumeTimer);
    if (!paused.size) resumeTimer = setTimeout(() => scheduleAuto(delay), 220);
  };
  const manualMove = direction => {
    pause("manual");
    void move(direction, MANUAL_SCROLL_DURATION).finally(() => resume("manual", AUTO_SCROLL_REST));
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
  rail.addEventListener("touchend", () => resume("touch", AUTO_SCROLL_REST), { passive: true });
  rail.addEventListener("wheel", () => {
    pause("wheel");
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => resume("wheel", AUTO_SCROLL_REST), 1400);
  }, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause("visibility");
    else resume("visibility", 1000 + carouselIndex * CAROUSEL_STAGGER);
  });
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) pause("motion");
    else resume("motion", 1000 + carouselIndex * CAROUSEL_STAGGER);
  });
  new ResizeObserver(update).observe(rail);
  update();
  scheduleAuto(1000 + carouselIndex * CAROUSEL_STAGGER);
}

function renderBrands() {
  const host = document.querySelector("[data-home-brands]");
  const brands = [
    ["xiaomi", "svg"], ["ninebot", "png"], ["kugoo", "svg"], ["kukirin", "webp"],
    ["gopro", "svg"], ["insta360", "svg"], ["samsung", "svg"], ["garmin", "svg"],
    ["ugreen", "png"], ["anker", "svg"],
  ];
  const strip = brands.map(([name, extension]) => `<span class="cs-brand-strip__logo is-${name}" aria-hidden="true"><img src="/assets/brands/${name}.${extension}" alt="" decoding="async" width="130" height="42"></span>`).join("");
  const update = () => {
    const slot = parseFloat(getComputedStyle(host).getPropertyValue("--brand-slot")) || 180;
    const groupWidth = brands.length * slot;
    const repeats = Math.max(2, Math.ceil(host.clientWidth / groupWidth) + 1);
    const signature = `${repeats}:${slot}`;
    if (host.dataset.repeats === signature) return;
    host.dataset.repeats = signature;
    const group = strip.repeat(repeats);
    host.innerHTML = `<div class="cs-brand-strip__track" style="--brand-duration:${Math.round(repeats * groupWidth / 48)}s"><div class="cs-brand-strip__group">${group}</div><div class="cs-brand-strip__group" aria-hidden="true">${group}</div></div>`;
  };
  new ResizeObserver(update).observe(host);
  update();
}

async function initialize() {
  renderIcons();
  renderHero();
  renderBrands();
  bindNewsletter({ previewDemo: PREVIEW_DEMO });
  try {
    const [, products] = await Promise.all([shellPromise, data.catalog()]);
    renderProducts(products);
  } catch (error) {
    document.querySelectorAll(".cs-loading-card").forEach(node => {
      node.className = "cs-empty-state";
      node.innerHTML = `${icon("info")}<strong>Catalogul nu a putut fi încărcat</strong><p>${escapeHtml(error.message)}</p><button type="button" onclick="location.reload()">Încearcă din nou</button>`;
    });
  }
}

initialize();
