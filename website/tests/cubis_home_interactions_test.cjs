const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const core = fs.readFileSync(path.join(__dirname, '../cubis-storefront.mjs'), 'utf8').replace(/\r\n/g, '\n');
const home = fs.readFileSync(path.join(__dirname, '../cubis-home.mjs'), 'utf8').replace(/\r\n/g, '\n');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../cubis-storefront.css'), 'utf8');
const storage = new Map();
const classes = new Set();
const cardClasses = new Set();
const attributes = new Map();
const label = { textContent: '' };
const iconHost = { dataset: { addIcon: 'cart' }, innerHTML: '' };
const card = { classList: { toggle: (name, value) => value ? cardClasses.add(name) : cardClasses.delete(name) } };
let blurCount = 0;
const button = {
  dataset: { productAdd: 'sample' }, disabled: false,
  classList: {
    contains: name => classes.has(name),
    add: name => classes.add(name), remove: name => classes.delete(name),
    toggle: (name, value) => value ? classes.add(name) : classes.delete(name),
  },
  closest: selector => selector === '[data-product-card]' ? card : null,
  setAttribute: (key, value) => attributes.set(key, value),
  querySelector: selector => selector === '[data-add-label]' ? label : selector === '[data-add-icon]' ? iconHost : null,
  matches: selector => selector === ':focus-visible' ? false : false,
  blur: () => { blurCount += 1; },
  offsetWidth: 200,
};
const listeners = [];
const context = vm.createContext({
  EventTarget, CustomEvent,
  STORAGE: { cart: 'cart', favorites: 'favorites' },
  readJson: (key, fallback) => storage.has(key) ? structuredClone(storage.get(key)) : fallback,
  writeJson: (key, value) => storage.set(key, structuredClone(value)),
  icon: name => `<svg>${name}</svg>`,
  document: {
    querySelectorAll: selector => selector === '[data-product-add]' ? [button] : [],
    querySelector: () => ({ value: 3 }), dispatchEvent() {},
    addEventListener: (event, callback) => listeners.push(callback),
  },
  CSS: { escape: value => value },
});
const storeSource = core.slice(core.indexOf('class CommerceStore'), core.indexOf('export const commerce'));
vm.runInContext(`${storeSource}\nconst commerce = new CommerceStore(); commerce.products.sample = { inStock: true };`, context);
const handlerStart = core.indexOf('document.addEventListener("click", event => {\n    const favorite');
const handlerEnd = core.indexOf('  addEventListener("storage"', handlerStart);
vm.runInContext(core.slice(handlerStart, handlerEnd), context);
const click = () => listeners[0]({ preventDefault() {}, target: { closest: selector => selector === '[data-product-add]' ? button : null } });

click();
assert.deepEqual(storage.get('cart'), [{ id: 'sample', quantity: 1 }]);
assert.equal(label.textContent, 'Adăugat în coș');
assert.equal(attributes.get('aria-pressed'), 'true');
assert.ok(classes.has('is-cart-changing'));
assert.ok(cardClasses.has('is-in-cart'));
assert.equal(iconHost.dataset.addIcon, 'check');
click();
assert.deepEqual(storage.get('cart'), [], 'clicking În coș must remove, not increment');
assert.equal(label.textContent, 'Adaugă în coș');
assert.equal(attributes.get('aria-pressed'), 'false');
assert.ok(!cardClasses.has('is-in-cart'));
assert.equal(iconHost.dataset.addIcon, 'cart');
assert.equal(blurCount, 1, 'mouse removal must release focus so the blue desktop button hides again');

storage.set('cart', [{ id: 'sample', quantity: 7 }]);
vm.runInContext('commerce.products.sample.inStock = false; commerce.sync();', context);
assert.equal(button.disabled, false, 'out-of-stock items already in cart remain removable');
click();
assert.deepEqual(storage.get('cart'), []);
assert.equal(button.disabled, true);

button.disabled = false;
button.closest = () => null;
click();
click();
assert.deepEqual(storage.get('cart'), [{ id: 'sample', quantity: 6 }], 'quantity-based add outside cards must remain additive');

const hosts = { '[data-home-featured]': {}, '[data-home-new]': {} };
const sortingContext = vm.createContext({
  document: { querySelector: selector => hosts[selector], querySelectorAll: () => [] },
  productCard: product => `${product.id}|`, icon: () => '', commerce: { sync() {} }, bindProductCarousel() {},
});
const renderSource = home.slice(home.indexOf('function renderProducts'), home.indexOf('function bindProductCarousel'));
vm.runInContext(renderSource, sortingContext);
sortingContext.rows = Array.from({ length: 25 }, (_, index) => ({
  id: `p${index}`, viewCount: index, createdAt: `2026-10-${String(index + 1).padStart(2, '0')} 12:00:00`,
}));
vm.runInContext('renderProducts(rows)', sortingContext);
const expected = Array.from({ length: 20 }, (_, index) => `p${24 - index}`).join('|') + '|';
assert.equal(hosts['[data-home-featured]'].innerHTML, expected);
assert.equal(hosts['[data-home-new]'].innerHTML, expected);
assert.doesNotMatch(html, /data-home-banners/);
assert.doesNotMatch(home, /cubis-popular-brands-strip/);
assert.match(home, /assets\/brands/);
assert.match(home, /const AUTO_SCROLL_DURATION = 900;/);
assert.match(home, /const MANUAL_SCROLL_DURATION = 450;/);
assert.match(home, /const CAROUSEL_STAGGER = 1000;/);
assert.match(home, /const AUTO_SCROLL_REST = 1100;/);
assert.match(home, /const eased = 1 - \(1 - elapsed\) \*\* 3;/);
assert.match(home, /clone\.classList\.add\("is-carousel-clone"\)/);
assert.match(home, /rail\.classList\.add\("is-carousel-animating"\)/);
assert.match(css, /\.cs-product-grid--carousel\.is-carousel-animating\s*\{\s*scroll-snap-type:\s*none;/);
assert.match(home, /scheduleAuto\(1000 \+ carouselIndex \* CAROUSEL_STAGGER\)/);
assert.doesNotMatch(home, /pointerenter|focusin/, 'hoverul și focusul nu trebuie să blocheze auto-derularea');
assert.match(home, /prefers-reduced-motion: reduce/);
assert.match(home, /touchstart/);
assert.ok(home.indexOf('  renderHero();') < home.indexOf('    const [, products] = await'), 'hero must not wait for API');
console.log('cubis-home: OK · cart toggle, animations, additive quantity flow, 20-item sorting, alternating smooth infinite carousels, static hero and brands');
