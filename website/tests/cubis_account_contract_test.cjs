const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const website = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(website, file), "utf8");
const html = read("cont.html");
const script = read("cubis-account.mjs");
const css = read("cubis-account.css");

assert.match(html, /data-site-header/, "account must use the common header");
assert.match(html, /data-site-footer/, "account must use the common footer");
for (const marker of ["overview", "profile", "orders", "addresses", "coupons"]) {
  assert.ok(html.includes(`data-account-panel="${marker}"`), `account is missing the ${marker} panel`);
}
for (const method of ["me", "orders", "addresses", "coupons", "createAddress", "updateProfile", "logout"]) {
  assert.match(script, new RegExp(`customerApi\\.${method}`), `account must call customerApi.${method}`);
}
assert.match(script, /redirectToLogin/, "unauthenticated customers must be redirected to login");
assert.match(script, /STORAGE_KEYS\.customerProfile/, "account profile changes must update shared session state");
assert.doesNotMatch(`${html}\n${script}\n${css}`, /G-Trots|GTrots|g-trots/i, "account must not expose legacy identity");
assert.match(css, /@media \(max-width: 620px\)/, "account must have a phone layout");
assert.match(css, /min-height: 54px/, "account primary interactions must remain touch friendly");

console.log("cubis-account: OK · protected dashboard, live customer API and responsive account sections");
