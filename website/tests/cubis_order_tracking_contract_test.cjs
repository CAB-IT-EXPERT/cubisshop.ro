const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "urmarire-comanda.html"), "utf8");
const script = fs.readFileSync(path.join(root, "cubis-order-tracking.mjs"), "utf8");
const styles = fs.readFileSync(path.join(root, "cubis-order-tracking.css"), "utf8");

assert.match(html, /data-site-header/);
assert.match(html, /data-site-footer/);
assert.match(html, /name="robots" content="noindex, nofollow"/);
assert.match(html, /data-track-form/);
assert.match(html, /data-cancel-modal/);
assert.match(html, /data-return-modal/);

assert.match(script, /orderApi\.track/);
assert.match(script, /orderApi\.cancel/);
assert.match(script, /orderApi\.requestReturn/);
assert.match(script, /order\.can_cancel/);
assert.match(script, /order\.can_request_return/);
assert.match(script, /return_eligibility/);
assert.match(script, /initial_shipping_refundable/);
assert.match(script, /validIban/);
assert.match(script, /status_history/);
assert.match(script, /localPreview/);

assert.match(styles, /@media \(max-width: 760px\)/);
assert.match(styles, /prefers-reduced-motion/);
assert.match(styles, /\.cs-track-progress-card/);
assert.match(styles, /\.cs-track-modal__backdrop/);

assert.doesNotMatch(`${html}\n${script}\n${styles}`, /G-Trots|GTrots/);
console.log("Cubis order tracking contract: PASS");
