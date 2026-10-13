const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const website = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(website, 'solicita-retur.html'), 'utf8');
const script = fs.readFileSync(path.join(website, 'cubis-return.mjs'), 'utf8');
const css = fs.readFileSync(path.join(website, 'cubis-return.css'), 'utf8');

assert.match(html, /Retrageți-vă din/);
assert.match(html, /name="order_number"/);
assert.match(html, /name="email"/);
assert.match(html, /name="bank_account_holder"/);
assert.match(html, /name="bank_iban"/);
assert.match(html, /name="refund_consent"/);
assert.match(html, /data-return-progress="verify"/);
assert.match(html, /data-return-progress="configure"/);
assert.match(html, /data-return-progress="success"/);
assert.match(html, /cubis-return\.css/);

assert.match(script, /orderApi\.validateReturn\(access\)/);
assert.match(script, /orderApi\.requestReturn/);
assert.match(script, /withdrawal_statement/);
assert.match(script, /localPreview[\s\S]*localhost[\s\S]*127\.0\.0\.1/);
assert.match(script, /data-return-selected-count/);
assert.match(script, /validIban/);

assert.match(css, /@media \(max-width: 720px\)/);
assert.match(css, /\.cs-return-actions \{ position: sticky/);
assert.match(css, /\.cs-return-product \{ position: relative; grid-template-columns: 40px 58px/);
assert.doesNotMatch(css, /grid-template-columns:\s*1px/);
assert.match(css, /min-height: 58px/);
assert.doesNotMatch(`${html}\n${script}\n${css}`, /G-Trots|GTrots|g-trots/i);

console.log('Cubis return page contract: PASS');
