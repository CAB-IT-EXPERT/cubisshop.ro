const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const website = path.join(__dirname, '..', 'website');
const read = file => fs.readFileSync(path.join(website, file), 'utf8');
const pages = ['index.html', 'magazin.html', 'produs.html'];

for (const file of pages) {
  const html = read(file);
  assert.match(html, /<html[^>]+data-theme="light"/i, `${file} must start in light mode`);
  assert.match(html, /<meta[^>]+name="color-scheme"[^>]+content="light"/i, `${file} must advertise light-only controls`);
  assert.match(html, /cubis-storefront\.css/i, `${file} must load the Cubis design system`);
  assert.doesNotMatch(html, /g-trots|gt-theme-bootstrap|theme\.js|theme\.css/i, `${file} must not load the legacy public theme`);
}

const storefront = read('cubis-storefront.mjs');
assert.match(storefront, /document\.documentElement\.dataset\.theme = "light"/, 'the Cubis shell must enforce the light theme');
assert.match(storefront, /document\.documentElement\.style\.colorScheme = "light"/, 'native controls must remain light');
assert.doesNotMatch(storefront, /GTrotsTheme|g-trots-color-theme/, 'the Cubis shell must not expose the legacy theme runtime');

const css = read('cubis-storefront.css');
assert.match(css, /--cs-blue-700:/, 'the Cubis color system must define its primary blue');
assert.match(css, /--cs-cyan-100:/, 'the Cubis color system must define its cyan accent');

console.log('public-theme: OK · Cubis storefront is light-only and independent from the legacy theme');
