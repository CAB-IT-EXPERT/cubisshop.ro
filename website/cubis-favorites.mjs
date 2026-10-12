import { commerce, data, escapeHtml, icon, initShell, money, productRoute } from "./cubis-storefront.mjs?v=20261012-favorites";

const state = {
  products: [],
  selected: new Set(),
  suppressFavoriteRender: false,
  toastTimer: 0,
};

const shellPromise = initShell({ active: "favorites" });

function ratingMarkup(product, compact = false) {
  if (product.rating === null || !Number.isFinite(product.rating)) return "";
  return `<span class="${compact ? "cs-favorite-recommendation__rating" : "cs-favorite-card__rating"}" aria-label="Rating ${product.rating.toFixed(1)} din 5">${icon("star")}<strong>${product.rating.toFixed(1)}</strong><span>(${product.reviewCount})</span></span>`;
}

function productImage(product) {
  return product.imageUrl
    ? `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" width="520" height="420" loading="lazy" decoding="async">`
    : `<span class="cs-product-placeholder">${icon("package")}</span>`;
}

function favoriteCard(product) {
  const selected = state.selected.has(product.id);
  const route = productRoute(product);
  return `<article class="cs-favorite-card${selected ? " is-selected" : ""}" data-favorite-card="${escapeHtml(product.id)}" data-product-card="${escapeHtml(product.id)}">
    <div class="cs-favorite-card__media">
      <span class="cs-favorite-card__stock${product.inStock ? "" : " is-unavailable"}">${product.inStock ? "În stoc" : "Indisponibil"}</span>
      <button class="cs-favorite-card__remove" type="button" data-favorite-remove="${escapeHtml(product.id)}" aria-label="Elimină ${escapeHtml(product.name)} din favorite">${icon("close")}</button>
      <a href="${route}" aria-label="Vezi ${escapeHtml(product.name)}">${productImage(product)}</a>
    </div>
    <div class="cs-favorite-card__body">
      <div class="cs-favorite-card__title-row"><label class="cs-favorite-card__select"><input type="checkbox" data-favorite-select="${escapeHtml(product.id)}" ${selected ? "checked" : ""} aria-label="Selectează ${escapeHtml(product.name)}"><span aria-hidden="true"></span></label><a class="cs-favorite-card__title" href="${route}">${escapeHtml(product.name)}</a></div>
      ${ratingMarkup(product)}
      <div class="cs-favorite-card__price"><strong>${escapeHtml(money(product.price, product.currency))}</strong>${product.oldPrice ? `<del>${escapeHtml(money(product.oldPrice, product.currency))}</del>` : ""}</div>
      <div class="cs-favorite-card__actions"><a class="cs-favorite-card__details" href="${route}"><span>Vezi detalii</span>${icon("arrow")}</a><button class="cs-add-button" type="button" data-product-add="${escapeHtml(product.id)}" ${product.inStock ? "" : "disabled"}><span data-add-icon="cart">${icon("cart")}</span><span data-add-label>${product.inStock ? "Adaugă în coș" : "Indisponibil"}</span></button></div>
    </div>
  </article>`;
}

function recommendationCard(product) {
  return `<article class="cs-favorite-recommendation">
    <a class="cs-favorite-recommendation__image" href="${productRoute(product)}">${productImage(product)}</a>
    <div class="cs-favorite-recommendation__body"><a href="${productRoute(product)}">${escapeHtml(product.name)}</a><strong>${escapeHtml(money(product.price, product.currency))}</strong>${ratingMarkup(product, true)}</div>
    <button class="cs-favorite-recommendation__favorite" type="button" data-product-favorite="${escapeHtml(product.id)}" aria-label="Adaugă în favorite" aria-pressed="false">${icon("heart")}</button>
  </article>`;
}

function favoriteProducts() {
  const ids = commerce.favorites();
  const byId = new Map(state.products.map(product => [product.id, product]));
  return ids.map(id => byId.get(id)).filter(Boolean);
}

