import { commerce, data, escapeHtml, icon, initShell, money, productRoute } from "./cubis-storefront.mjs?v=20261012-cart";

const state = { products: [], toastTimer: 0 };
const elements = {
  loading: document.querySelector("[data-cart-loading]"),
  empty: document.querySelector("[data-cart-empty]"),
  content: document.querySelector("[data-cart-content]"),
  items: document.querySelector("[data-cart-items]"),
  heroCount: document.querySelector("[data-cart-hero-count]"),
  listCount: document.querySelector("[data-cart-list-count]"),
  subtotal: document.querySelector("[data-cart-subtotal]"),
  total: document.querySelector("[data-cart-total]"),
  savingsRow: document.querySelector("[data-cart-savings-row]"),
  savings: document.querySelector("[data-cart-savings]"),
  checkout: document.querySelector("[data-cart-checkout]"),
  toast: document.querySelector("[data-cart-toast]"),
};

const shellPromise = initShell({ active: "cart" });

document.querySelector("[data-cart-hero-icon]").innerHTML = icon("cart");
document.querySelector("[data-cart-empty-icon]").innerHTML = icon("cart");
document.querySelector("[data-cart-checkout-icon]").innerHTML = icon("lock");
document.querySelector("[data-cart-checkout-arrow]").innerHTML = icon("arrow");
document.querySelectorAll("[data-assurance-icon]").forEach(host => { host.innerHTML = icon(host.dataset.assuranceIcon); });

function pluralProducts(count) {
  return `${count} ${count === 1 ? "produs" : "produse"}`;
}

function productImage(product) {
  return product?.imageUrl
    ? `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" width="360" height="300" loading="lazy" decoding="async">`
    : `<span class="cs-cart-item__placeholder">${icon("package")}</span>`;
}

function cartRows() {
  const byId = new Map();
  state.products.forEach(product => {
    [product.id, product.slug, product.apiId, product.sku].filter(Boolean).forEach(key => byId.set(String(key), product));
  });
  return commerce.cart().map(row => ({ ...row, product: byId.get(row.id) || commerce.products[row.id] || null }));
}

function cartItem({ id, quantity, product }) {
  if (!product) {
    return `<article class="cs-cart-item is-unavailable" data-cart-item="${escapeHtml(id)}">
      <span class="cs-cart-item__placeholder">${icon("package")}</span>
      <div class="cs-cart-item__body"><span class="cs-cart-item__category">Indisponibil</span><h3>Acest produs nu mai este disponibil</h3><p>Îl poți elimina din coș și alege o alternativă din catalog.</p></div>
      <button class="cs-cart-item__remove" type="button" data-cart-remove="${escapeHtml(id)}" aria-label="Elimină produsul indisponibil">${icon("trash")}</button>
    </article>`;
  }

  const itemTotal = product.price * quantity;
  const oldTotal = product.oldPrice ? product.oldPrice * quantity : 0;
  const maxQuantity = product.stockMode === "tracked" && product.stockQuantity > 0 ? Math.min(99, product.stockQuantity) : 99;
  return `<article class="cs-cart-item" data-cart-item="${escapeHtml(id)}">
    <a class="cs-cart-item__media" href="${productRoute(product)}" aria-label="Vezi ${escapeHtml(product.name)}">
      ${productImage(product)}
      <span class="cs-cart-item__stock${product.inStock ? "" : " is-out"}">${icon(product.inStock ? "check" : "info")} ${product.inStock ? "În stoc" : "Indisponibil"}</span>
    </a>
    <div class="cs-cart-item__body">
      <span class="cs-cart-item__category">${escapeHtml(product.categoryName || "Produs Cubis Shop")}</span>
      <h3><a href="${productRoute(product)}">${escapeHtml(product.name)}</a></h3>
      ${product.short_description ? `<p>${escapeHtml(product.short_description)}</p>` : ""}
      <span class="cs-cart-item__sku">SKU: ${escapeHtml(product.sku || "—")}</span>
    </div>
    <div class="cs-cart-item__price">
      <small>Preț unitar</small><strong>${escapeHtml(money(product.price, product.currency))}</strong>${product.oldPrice ? `<del>${escapeHtml(money(product.oldPrice, product.currency))}</del>` : ""}
    </div>
    <div class="cs-cart-item__controls" role="group" aria-label="Cantitate pentru ${escapeHtml(product.name)}">
      <button type="button" data-cart-decrease="${escapeHtml(id)}" aria-label="Scade cantitatea" ${quantity <= 1 ? "disabled" : ""}>${icon("minus")}</button>
      <output aria-label="Cantitate">${quantity}</output>
      <button type="button" data-cart-increase="${escapeHtml(id)}" data-cart-max="${maxQuantity}" aria-label="Crește cantitatea" ${quantity >= maxQuantity || !product.inStock ? "disabled" : ""}>${icon("plus")}</button>
    </div>
    <div class="cs-cart-item__total"><small>Total</small><strong>${escapeHtml(money(itemTotal, product.currency))}</strong>${oldTotal > itemTotal ? `<span>Economisești ${escapeHtml(money(oldTotal - itemTotal, product.currency))}</span>` : ""}</div>
    <button class="cs-cart-item__remove" type="button" data-cart-remove="${escapeHtml(id)}" aria-label="Elimină ${escapeHtml(product.name)} din coș">${icon("trash")}</button>
  </article>`;
}

