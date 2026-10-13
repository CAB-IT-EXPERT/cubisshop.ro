const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const website = path.join(__dirname, '..');
const core = fs.readFileSync(path.join(website, 'cubis-storefront.mjs'), 'utf8').replace(/\r\n/g, '\n');
const html = fs.readFileSync(path.join(website, 'index.html'), 'utf8');
const home = fs.readFileSync(path.join(website, 'cubis-home.mjs'), 'utf8');
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const sections = Array.from({ length: 4 }, (_, index) => ({
  open: true,
  classList: { contains: name => index === 3 && name === 'cs-footer__section--security' },
  summary: { tabIndex: 0, addEventListener(event, callback) { this.onClick = callback; } },
  querySelector() { return this.summary; },
}));
const mobile = { matches: true, addEventListener(event, callback) { this.onChange = callback; } };
const context = vm.createContext({
  escapeHtml, icon: name => `<svg data-icon="${name}"></svg>`,
  document: { querySelectorAll: () => sections }, window: { matchMedia: () => mobile },
});
vm.runInContext(core.slice(core.indexOf('function cleanCompany'), core.indexOf('function categoryIdentity')), context);
vm.runInContext(core.slice(core.indexOf('function shellFooter'), core.indexOf('class CatalogSearch')), context);
context.filters = { categories: [{ id: 'root & one', name: 'Categorie <test>' }, { id: 'child', parent_id: 'root & one', name: 'Subcategorie' }] };
context.config = { company: { legal_name: 'Cubis & Company', email: 'support@example.com', phone: '+40 123 456', address: 'Strada Test' } };
const footer = vm.runInContext('shellFooter(filters, config)', context);
for (const route of ['/livrare-si-plata', '/politica-de-retur', '/termeni-si-conditii', '/politica-de-confidentialitate', '/contact', '/urmarire-comanda', '/solicita-retur', '/garantii-si-reclamatii', '/politica-cookies', '/plata-si-facturare', '/siguranta-produselor', '/solutionarea-litigiilor', '/conditii-b2b', '/accesibilitate']) {
  assert.ok(footer.includes(`href="${route}"`), `preserve ${route}`);
}
assert.match(footer, /data-cookie-settings/);
assert.match(footer, /mailto:support@example.com/);
assert.match(footer, /tel:\+40123456/);
assert.match(footer, /Cubis &amp; Company/);
assert.match(footer, /category=root%20%26%20one/);
assert.match(footer, /Categorie &lt;test&gt;/);
assert.doesNotMatch(footer, /Subcategorie|Piese mici|Posibilități mari|facebook|instagram|tiktok/i);
assert.match(footer, /https:\/\/anpc.ro\/sal\//);
assert.equal((footer.match(/Designed by/g) || []).length, 4, 'visible credit and accessible name in both placements');
assert.match(vm.runInContext('shellFooter({}, {})', context), /Vezi catalogul/);
assert.deepEqual(fs.readFileSync(path.join(website, 'assets/cab-it-original.png')), fs.readFileSync(path.join(website, '../assets/images/cab-it-logo.png')), 'use original CAB-IT asset without alteration');
vm.runInContext('bindFooterSections()', context);
assert.deepEqual(sections.map(section => section.open), [false, false, false, true]);
assert.ok(sections.every(section => section.summary.tabIndex === 0));
let prevented = false;
sections[0].summary.onClick({ preventDefault() { prevented = true; } });
assert.equal(prevented, false, 'native mobile disclosure must remain operable');
mobile.matches = false;
mobile.onChange();
assert.ok(sections.every(section => section.open && section.summary.tabIndex === -1));
sections[0].summary.onClick({ preventDefault() { prevented = true; } });
assert.equal(prevented, true, 'desktop columns stay expanded');
assert.match(html, /autocomplete="email"/);
assert.match(html, /data-newsletter-message role="status"/);
assert.match(home, /bindNewsletter\(\{ previewDemo: PREVIEW_DEMO \}\)/);
assert.match(html, /id="newsletter-consent"/);
console.log('cubis-footer: OK · original logos, preserved links/company data, safe escaping, responsive disclosures, shared newsletter binding');
