const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function walk(directory, predicate, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath, predicate, output);
    else if (predicate(entry.name)) output.push(fullPath);
  }
  return output;
}

function luminance(hex) {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4]
    .map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}

const appConfig = JSON.parse(read('app.json'));
if (appConfig.expo?.userInterfaceStyle !== 'light') failures.push('app.json trebuie să forțeze userInterfaceStyle="light".');

const layout = read('app/_layout.tsx');
if (!/<StatusBar\s+style="dark"/.test(layout)) failures.push('StatusBar-ul Expo trebuie să folosească iconuri închise pe fundal deschis.');

const indexHtml = read('electron-app/renderer/index.html');
for (const stylesheet of ['theme/tokens.css', 'theme/shell.css', 'theme/commerce.css', 'theme/overlays.css']) {
  if (!indexHtml.includes(stylesheet)) failures.push(`Lipsește ${stylesheet} din index.html.`);
}
if (!indexHtml.includes('data-theme="cubis-light"')) failures.push('Tema Electron nu este fixată pe cubis-light.');

const themeFiles = ['shell.css', 'commerce.css', 'overlays.css'];
for (const name of themeFiles) {
  const source = read(`electron-app/renderer/theme/${name}`);
  if (source.includes('!important')) failures.push(`${name} nu trebuie să conțină !important.`);
  if (/#[0-9a-f]{3,8}\b/i.test(source)) failures.push(`${name} conține culori hex în afara tokens.css.`);
  if (/prefers-color-scheme\s*:\s*dark/i.test(source)) failures.push(`${name} reactivează tema întunecată.`);
}

const tokenSource = read('electron-app/renderer/theme/tokens.css');
const cssTokens = Object.fromEntries([...tokenSource.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-f]{6})\s*;/gi)].map((match) => [match[1], match[2]]));
const contrastPairs = [
  ['--color-text-primary', '--color-surface', 4.5],
  ['--color-text-secondary', '--color-surface', 4.5],
  ['--color-text-muted', '--color-surface', 4.5],
  ['--color-brand-text', '--color-surface', 4.5],
  ['--color-success', '--color-surface', 4.5],
  ['--color-warning', '--color-surface', 4.5],
  ['--color-error', '--color-surface', 4.5],
  ['--color-text-on-brand', '--color-brand-action', 4.5],
  ['--color-text-on-brand', '--color-brand-action-secondary', 4.5],
  ['--color-nav-text', '--color-brand-navy', 4.5],
];
for (const [foregroundName, backgroundName, threshold] of contrastPairs) {
  const foreground = cssTokens[foregroundName];
  const background = cssTokens[backgroundName];
  if (!foreground || !background) {
    failures.push(`Token lipsă pentru contrast: ${foregroundName}/${backgroundName}.`);
    continue;
  }
  const ratio = contrast(foreground, background);
  if (ratio < threshold) failures.push(`${foregroundName} pe ${backgroundName}: ${ratio.toFixed(2)}:1.`);
}

const nativeFiles = [
  ...walk(path.join(root, 'app'), (name) => /\.(ts|tsx)$/.test(name)),
  ...walk(path.join(root, 'components'), (name) => /\.(ts|tsx)$/.test(name)),
  ...walk(path.join(root, 'contexts'), (name) => /\.(ts|tsx)$/.test(name)),
  ...walk(path.join(root, 'hooks'), (name) => /\.(ts|tsx)$/.test(name)),
];
let literalStyleColors = 0;
for (const file of nativeFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const relative = path.relative(root, file);
  if (/\b(?:useColorScheme|Appearance\.(?:getColorScheme|addChangeListener))\b/.test(source)) {
    failures.push(`${relative} depinde de tema sistemului.`);
  }
  literalStyleColors += [...source.matchAll(/(?:backgroundColor|color|borderColor|shadowColor|tintColor|textDecorationColor)\s*:\s*['"]#[0-9a-f]{3,8}['"]/gi)].length;
  for (const match of source.matchAll(/backgroundColor\s*:\s*['"]#([0-9a-f]{6})([0-9a-f]{2})?['"]/gi)) {
    const alpha = match[2] ? parseInt(match[2], 16) / 255 : 1;
    const channels = [0, 2, 4].map((offset) => parseInt(match[1].slice(offset, offset + 2), 16));
    const isNearBlackSurface = Math.max(...channels) < 70;
    if (alpha >= 0.55 && isNearBlackSurface) {
      failures.push(`${relative} conține o suprafață întunecată hardcodată: #${match[1]}${match[2] || ''}.`);
    }
  }
}
if (literalStyleColors > 400) failures.push(`Prea multe culori native locale: ${literalStyleColors} (buget 400).`);

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`OK: temă light fixă, tokenuri Electron curate, contraste AA și ${literalStyleColors} culori native locale rămase doar pentru stări/date dinamice.`);
}
