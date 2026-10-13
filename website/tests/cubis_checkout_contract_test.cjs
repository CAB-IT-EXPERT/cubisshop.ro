const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const checkout = read("checkout.html");
const script = read("cubis-checkout.mjs");
const payment = read("cubis-payment-result.mjs");
const stripe = fs.readFileSync(path.resolve(root, "..", "shop-api", "stripe.php"), "utf8");

assert.match(checkout, /data-checkout-form/);
assert.match(checkout, /name="customer_type"/);
assert.match(checkout, /data-shipping-methods/);
assert.match(checkout, /data-payment-methods/);
assert.match(checkout, /name="accept_terms"/);
assert.match(checkout, /data-checkout-summary-title|checkout-summary-title/);
assert.doesNotMatch(checkout, /G-Trots|GTrots|g-trots/i);

assert.match(script, /checkoutApi\.products/);
assert.match(script, /checkoutApi\.promotionQuote/);
assert.match(script, /checkoutApi\.createOrder/);
assert.match(script, /name="shipping_method_id"/);
assert.match(script, /name="payment_method"/);
assert.match(script, /return_base_url:\s*location\.origin/);
assert.match(script, /stripe_checkout_url/);
assert.match(script, /commerce\.clearCart\(\)/);

assert.match(stripe, /\/plata-finalizata\?session_id=\{CHECKOUT_SESSION_ID\}/);
assert.match(stripe, /\/plata-esuata\?comanda=/);
assert.match(payment, /checkoutApi\.stripeStatus/);
assert.match(payment, /checkoutApi\.cancelStripe/);
assert.match(payment, /commerce\.clearCart\(\)/);

for (const page of ["plata-finalizata.html", "plata-esuata.html"]) {
  const source = read(page);
  assert.match(source, /data-payment-result=/);
  assert.match(source, /cubis-payment-result\.mjs/);
  assert.doesNotMatch(source, /G-Trots|GTrots|g-trots/i);
}

console.log("Cubis checkout + Stripe return contract OK");
