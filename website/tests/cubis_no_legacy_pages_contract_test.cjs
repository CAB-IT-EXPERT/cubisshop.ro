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
assert.deepEqual(htmlFiles, ["404.html", "index.html", "magazin.html", "produs.html"]);

const assetFiles = files
  .filter((file) => relative(file).startsWith("assets/"))
  .map(relative)
  .sort();
assert.deepEqual(assetFiles, [
  "assets/cubis-favicon.png",
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
