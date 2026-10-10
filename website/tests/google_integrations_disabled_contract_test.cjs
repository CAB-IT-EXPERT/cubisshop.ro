const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'google-integrations.js'), 'utf8');
const htmlFiles = fs.readdirSync(root).filter(name => name.endsWith('.html'));

assert.match(source, /consentGranted !== true/);
assert.match(source, /measurementPattern/);
assert.match(source, /merchantPattern/);
assert.doesNotMatch(source, /G-[A-Z0-9]{6,}/);
assert.doesNotMatch(source, /merchant_id:\s*\d{4,}/);

for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  assert.equal(html.includes('google-integrations.js'), false, `${file} activează integrarea Google`);
}

process.stdout.write('Google integrations are reusable but disabled without Cubis IDs.\n');
