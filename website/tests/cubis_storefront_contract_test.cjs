const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const website = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(website, file), 'utf8');
const pages = {
  'index.html': ['data-home-featured', 'data-home-categories', 'cubis-home.mjs'],
  'magazin.html': ['data-catalog-grid', 'data-filter-panel', 'cubis-catalog.mjs'],
  'produs.html': ['data-product-detail', 'data-product-tabs', 'cubis-product.mjs'],
};

for (const [file, markers] of Object.entries(pages)) {
  const html = read(file);
  assert.match(html, /Cubis Shop/i, `${file} must expose Cubis Shop identity`);
  assert.doesNotMatch(html, /G-Trots|GTrots|g-trots|assets\/logo\.png|theme\.js|theme\.css/i, `${file} leaked the legacy public identity or theme`);
  assert.match(html, /cubis-storefront\.css/, `${file} must use the shared design system`);
  for (const marker of markers) assert.ok(html.includes(marker), `${file} is missing ${marker}`);
}

const core = read('cubis-storefront.mjs');
const commerceApi = read('cubis-commerce-api.mjs');
for (const action of ['publicCatalogFilters', 'publicProductsPage', 'publicProduct', 'publicShopConfig']) {
  assert.ok(core.includes(action) || commerceApi.includes(action), `storefront core is missing live API action ${action}`);
}
assert.match(commerceApi, /API_URL = "\/shop-api\/api-v2\.php"/, 'storefront must use the same-origin API contract');
assert.match(commerceApi, /migrateHistoricalStorage/, 'existing browser commerce data must have an explicit migration path');
assert.match(core, /cubis-commerce-api\.mjs/, 'storefront must consume the preserved Cubis commerce client');
assert.match(core, /registration\.unregister\(\)/, 'legacy service worker registrations must be removed');
assert.match(core, /\^g-trots-\/i/, 'legacy browser caches must be removed');

const product = read('cubis-product.mjs');
assert.ok(product.includes('publicProductReviews'), 'product page must read public reviews');
assert.ok(product.includes('safeRichText'), 'product description must be sanitized');
assert.doesNotMatch(product, /createPublicReview|createPublicOrder|cancel/i, 'Phase C preview must not issue commerce or fiscal mutations');

const css = read('cubis-storefront.css');
for (const width of ['1280px', '900px', '768px', '520px']) assert.ok(css.includes(width), `responsive CSS is missing ${width}`);

console.log('cubis-storefront: OK · live API, light identity, safe product content, responsive contracts');
