const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const website = path.join(root, 'website');
const fixturePath = path.join(root, 'scripts', 'fixtures', 'cubis-storefront-demo.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const core = fs.readFileSync(path.join(website, 'cubis-storefront.mjs'), 'utf8');
const server = fs.readFileSync(path.join(root, 'scripts', 'serve-website.py'), 'utf8');

assert.equal(fixture.schema_version, 1, 'preview fixture schema must be versioned');
assert.equal(fixture.products.length, 20, 'preview fixture must contain 20 products');
assert.equal(fixture.filters.categories.length, 5, 'preview fixture must contain five categories');
assert.ok(fixture.filters.brands.length >= 6, 'preview fixture must cover several brands');
assert.ok(new Set(fixture.products.map(product => product.images?.[0]?.url).filter(Boolean)).size >= 12, 'preview products must use varied images');
assert.ok(fixture.products.some(product => Number(product.sale_price) < Number(product.price)), 'preview fixture must include reductions');

assert.equal(fs.existsSync(path.join(website, 'cubis-storefront-demo.json')), false, 'fixture data must stay outside the production website root');
assert.match(server, /--demo-fixtures/, 'local server must require an explicit demo flag');
assert.match(server, /X-Cubis-Preview-Only/, 'preview responses must be marked by a dedicated header');
assert.match(core, /localhost\|127\\\.0\\\.0\\\.1/, 'demo mode must be restricted to local hosts');
assert.match(core, /previewParams\.get\("demo"\) === "1"/, 'demo mode must require an explicit query opt-in');
assert.match(core, /X-Cubis-Preview-Only/, 'the client must reject unmarked fixture responses');
assert.match(core, /cubis-preview-cart-v1/, 'preview commerce state must use isolated local storage');

console.log('cubis-preview-fixtures: OK · 20 products, 5 categories, local-only flag, isolated preview storage');
