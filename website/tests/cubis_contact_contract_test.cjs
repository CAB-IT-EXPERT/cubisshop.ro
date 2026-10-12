const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const website = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(website, "contact.html"), "utf8");
const css = fs.readFileSync(path.join(website, "cubis-contact.css"), "utf8");
const moduleSource = fs.readFileSync(path.join(website, "cubis-contact.mjs"), "utf8");
const storefront = fs.readFileSync(path.join(website, "cubis-storefront.mjs"), "utf8");

for (const marker of ["data-site-header", "data-site-footer", "data-contact-form", "full_name", "email", "subject", "message"]) {
  assert.ok(html.includes(marker), `contact page is missing ${marker}`);
}
assert.match(html, /tel:\+40726285155/);
assert.match(html, /https:\/\/wa\.me\/40726285155/);
assert.match(html, /mailto:office@cubisshop\.ro/);
assert.equal((html.match(/\+40 726 285 155/g) || []).length, 2, "phone and WhatsApp must display the requested number");
assert.doesNotMatch(html, />\s*Adresă\s*</i, "the contact page must not render an address section");
assert.match(moduleSource, /WHATSAPP_NUMBER = "40726285155"/);
assert.match(moduleSource, /encodeURIComponent\(whatsappMessage/);
assert.match(moduleSource, /Nume:/);
assert.match(moduleSource, /Email:/);
assert.match(moduleSource, /Subiect:/);
assert.match(moduleSource, /Mesaj:/);
assert.match(moduleSource, /initShell\(\{ active: "contact" \}\)/);
assert.match(storefront, /whatsapp: '<path fill="currentColor" stroke="none"/, "contact actions must use the solid WhatsApp brand glyph");
assert.doesNotMatch(moduleSource, /fetch\(|commerce\.|createPublic/i, "contact form must only prepare the WhatsApp message");
for (const breakpoint of ["1180px", "900px", "680px", "390px"]) assert.ok(css.includes(breakpoint));
assert.match(css, /height: 56px/, "mobile form controls must be touch friendly");

console.log("cubis-contact: OK · shared shell, exact channels, WhatsApp prefill, responsive layout");
