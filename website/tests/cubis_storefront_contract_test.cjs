const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const website = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(website, file), 'utf8');
const pages = {
  'index.html': ['data-home-featured', 'data-home-benefits', 'cubis-home.mjs'],
  'magazin.html': ['data-catalog-grid', 'data-filter-panel', 'cubis-catalog.mjs'],
  'produs.html': ['data-product-detail', 'data-product-tabs', 'cubis-product.mjs'],
  'contact.html': ['data-contact-form', 'tel:+40726285155', 'office@cubisshop.ro', 'cubis-contact.mjs'],
  'cos.html': ['data-cart-items', 'data-cart-subtotal', 'cubis-cart.mjs'],
  'login.html': ['data-auth-form', 'data-auth-mode="login"', 'data-google-auth', 'cubis-auth.mjs'],
  'cont-nou.html': ['data-auth-form', 'data-auth-mode="register"', 'account_consent', 'cubis-auth.mjs'],
  'cont.html': ['data-account-app', 'data-account-profile-form', 'data-account-orders', 'cubis-account.mjs'],
};

for (const [file, markers] of Object.entries(pages)) {
  const html = read(file);
  assert.match(html, /Cubis Shop/i, `${file} must expose Cubis Shop identity`);
  assert.doesNotMatch(html, /G-Trots|GTrots|g-trots|assets\/logo\.png|theme\.js|theme\.css/i, `${file} leaked the legacy public identity or theme`);
  assert.match(html, /cubis-storefront\.css/, `${file} must use the shared design system`);
  for (const marker of markers) assert.ok(html.includes(marker), `${file} is missing ${marker}`);
}

const core = read('cubis-storefront.mjs');
const headerSource = core.slice(core.indexOf('function shellHeader'), core.indexOf('function shellFooter'));
const home = read('index.html');
const homeModule = read('cubis-home.mjs');
const catalogModule = read('cubis-catalog.mjs');
const commerceApi = read('cubis-commerce-api.mjs');
for (const action of ['publicCatalogFilters', 'publicProductsPage', 'publicProduct', 'publicShopConfig']) {
  assert.ok(core.includes(action) || commerceApi.includes(action), `storefront core is missing live API action ${action}`);
}
assert.match(commerceApi, /API_URL = "\/shop-api\/api-v2\.php"/, 'storefront must use the same-origin API contract');
assert.match(commerceApi, /migrateHistoricalStorage/, 'existing browser commerce data must have an explicit migration path');
assert.match(core, /cubis-commerce-api\.mjs/, 'storefront must consume the preserved Cubis commerce client');
assert.doesNotMatch(core, /cs-topbar/, 'the shared header must not render the removed benefits bar');
assert.doesNotMatch(core, /Datele juridice vor fi afișate după configurarea publică a magazinului/, 'the shared footer must not expose placeholder legal copy');
assert.match(core, /cs-all-categories/, 'the desktop header must expose the all-categories entry');
assert.doesNotMatch(headerSource, /filter\(category => !category\.parent_id\)\.slice\(0, 6\)/, 'the desktop header must not truncate primary categories');
assert.match(core, /function categoryTree/, 'the shared header must build the API category hierarchy');
assert.match(core, /desktopCategoryBranch/, 'the desktop header must render cascading category panels');
assert.match(core, /data-mobile-category-toggle/, 'the mobile menu must expose nested category controls');
assert.doesNotMatch(headerSource, /categoryIconName/, 'category navigation must not render decorative category icons');
assert.match(core, /registration\.unregister\(\)/, 'legacy service worker registrations must be removed');
assert.match(core, /\^g-trots-\/i/, 'legacy browser caches must be removed');
assert.doesNotMatch(home, /cs-hero__catalog-link|cs-hero__note/, 'the homepage hero must only link through its visible products button');
assert.doesNotMatch(homeModule, /cs-hero__catalog-link|cs-hero__note/, 'runtime hero rendering must not restore removed overlays');
assert.match(catalogModule, /expandedCategorySelection/, 'catalog filtering must include descendants of a selected parent category');
assert.match(catalogModule, /const targets = \{ category: state\.categories/, 'category URL state must map to the real categories set');

const product = read('cubis-product.mjs');
assert.ok(product.includes('publicProductReviews'), 'product page must read public reviews');
assert.ok(product.includes('safeRichText'), 'product description must be sanitized');
assert.doesNotMatch(product, /Produs fără recenzii/, 'products without reviews must not render a negative review label');
assert.match(product, /rating\.hidden = !hasReviews/, 'the summary rating row must disappear when there are no reviews');
assert.match(product, /main\.animate/, 'product image changes must use a visible transition');
assert.doesNotMatch(product, /Prețul, stocul și atributele afișate sunt încărcate direct din API-ul magazinului/, 'technical API copy must stay out of the customer-facing product description');
assert.match(product, /function bindRelatedCarousel/, 'related products must use an interactive carousel');
assert.match(product, /schedule\(1000\)/, 'related products must start automatic scrolling');
assert.doesNotMatch(product, /createPublicReview|createPublicOrder|cancel/i, 'Phase C preview must not issue commerce or fiscal mutations');

const css = read('cubis-storefront.css');
for (const width of ['1280px', '900px', '768px', '520px']) assert.ok(css.includes(width), `responsive CSS is missing ${width}`);
assert.match(css, /cs-category-flyout/, 'responsive CSS must style cascading category panels');
assert.match(css, /\.cs-product-thumbs button[\s\S]*?overflow: hidden/, 'product thumbnails must clip images inside their frame');
assert.match(css, /\.cs-product-tabs::-webkit-scrollbar[\s\S]*?display: none/, 'the touch-scrollable product tabs must hide their visual scrollbar');
assert.match(css, /\.cs-product-card__image-backdrop \{ display: none; \}/, 'product cards must not stack the decorative backdrop as a second product image');
assert.match(css, /min-width: 2200px[\s\S]*width: 73%/, 'large screens must constrain only the site width');
for (const asset of ['cubis-home-hero-background.png', 'cubis-home-hero-desktop.png', 'cubis-home-hero-mobile.png']) {
  assert.ok(fs.existsSync(path.join(website, 'assets', asset)), `homepage hero asset is missing: ${asset}`);
}

console.log('cubis-storefront: OK · live API, light identity, safe product content, responsive contracts');
