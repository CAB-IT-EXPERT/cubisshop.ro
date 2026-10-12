const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const website = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(website, 'favorite.html'), 'utf8');
const css = fs.readFileSync(path.join(website, 'cubis-favorites.css'), 'utf8');
const script = fs.readFileSync(path.join(website, 'cubis-favorites.mjs'), 'utf8');
const storefront = fs.readFileSync(path.join(website, 'cubis-storefront.mjs'), 'utf8');

for (const marker of [
  'data-site-header',
  'data-site-footer',
  'data-favorites-grid',
  'data-select-all',
  'data-delete-selected',
  'data-add-selected',
  'data-add-all-favorites',
  'data-share-favorites',
  'data-recommendations-rail',
]) assert.ok(html.includes(marker), `favorite page must include ${marker}`);

assert.match(script, /commerce\.favorites\(\)/, 'favorite page must use the shared favorite store');
assert.match(script, /commerce\.registerProducts\(products\)/, 'favorite page must register products with the shared cart store');
assert.match(script, /data-product-add/, 'favorite cards must expose the shared add-to-cart interaction');
assert.match(script, /state\.selected/, 'favorite page must keep an explicit bulk selection');
assert.match(script, /navigator\.share/, 'favorite lists must support native sharing where available');
assert.match(script, /navigator\.clipboard\.writeText/, 'favorite list sharing must have a clipboard fallback');
assert.match(script, /\.filter\(product => !favoriteIds\.has\(product\.id\)/, 'recommendations must exclude products already in favorites');
assert.match(css, /\.cs-favorites-grid \{[^}]*repeat\(4,\s*minmax\(0,\s*1fr\)\)/, 'desktop favorites must use four balanced cards');
assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.cs-favorite-card \{[^}]*grid-template-columns:\s*112px\s+minmax\(0,1fr\)/, 'mobile favorites must become compact horizontal rows');
assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.cs-favorites-mobile-add-all \{[^}]*display:\s*flex/, 'mobile must expose the touch-friendly add-all button');
assert.match(css, /\.cs-favorites-benefits \.cs-container \{[^}]*repeat\(4,\s*minmax\(0,1fr\)\)/, 'the page must include a balanced trust strip');
assert.match(storefront, /trash:[\s\S]*share:/, 'the shared icon set must support favorite-page actions');
assert.match(storefront, /const favoritesHref = "\/favorite";/, 'shared navigation must use the clean favorites route');

const localServer = fs.readFileSync(path.resolve(website, '..', 'scripts', 'serve-website.py'), 'utf8');
assert.match(localServer, /if html_candidate\.is_file\(\):[\s\S]*self\.path = urlunsplit[\s\S]*return super\(\)\.send_head\(\)/, 'the local server must immediately serve extensionless HTML routes');

console.log('cubis-favorites: OK · shared shell, responsive list, bulk actions, sharing and recommendations');
