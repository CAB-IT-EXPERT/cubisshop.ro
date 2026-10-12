const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const core = fs.readFileSync(path.join(__dirname, '../cubis-storefront.mjs'), 'utf8').replace(/\r\n/g, '\n');
const css = fs.readFileSync(path.join(__dirname, '../cubis-storefront.css'), 'utf8');
assert.match(css, /\.cs-mobile-drawer aside \{[^}]*display: flex;[^}]*overflow: hidden;/, 'the fixed panel must never scroll content behind its header');
assert.match(css, /\.cs-mobile-drawer__scroll \{[^}]*overflow-y: auto;[^}]*scrollbar-width: none;/, 'only the inner drawer body may scroll');
assert.match(css, /\.cs-mobile-drawer \{[^}]*z-index:\s*1000[^}]*height:\s*100dvh[^}]*overflow:\s*hidden/, 'mobile drawer must cover the full viewport above the sticky shell');
assert.match(css, /\.cs-mobile-drawer aside \{[^}]*inset:\s*0 auto 0 0[^}]*height:\s*100dvh[^}]*border-radius:\s*0 24px 24px 0/, 'mobile menu panel must start at the first pixel without exposing page content above it');
assert.match(css, /\.cs-mobile-drawer__scroll::-webkit-scrollbar \{ display: none;/);
assert.match(css, /\.cs-mobile-drawer__head \{ position: relative;[^}]*flex: 0 0 auto;/);
const context = vm.createContext({
  escapeHtml: value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])),
  safeUrl: value => /^https?:\/\//.test(value) ? value : '',
  previewUrl: value => value,
  icon: name => `<svg data-icon="${name}"></svg>`,
  readJson: () => null, STORAGE: { customerProfile: 'customer' },
  PREVIEW_DEMO: false,
});
vm.runInContext(core.slice(core.indexOf('function categoryIdentity'), core.indexOf('function shellFooter')), context);
context.filters = { categories: [
  { id: 'auto', name: 'Auto și mobilitate', thumbnail_url: null },
  { id: 'accessories & more', parent_id: 'auto', name: 'Accesorii auto', thumbnail_url: 'https://example.test/category.png' },
  { id: 'third', parent_id: 'accessories & more', name: 'A treia <categorie>', thumbnail_url: null },
  { id: 'unsafe', name: 'Invalid image', thumbnail_url: 'javascript:alert(1)' },
] };
const header = vm.runInContext('shellHeader("", filters, {})', context);
const mobileMarkup = header.slice(header.indexOf('<div class="cs-mobile-drawer"'));
assert.equal((mobileMarkup.match(/data-mobile-category-image/g) || []).length, 1, 'only categories with a valid API thumbnail get an image');
assert.match(mobileMarkup, /src="https:\/\/example.test\/category.png"/);
assert.doesNotMatch(mobileMarkup, /cs-mobile-category-icon|data-icon="car"|data-icon="home"|data-icon="run"|javascript:/);
assert.match(mobileMarkup, /category=accessories%20%26%20more#catalog/);
assert.match(mobileMarkup, /A treia &lt;categorie&gt;/);
assert.match(mobileMarkup, /aria-controls="cs-mobile-category-1-accessories%20%26%20more"/);
assert.match(mobileMarkup, /id="cs-mobile-category-1-accessories%20%26%20more" hidden/);
assert.match(mobileMarkup, /role="dialog" aria-modal="true"/);
assert.match(mobileMarkup, /class="cs-mobile-drawer__scroll" data-mobile-menu-scroll/, 'scrollable content must be isolated below the fixed drawer header');
for (const route of ['/login', '/favorite', '/cos', '/urmarire-comanda', '/contact', '/#newsletter-title']) {
  assert.ok(mobileMarkup.includes(`href="${route}"`), `mobile menu preserves ${route}`);
}
const desktopMarkup = header.slice(0, header.indexOf('<div class="cs-mobile-drawer"'));
assert.doesNotMatch(desktopMarkup, /data-mobile-category-image|cs-mobile-category-image/);

const classes = new Set();
const bodyClasses = new Set();
const attributes = new Map([['aria-expanded', 'false']]);
const background = { inert: false };
const events = {};
const timers = new Map();
let nextTimer = 0;
let restoredFocus = false;
let closeFocused = false;
let imageRemoved = false;
const closeButton = { addEventListener(type, callback) { this.click = callback; }, focus() { closeFocused = true; }, closest: () => null, getClientRects: () => [{}] };
const image = { complete: false, naturalWidth: 0, addEventListener(type, callback) { this.error = callback; }, closest: () => ({ remove() { imageRemoved = true; } }) };
const submenu = { hidden: true };
const categoryAttributes = new Map([['aria-expanded', 'false']]);
const categoryToggle = {
  getAttribute: name => categoryAttributes.get(name), setAttribute: (name, value) => categoryAttributes.set(name, value),
  closest: selector => selector === 'li' ? { querySelector: () => submenu } : { classList: { toggle() {} } },
  addEventListener(type, callback) { this.click = callback; },
};
const panel = {
  querySelector: () => closeButton,
  querySelectorAll: () => [closeButton],
  addEventListener(type, callback) { events.panelClick = callback; },
  contains: () => true,
};
const drawer = {
  hidden: true,
  classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
  querySelector: () => panel,
  querySelectorAll: selector => selector === '[data-mobile-menu-close]' ? [closeButton] : selector === '[data-mobile-category-toggle]' ? [categoryToggle] : [image],
};
const opener = {
  addEventListener(type, callback) { events.open = callback; },
  getAttribute: name => attributes.get(name), setAttribute: (name, value) => attributes.set(name, value),
  focus() { restoredFocus = true; },
};
context.document = {
  querySelector: selector => selector === '[data-mobile-drawer]' ? drawer : opener,
  querySelectorAll: () => [background], addEventListener(type, callback) { events.keydown = callback; },
  body: { classList: { add: name => bodyClasses.add(name), remove: name => bodyClasses.delete(name) } },
};
context.window = { matchMedia: () => ({ matches: false, addEventListener() {} }) };
context.location = { href: 'http://localhost/' };
context.requestAnimationFrame = callback => callback();
context.setTimeout = (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; };
context.clearTimeout = id => timers.delete(id);
vm.runInContext(core.slice(core.indexOf('function bindMobileDrawer'), core.indexOf('function bindShellInteractions')), context);
vm.runInContext('bindMobileDrawer()', context);
events.open();
assert.equal(drawer.hidden, false);
assert.equal(background.inert, true);
assert.ok(closeFocused && classes.has('is-open'));
categoryToggle.click();
assert.equal(submenu.hidden, false);
assert.equal(categoryAttributes.get('aria-expanded'), 'true');
assert.ok(classes.has('is-open'), 'expanding subcategories must not close the drawer');
image.error();
assert.equal(imageRemoved, true, 'broken images leave no placeholder');
let prevented = false;
events.panelClick({ target: { closest: () => ({ href: 'http://localhost/magazin?category=auto' }) }, button: 0, preventDefault() { prevented = true; } });
assert.ok(prevented && !classes.has('is-open'));
assert.equal(drawer.hidden, false, 'drawer remains rendered during the exit animation');
assert.equal(context.location.href, 'http://localhost/', 'navigation waits for the animation');
assert.equal(background.inert, false);
assert.equal([...timers.values()][0].delay, 250);
[...timers.values()][0].callback();
assert.equal(drawer.hidden, true);
assert.equal(context.location.href, 'http://localhost/magazin?category=auto');
events.open();
events.keydown({ key: 'Escape', preventDefault() {} });
assert.ok(restoredFocus && !classes.has('is-open'));
assert.equal(background.inert, false);
console.log('cubis-mobile-menu: OK · API thumbnails only, nested category filters, safe images, animated navigation, Escape/focus restoration');
