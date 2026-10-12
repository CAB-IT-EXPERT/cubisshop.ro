const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../cubis-storefront.css'), 'utf8');
const trust = html.match(/<section class="cs-section cs-trust-section"[\s\S]*?<\/section>/)?.[0];
const guides = html.match(/<section class="cs-section cs-guides-section"[\s\S]*?<\/section>/)?.[0];
assert.ok(trust && guides, 'homepage sections remain present');
const sectionOrder = ['featured-title', 'why-title', 'new-title'].map(id => html.indexOf(`id="${id}"`));
assert.ok(sectionOrder.every(index => index >= 0) && sectionOrder[0] < sectionOrder[1] && sectionOrder[1] < sectionOrder[2], 'De ce Cubis Shop must stay between the two product carousels');
assert.equal((trust.match(/<article\b/g) || []).length, 4);
assert.equal((guides.match(/<a\b/g) || []).length, 3);
assert.ok(!trust.includes('<a '), 'informational benefits must not look like new navigation');

for (const [variant, title] of [
  ['verified', 'Date comerciale verificate'],
  ['compatible', 'Compatibilitate clară'],
  ['delivery', 'Livrare rapidă'],
  ['support', 'Suport dedicat'],
]) {
  assert.ok(trust.includes(`class="cs-trust-card is-${variant}"`));
  assert.ok(trust.includes(`<h3>${title}</h3>`));
}
for (const [variant, href] of [
  ['discover', '/magazin'], ['track', '/urmarire-comanda'], ['help', '/contact'],
]) {
  assert.ok(guides.includes(`class="cs-guide-card is-${variant}" href="${href}"`));
}
const decorations = [...html.matchAll(/<span class="cs-(?:trust-card__(?:icon|motif)|guide-card__scene)"[^>]*>/g)];
assert.equal(decorations.length, 11);
assert.ok(decorations.every(([tag]) => tag.includes('aria-hidden="true"')));
assert.equal((guides.match(/focusable="false"/g) || []).length, 3);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.cs-trust-section[\s\S]*?animation: none;/);
assert.match(css, /\.cs-guides-section \.cs-guide-grid > a:focus-visible\s*\{[^}]*outline:/);
assert.match(css, /\.cs-trust-section \.cs-trust-grid\s*\{[^}]*minmax\(0, 1fr\)/);
console.log('cubis-home-sections: OK · trust panel between product carousels, 4 benefits, 3 unchanged routes');