function showToast(message) {
  const toast = document.querySelector("[data-favorites-toast]");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
}

function syncSelection(products = favoriteProducts()) {
  const ids = new Set(products.map(product => product.id));
  state.selected = new Set([...state.selected].filter(id => ids.has(id)));
  const selectedCount = state.selected.size;
  const all = Boolean(products.length && selectedCount === products.length);
  const selectAll = document.querySelector("[data-select-all]");
  selectAll.checked = all;
  selectAll.indeterminate = selectedCount > 0 && !all;
  document.querySelector("[data-selected-count]").textContent = String(selectedCount);
  document.querySelector("[data-add-selected]").disabled = selectedCount === 0;
  document.querySelector("[data-delete-selected]").disabled = selectedCount === 0;
  document.querySelectorAll("[data-favorite-card]").forEach(card => card.classList.toggle("is-selected", state.selected.has(card.dataset.favoriteCard)));
}

function updateRecommendationControls() {
  const rail = document.querySelector("[data-recommendations-rail]");
  const previous = document.querySelector("[data-recommendations-prev]");
  const next = document.querySelector("[data-recommendations-next]");
  if (!rail || !previous || !next) return;
  const overflow = rail.scrollWidth > rail.clientWidth + 2;
  previous.hidden = !overflow;
  next.hidden = !overflow;
  previous.disabled = rail.scrollLeft <= 2;
  next.disabled = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 2;
}

function renderRecommendations(favorites) {
  const favoriteIds = new Set(favorites.map(product => product.id));
  const rows = state.products
    .filter(product => !favoriteIds.has(product.id) && product.inStock)
    .sort((a, b) => Number(b.featured) - Number(a.featured) || Number(b.viewCount || 0) - Number(a.viewCount || 0))
    .slice(0, 12);
  const section = document.querySelector("[data-recommendations-section]");
  section.hidden = rows.length === 0;
  document.querySelector("[data-recommendations-rail]").innerHTML = rows.map(recommendationCard).join("");
  requestAnimationFrame(updateRecommendationControls);
}

function renderFavorites() {
  const products = favoriteProducts();
  const content = document.querySelector("[data-favorites-content]");
  const empty = document.querySelector("[data-favorites-empty]");
  const grid = document.querySelector("[data-favorites-grid]");
  const count = products.length;
  content.hidden = count === 0;
  empty.hidden = count !== 0;
  document.querySelector("[data-favorites-summary]").textContent = count
    ? `Ai ${count} ${count === 1 ? "produs" : "produse"} în lista de favorite. Le poți adăuga în coș, selecta sau elimina oricând.`
    : "Lista ta este pregătită pentru produsele pe care vrei să le păstrezi aproape.";
  grid.innerHTML = products.map(favoriteCard).join("");
  syncSelection(products);
  renderRecommendations(products);
  commerce.sync();
}

function addProductsToCart(products) {
  const inCart = new Set(commerce.cart().map(row => row.id));
  const available = products.filter(product => product?.inStock);
  let added = 0;
  available.forEach(product => {
    if (inCart.has(product.id)) return;
    commerce.add(product.id);
    inCart.add(product.id);
    added += 1;
  });
  if (added) showToast(`${added} ${added === 1 ? "produs a fost adăugat" : "produse au fost adăugate"} în coș.`);
  else showToast(available.length ? "Produsele selectate sunt deja în coș." : "Produsele selectate nu sunt disponibile momentan.");
}

