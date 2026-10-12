const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const website = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(website, "cos.html"), "utf8");
const css = fs.readFileSync(path.join(website, "cubis-cart.css"), "utf8");
const script = fs.readFileSync(path.join(website, "cubis-cart.mjs"), "utf8");

for (const marker of [
  "data-site-header", "data-site-footer", "data-cart-content", "data-cart-items",
  "data-cart-empty", "data-cart-subtotal", "data-cart-total", "data-cart-checkout",
]) assert.ok(html.includes(marker), `cart page is missing ${marker}`);

assert.match(script, /commerce\.cart\(\)/, "cart page must read the shared cart store");
assert.match(script, /commerce\.changeQuantity/, "cart quantities must be editable");
assert.match(script, /commerce\.remove/, "cart products must be removable");
assert.match(script, /commerce\.registerProducts\(products\)/, "cart must register current API products");
assert.match(script, /data\.catalog\(\)/, "cart must resolve products from the current catalog");
assert.match(script, /product\.apiId/, "saved carts using historical API ids must still resolve current products");
assert.match(script, /oldSubtotal - subtotal/, "cart must calculate promotional savings");
assert.doesNotMatch(script, /createPublicOrder|cancel|invoice|anaf|spv/i, "cart layout must not create or mutate orders");
assert.match(css, /\.cs-cart-layout \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(330px, 390px\)/, "desktop cart must separate products and summary");
assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.cs-cart-layout \{ grid-template-columns: 1fr;/, "mobile and tablet cart must stack sections");
assert.match(css, /@media \(max-width: 650px\)[\s\S]*\.cs-cart-item \{[^}]*grid-template-columns: 112px minmax\(0, 1fr\) 38px;/, "mobile cart items must use compact touch-friendly rows");
assert.match(css, /\.cs-cart-checkout \{[^}]*min-height: 62px/, "checkout CTA must be touch friendly");

console.log("cubis-cart: OK · shared cart state, responsive layout, quantities, removal and totals");
