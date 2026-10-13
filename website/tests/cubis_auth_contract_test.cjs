const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const website = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(website, file), "utf8");
const login = read("login.html");
const register = read("cont-nou.html");
const script = read("cubis-auth.mjs");
const css = read("cubis-auth.css");

for (const [name, source] of [["login", login], ["register", register]]) {
  assert.match(source, /data-site-header/, `${name} must use the shared header`);
  assert.match(source, /data-site-footer/, `${name} must use the shared footer`);
  assert.match(source, /data-google-auth aria-busy="true"/, `${name} must render the Google surface immediately`);
  assert.doesNotMatch(source, /accounts\.google\.com/, `${name} must not contact Google before the Cubis client id is available`);
  assert.doesNotMatch(source, /G-Trots|GTrots|g-trots/i, `${name} must not expose legacy identity`);
  assert.match(source, /autocomplete=/, `${name} fields must expose browser autofill semantics`);
}

assert.match(login, /data-forgot-password/, "login must expose password recovery");
assert.match(register, /name="password_confirm"/, "register must confirm the password");
assert.match(register, /name="account_consent"/, "register must require explicit account data consent");
assert.match(register, /data-password-strength/, "register must expose password strength feedback");

for (const method of ["authConfig", "login", "register", "forgotPassword", "googleLogin"]) {
  assert.match(script, new RegExp(`customerApi\\.${method}`), `auth UI must call customerApi.${method}`);
}
assert.match(script, /STORAGE_KEYS\.customerToken/, "successful auth must save the customer token");
assert.match(script, /STORAGE_KEYS\.customerProfile/, "successful auth must save the customer profile");
assert.match(script, /requested\.startsWith\("\/"\)/, "post-auth redirects must be restricted to local paths");
assert.match(script, /Autentificarea Google este dezactivată până la configurarea contului Cubis Shop\./, "disabled Google state must be explained honestly");
assert.ok(script.indexOf("await customerApi.authConfig()") < script.indexOf("await ensureGoogleScript()"), "Google script must load only after Cubis auth config");
assert.match(script, /location\.hostname === "127\.0\.0\.1"/, "numeric loopback previews must be detected before Google authentication");
assert.match(script, /canonicalLocalUrl\.hostname = "localhost"/, "numeric loopback previews must use the registered localhost OAuth origin");
assert.match(script, /location\.replace\(canonicalLocalUrl\.href\)/, "local OAuth origin normalization must preserve the current route through a replace navigation");

assert.match(css, /grid-template-columns: minmax\(420px, \.92fr\) minmax\(520px, 1\.08fr\)/, "desktop auth must use the requested split layout");
assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.cs-auth-story \{ display: none;/, "mobile auth must focus on the form");
assert.match(css, /@media \(max-width: 620px\)/, "auth must have a phone breakpoint");
assert.match(css, /\.cs-auth-submit \{[^}]*min-height: 64px/, "primary auth actions must be touch friendly");

console.log("cubis-auth: OK · login, registration, recovery, safe Google bootstrap and responsive Cubis layout");
