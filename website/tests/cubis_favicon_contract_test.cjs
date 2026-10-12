const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const website = path.resolve(__dirname, '..');
const project = path.resolve(website, '..');
const favicon = '/assets/cubis-shop-icon.png?v=20261012';
const files = [
  ...fs.readdirSync(website).filter(file => file.endsWith('.html')).map(file => path.join(website, file)),
  path.join(project, 'scripts/apply-search-metadata.mjs'),
  path.join(project, 'scripts/generate-product-seo-pages.mjs'),
];
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  assert.ok(source.includes(`<link rel="icon" href="${favicon}" type="image/png">`), `${path.basename(file)} must use the actual Cubis symbol`);
  assert.ok(source.includes(`<link rel="apple-touch-icon" href="${favicon}">`), `${path.basename(file)} must use the same mobile icon`);
  assert.doesNotMatch(source, /rel="(?:icon|shortcut icon|apple-touch-icon)"[^>]+(?:cubis-favicon\.png|\/assets\/(?:logo|favicon)\.png)/, `${path.basename(file)} must not reference legacy icon artwork`);
}
const icon = fs.readFileSync(path.join(website, 'assets/cubis-shop-icon.png'));
assert.deepEqual(icon.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
assert.ok(icon.readUInt32BE(16) === icon.readUInt32BE(20), 'the Cubis icon must be square');
assert.notDeepEqual(icon, fs.readFileSync(path.join(website, 'assets/cubis-favicon.png')), 'the selected artwork must not be the old GT favicon');
console.log('cubis-favicon: OK · all website templates and generated pages use the Cubis symbol, including mobile');
