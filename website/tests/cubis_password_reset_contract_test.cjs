const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const website = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(website, file), "utf8");
const html = read("resetare-parola.html");
const script = read("cubis-reset-password.mjs");
const api = read("cubis-commerce-api.mjs");
const css = read("cubis-auth.css");

assert.match(html, /data-site-header/);
assert.match(html, /data-site-footer/);
assert.match(html, /autocomplete="new-password"/);
assert.match(html, /data-reset-state="loading"/);
assert.match(html, /data-reset-state="form"/);
assert.match(html, /data-reset-state="success"/);
assert.match(html, /data-reset-state="invalid"/);
assert.doesNotMatch(`${html}\n${script}`, /G-Trots|GTrots|g-trots/i);

assert.match(api, /validateResetLink: body => commerceApiRequest\("customerValidateResetLink"/);
assert.match(script, /customerApi\.validateResetLink/);
assert.match(script, /customerApi\.resetPassword/);
assert.match(script, /\^\[a-f0-9\]\{64\}\$/);
assert.match(script, /password_confirm/);
assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.cs-reset-panel/);

console.log("cubis-password-reset: OK · validation, reset, responsive states and shared shell");