function showToast(message, variant = "") {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.className = `cs-cart-toast${variant ? ` is-${variant}` : ""}`;
  elements.toast.hidden = false;
  state.toastTimer = window.setTimeout(() => { elements.toast.hidden = true; }, 2800);
}

function renderCart() {
  const rows = cartRows();
  const validRows = rows.filter(row => row.product);
  const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0);
  const subtotal = validRows.reduce((sum, row) => sum + row.product.price * row.quantity, 0);
  const oldSubtotal = validRows.reduce((sum, row) => sum + (row.product.oldPrice || row.product.price) * row.quantity, 0);
  const savings = Math.max(0, oldSubtotal - subtotal);
  const currency = validRows[0]?.product?.currency || "RON";

  elements.loading.hidden = true;
  elements.empty.hidden = rows.length > 0;
  elements.content.hidden = rows.length === 0;
  elements.heroCount.textContent = pluralProducts(totalQuantity);
  elements.listCount.textContent = pluralProducts(totalQuantity);
  elements.items.innerHTML = rows.map(cartItem).join("");
  elements.subtotal.textContent = money(subtotal, currency);
  elements.total.textContent = money(subtotal, currency);
  elements.savingsRow.hidden = savings <= 0;
  elements.savings.textContent = savings > 0 ? `−${money(savings, currency)}` : money(0, currency);
  elements.checkout.disabled = rows.length === 0 || validRows.length !== rows.length || validRows.some(row => !row.product.inStock);
  commerce.sync();
}

elements.items.addEventListener("click", event => {
  const remove = event.target.closest("[data-cart-remove]");
  if (remove) {
    const card = remove.closest("[data-cart-item]");
    card?.classList.add("is-removing");
    window.setTimeout(() => commerce.remove(remove.dataset.cartRemove), 190);
    return;
  }

  const decrease = event.target.closest("[data-cart-decrease]");
  if (decrease && !decrease.disabled) {
    commerce.changeQuantity(decrease.dataset.cartDecrease, -1);
    return;
  }

  const increase = event.target.closest("[data-cart-increase]");
  if (increase && !increase.disabled) {
    const row = commerce.cart().find(item => item.id === increase.dataset.cartIncrease);
    if (row && row.quantity >= Number(increase.dataset.cartMax || 99)) {
      showToast("Ai ajuns la cantitatea maximă disponibilă.", "warning");
      return;
    }
    commerce.changeQuantity(increase.dataset.cartIncrease, 1);
  }
});

elements.checkout.addEventListener("click", () => {
  if (elements.checkout.disabled) return;
  location.href = "/checkout";
});

commerce.addEventListener("change", event => {
  if (event.detail?.type === "cart") renderCart();
});

addEventListener("storage", event => {
  if (event.key?.includes("cart")) renderCart();
});

try {
  const [, products] = await Promise.all([shellPromise, data.catalog()]);
  state.products = products;
  commerce.registerProducts(products);
  renderCart();
} catch {
  await shellPromise;
  elements.loading.innerHTML = `${icon("info")}<strong>Coșul nu a putut fi încărcat momentan.</strong><button type="button" data-cart-retry>Încearcă din nou</button>`;
  elements.loading.querySelector("[data-cart-retry]")?.addEventListener("click", () => location.reload());
}
