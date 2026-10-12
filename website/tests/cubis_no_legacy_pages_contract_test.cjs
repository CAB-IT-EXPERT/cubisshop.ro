const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const websiteRoot = path.resolve(__dirname, "..");

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

function relative(absolute) {
  return path.relative(websiteRoot, absolute).replaceAll(path.sep, "/");
}

const files = walk(websiteRoot);
const htmlFiles = files.filter((file) => path.extname(file) === ".html").map(relative).sort();
assert.deepEqual(htmlFiles, ["404.html", "cont-nou.html", "cont.html", "contact.html", "cos.html", "favorite.html", "index.html", "login.html", "magazin.html", "produs.html", "resetare-parola.html"]);

const assetFiles = files
  .filter((file) => relative(file).startsWith("assets/"))
  .map(relative)
  .sort();
assert.deepEqual(assetFiles, [
  "assets/anpc-sal.png",
  "assets/brands/anker.svg",
  "assets/brands/garmin.svg",
  "assets/brands/gopro.svg",
  "assets/brands/insta360.svg",
  "assets/brands/kugoo.svg",
  "assets/brands/kukirin.webp",
  "assets/brands/ninebot.png",
  "assets/brands/samsung.svg",
  "assets/brands/ugreen.png",
  "assets/brands/xiaomi.svg",
  "assets/cab-it-original.png",
  "assets/cubis-favicon.png",
  "assets/cubis-home-hero-background.png",
  "assets/cubis-home-hero-desktop.png",
  "assets/cubis-home-hero-mobile.png",
  "assets/cubis-popular-brands-strip.png",
  "assets/cubis-shop-icon.png",
  "assets/cubis-shop-logo.png",
]);

const visibleLegacyIdentity = /G-Trots|GTrots|g-trots|assets\/logo\.(?:png|svg)|theme\.(?:css|js)/i;
for (const htmlFile of htmlFiles) {
  const source = fs.readFileSync(path.join(websiteRoot, htmlFile), "utf8");
  assert.equal(visibleLegacyIdentity.test(source), false, `${htmlFile} conține o referință vizibilă legacy`);
}

const htaccess = fs.readFileSync(path.join(websiteRoot, ".htaccess"), "utf8");
assert.match(htaccess, /RewriteRule \^magazin\/produs\/\[\^\/\]\+\/\?\$ \/produs\.html \[END\]/);
assert.doesNotMatch(htaccess, /REQUEST_FILENAME}\/index\.html|legal-footer|GT_PRIVATE_PAGE/);

console.log(`Cubis legacy-removal contract OK (${htmlFiles.length} pagini HTML, ${assetFiles.length} asset-uri).`);
