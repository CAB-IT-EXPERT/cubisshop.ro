const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const roots = ['components', 'app'];

function relativeLuminance(color) {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return null;
  const channels = [0, 2, 4]
    .map((index) => parseInt(match[1].slice(index, index + 2), 16) / 255)
    .map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  if (foregroundLuminance === null || backgroundLuminance === null) return null;
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

const failures = [];
for (const root of roots) {
  for (const relativeFile of fs.readdirSync(root, { recursive: true })) {
    if (!/\.tsx?$/.test(relativeFile)) continue;
    const file = path.join(root, relativeFile);
    if (!fs.statSync(file).isFile()) continue;
    const source = fs.readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    function visit(node) {
      const isStyleSheetCreate = ts.isCallExpression(node)
        && ts.isPropertyAccessExpression(node.expression)
        && node.expression.name.text === 'create'
        && node.arguments[0]
        && ts.isObjectLiteralExpression(node.arguments[0]);
      if (isStyleSheetCreate) {
        for (const style of node.arguments[0].properties) {
          if (!ts.isPropertyAssignment(style) || !ts.isObjectLiteralExpression(style.initializer)) continue;
          let foreground;
          let background;
          for (const property of style.initializer.properties) {
            if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.initializer)) continue;
            const propertyName = property.name.getText(sourceFile).replace(/["']/g, '');
            if (propertyName === 'color') foreground = property.initializer.text;
            if (propertyName === 'backgroundColor') background = property.initializer.text;
          }
          const ratio = foreground && background ? contrastRatio(foreground, background) : null;
          if (ratio !== null && ratio < 4.5) {
            failures.push(`${file}:${style.name.getText(sourceFile)} ${foreground} pe ${background} (${ratio.toFixed(2)}:1)`);
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('OK: nu există perechi literale text/fundal sub pragul WCAG AA 4.5:1.');
}
