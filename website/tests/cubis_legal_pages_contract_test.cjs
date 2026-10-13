const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const website = path.join(__dirname, '..');
const legalPages = [
  'termeni-si-conditii.html',
  'politica-de-retur.html',
  'politica-de-confidentialitate.html',
  'politica-cookies.html',
  'livrare-si-plata.html',
  'plata-si-facturare.html',
  'garantii-si-reclamatii.html',
  'siguranta-produselor.html',
  'solutionarea-litigiilor.html',
  'conditii-b2b.html',
  'accesibilitate.html',
];

for (const page of legalPages) {
  const html = fs.readFileSync(path.join(website, page), 'utf8');
  assert.match(html, /data-site-header/);
  assert.match(html, /data-site-footer/);
  assert.match(html, /cubis-storefront\.css/);
  assert.match(html, /cubis-legal\.css/);
  assert.match(html, /cubis-legal\.mjs/);
  assert.doesNotMatch(html, /G-Trots|GTrots|g-trots/i, `${page} must not reuse legacy identity`);
}

const legalModule = fs.readFileSync(path.join(website, 'cubis-legal.mjs'), 'utf8');
assert.match(legalModule, /initShell\(\)/);
assert.match(legalModule, /config\?\.company/);
assert.match(legalModule, /config\?\.shipping_methods/);
assert.match(legalModule, /config\?\.payments/);
for (const field of ['legal_name', 'cui', 'registration_number', 'address', 'email', 'phone', 'bank_name', 'iban']) {
  assert.ok(legalModule.includes(field), `missing dynamic company field ${field}`);
}

const returnHtml = fs.readFileSync(path.join(website, 'solicita-retur.html'), 'utf8');
const returnModule = fs.readFileSync(path.join(website, 'cubis-return.mjs'), 'utf8');
assert.match(returnHtml, /name="order_number"/);
assert.match(returnHtml, /name="email"/);
assert.match(returnHtml, /Retrageți-vă din/);
assert.match(returnModule, /validateReturn\(access\)/);
assert.match(returnModule, /requestReturn/);
assert.match(returnModule, /withdrawal_statement/);

const cookies = fs.readFileSync(path.join(website, 'cubis-cookie-consent.mjs'), 'utf8');
assert.match(cookies, /necessary: true/);
assert.match(cookies, /preferences: Boolean/);
assert.doesNotMatch(cookies, /analytics|marketing/i);
assert.match(cookies, /data-cookie-settings/);

const api = fs.readFileSync(path.join(website, '..', 'shop-api', 'api.php'), 'utf8');
assert.match(api, /'2026-10-13', '2026-10-13'/);

console.log(`cubis-legal-pages: OK · ${legalPages.length} legal pages, live company/shipping/payment data, consent and return form`);
