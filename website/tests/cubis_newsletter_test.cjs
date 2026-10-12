const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const website = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(website, 'cubis-newsletter.mjs'), 'utf8')
  .replace(/^import .*;\r?\n/m, '').replace(/export /g, '');
const css = fs.readFileSync(path.join(website, 'cubis-storefront.css'), 'utf8');
const storefront = fs.readFileSync(path.join(website, 'cubis-storefront.mjs'), 'utf8');
const context = vm.createContext({ commerceApiRequest() { throw new Error('Tests must inject a request'); } });
vm.runInContext(source, context);

function fixture(request, previewDemo = false) {
  const label = { textContent: 'Mă abonez' };
  const button = { disabled: false, querySelector: () => label };
  const email = { value: ' USER@Example.com ', readOnly: false };
  const trap = { value: '' };
  const message = { hidden: true, dataset: {}, textContent: '' };
  const form = {
    dataset: {}, attributes: {}, valid: true, resets: 0,
    querySelector(selector) { return ({ '[name="email"]': email, '[type="submit"]': button, '[name="website"]': trap })[selector]; },
    closest() { return { querySelector: () => message }; },
    addEventListener(event, handler) { this.handler = handler; this.binds = (this.binds || 0) + 1; },
    reportValidity() { return this.valid; },
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
    reset() { this.resets++; email.value = ''; },
  };
  const root = { querySelectorAll: () => [form] };
  context.bindNewsletter({ root, request, previewDemo });
  const submit = () => form.handler({ preventDefault() {} });
  return { root, form, email, message, button, label, trap, submit };
}

(async () => {
  let calls = 0, resolveRequest, payload;
  const request = (action, options) => {
    calls++; payload = options;
    assert.equal(action, 'subscribePublicNewsletter');
    return new Promise(resolve => { resolveRequest = resolve; });
  };
  const success = fixture(request);
  context.bindNewsletter({ root: success.root, request });
  assert.equal(success.form.binds, 1, 'Idempotent binding');
  const pending = success.submit();
  assert.equal(success.button.disabled, true);
  assert.equal(success.email.readOnly, true);
  assert.equal(success.form.attributes['aria-busy'], 'true');
  assert.equal(success.message.dataset.state, 'pending');
  assert.equal(success.label.textContent, 'Se trimite…');
  await success.submit();
  assert.equal(calls, 1, 'Prevent duplicate submissions');
  assert.equal(payload.method, 'POST');
  assert.equal(payload.auth, false, 'No admin/customer auth needed');
  assert.equal(payload.body.email, 'USER@Example.com');
  assert.equal(payload.body.consent, true);
  assert.equal(payload.body.consent_version, '2026-10-12');
  assert.equal(payload.body.website, '');
  resolveRequest({ success: true });
  await pending;
  assert.equal(success.message.dataset.state, 'success');
  assert.equal(success.email.value, '');
  assert.equal(success.form.resets, 1);
  assert.equal(success.button.disabled, false);
  assert.equal(success.email.readOnly, false);
  assert.equal(success.form.attributes['aria-busy'], undefined);
  assert.equal(success.label.textContent, 'Mă abonez');

  for (const response of [null, {}, { success: false }, { success: 'true' }]) {
    const unconfirmed = fixture(async () => response);
    await unconfirmed.submit();
    assert.equal(unconfirmed.message.dataset.state, 'error', 'Never fake success');
    assert.equal(unconfirmed.email.value, 'USER@Example.com', 'Preserve input for retry');
    assert.equal(unconfirmed.form.resets, 0);
  }
  for (const text of ['Conexiunea a durat prea mult.', 'Prea multe încercări.', 'Autentificare necesară.']) {
    const failure = fixture(async () => { throw new Error(text); });
    await failure.submit();
    assert.equal(failure.message.dataset.state, 'error');
    assert.equal(failure.button.disabled, false);
    assert.ok(failure.message.textContent.length);
    if (text.startsWith('Autentificare')) assert.match(failure.message.textContent, /nu a fost salvată/);
  }
  let blockedCalls = 0;
  const demo = fixture(async () => { blockedCalls++; }, true);
  await demo.submit();
  assert.equal(blockedCalls, 0, 'DEMO never writes subscriptions');
  assert.match(demo.message.textContent, /DEMO/);
  const invalid = fixture(async () => { blockedCalls++; });
  invalid.form.valid = false;
  await invalid.submit();
  assert.equal(blockedCalls, 0, 'Invalid form never sends');
  const bot = fixture(async (action, options) => { assert.equal(options.body.website, 'bot'); return { success: false }; });
  bot.trap.value = 'bot';
  await bot.submit();
  assert.equal(bot.message.dataset.state, 'error');

  for (const page of ['index.html', 'produs.html']) {
    const html = fs.readFileSync(path.join(website, page), 'utf8');
    assert.match(html, /name="email" type="email" autocomplete="email" maxlength="180"/);
    assert.match(html, /data-newsletter-label/);
    assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
    assert.match(html, /Prin apăsarea „Mă abonez”/);
    assert.match(html, /name="website" type="text" tabindex="-1" autocomplete="off"/);
  }
  for (const page of ['cubis-home.mjs', 'cubis-product.mjs']) {
    assert.match(fs.readFileSync(path.join(website, page), 'utf8'), /bindNewsletter\(\{ previewDemo: PREVIEW_DEMO \}\)/);
  }
  assert.match(storefront, /bindNewsletter\(\{ previewDemo: PREVIEW_DEMO \}\)/, 'Shared shell binds any newsletter form on every storefront page');
  assert.match(source, /showNewsletterSuccess\(\{ root \}\)/, 'Confirmed API success opens the shared modal');
  assert.match(source, /Te-ai abonat cu succes!/);
  assert.match(source, /oferte speciale și noutăți despre produsele noi adăugate/);
  assert.match(source, /event\.preventDefault\(\); closeAnimated\(\)/, 'Escape closes with the animated path');
  assert.match(css, /\.cs-newsletter-success-modal\.is-visible/);
  assert.match(css, /@keyframes cs-newsletter-success-check/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*?\.cs-newsletter-success-modal/);
  assert.doesNotMatch(source, /localStorage|innerHTML|newsletter_opt_in/);
  console.log('cubis-newsletter: OK · pending/success/error, shared animated confirmation modal, retries, duplicate guard, honest confirmations, DEMO isolation, consent/accessibility (no real subscriptions).');
})().catch(error => { console.error(error); process.exitCode = 1; });