function bindActions() {
  const grid = document.querySelector("[data-favorites-grid]");
  grid.addEventListener("change", event => {
    const input = event.target.closest("[data-favorite-select]");
    if (!input) return;
    if (input.checked) state.selected.add(input.dataset.favoriteSelect);
    else state.selected.delete(input.dataset.favoriteSelect);
    syncSelection();
  });
  grid.addEventListener("click", event => {
    const remove = event.target.closest("[data-favorite-remove]");
    if (!remove) return;
    const id = remove.dataset.favoriteRemove;
    const card = remove.closest("[data-favorite-card]");
    card.classList.add("is-removing");
    setTimeout(() => {
      if (commerce.favorites().includes(id)) commerce.toggleFavorite(id);
      state.selected.delete(id);
    }, 190);
  });

  document.querySelector("[data-select-all]").addEventListener("change", event => {
    state.selected = event.target.checked ? new Set(favoriteProducts().map(product => product.id)) : new Set();
    document.querySelectorAll("[data-favorite-select]").forEach(input => { input.checked = event.target.checked; });
    syncSelection();
  });
  document.querySelector("[data-add-selected]").addEventListener("click", () => addProductsToCart(favoriteProducts().filter(product => state.selected.has(product.id))));
  document.querySelector("[data-add-all-favorites]").addEventListener("click", () => addProductsToCart(favoriteProducts()));
  document.querySelector("[data-delete-selected]").addEventListener("click", () => {
    const ids = [...state.selected];
    state.suppressFavoriteRender = true;
    ids.forEach(id => { if (commerce.favorites().includes(id)) commerce.toggleFavorite(id); });
    state.suppressFavoriteRender = false;
    state.selected.clear();
    renderFavorites();
    showToast(`${ids.length} ${ids.length === 1 ? "produs a fost eliminat" : "produse au fost eliminate"} din favorite.`);
  });
  document.querySelector("[data-share-favorites]").addEventListener("click", async () => {
    const count = favoriteProducts().length;
    const shareData = { title: "Produsele mele favorite — Cubis Shop", text: `Am salvat ${count} ${count === 1 ? "produs" : "produse"} în lista mea de favorite Cubis Shop.`, url: location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(location.href);
        showToast("Linkul listei a fost copiat.");
      }
    } catch (error) {
      if (error?.name !== "AbortError") showToast("Lista nu a putut fi distribuită momentan.");
    }
  });

  const rail = document.querySelector("[data-recommendations-rail]");
  document.querySelector("[data-recommendations-prev]").addEventListener("click", () => rail.scrollBy({ left: -Math.max(280, rail.clientWidth * .72), behavior: "smooth" }));
  document.querySelector("[data-recommendations-next]").addEventListener("click", () => rail.scrollBy({ left: Math.max(280, rail.clientWidth * .72), behavior: "smooth" }));
  rail.addEventListener("scroll", updateRecommendationControls, { passive: true });
  addEventListener("resize", updateRecommendationControls, { passive: true });
  commerce.addEventListener("change", event => {
    if (event.detail?.type === "favorites" && !state.suppressFavoriteRender) renderFavorites();
  });
}

function renderStaticIcons() {
  document.querySelector("[data-favorites-heart]").innerHTML = icon("heart");
  document.querySelector("[data-share-icon]").innerHTML = icon("share");
  document.querySelector("[data-add-all-icon]").innerHTML = icon("cart");
  document.querySelector("[data-delete-selected-icon]").innerHTML = icon("trash");
  document.querySelector("[data-add-selected-icon]").innerHTML = icon("cart");
  document.querySelector("[data-empty-heart]").innerHTML = icon("heart");
  document.querySelector("[data-sparkle-icon]").innerHTML = icon("star");
  document.querySelector("[data-recommendations-prev-icon]").innerHTML = icon("chevron");
  document.querySelector("[data-recommendations-next-icon]").innerHTML = icon("chevron");
  document.querySelectorAll("[data-benefit-icon]").forEach(node => { node.innerHTML = icon(node.dataset.benefitIcon); });
}

async function initialize() {
  renderStaticIcons();
  bindActions();
  try {
    const [, products] = await Promise.all([shellPromise, data.catalog()]);
    state.products = products;
    commerce.registerProducts(products);
    renderFavorites();
  } catch {
    document.querySelector("[data-favorites-grid]").innerHTML = `<div class="cs-empty-state">${icon("info")}<strong>Lista nu poate fi încărcată momentan</strong><p>Reîncarcă pagina sau revino peste câteva momente.</p></div>`;
  }
}

initialize();
