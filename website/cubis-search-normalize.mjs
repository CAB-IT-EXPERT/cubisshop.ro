const DIACRITICS = { ă: "a", â: "a", î: "i", ș: "s", ş: "s", ț: "t", ţ: "t" };

export function normalize(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[ăâîșşțţ]/g, character => DIACRITICS[character] || character)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(value = "") {
  return normalize(value).split(" ").filter(token => token.length > 1);
}

export function uniqueTokens(value = "") {
  return [...new Set(tokens(value))];
}

export function phrase(haystack, needle) {
  const normalizedHaystack = ` ${normalize(haystack)} `;
  const normalizedNeedle = ` ${normalize(needle)} `;
  return normalizedNeedle.trim().length > 1 && normalizedHaystack.includes(normalizedNeedle);
}

export function damerauLevenshtein(left = "", right = "", maximum = Infinity) {
  const a = normalize(left);
  const b = normalize(right);
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (Math.abs(a.length - b.length) > maximum) return maximum + 1;

  const previousPrevious = new Uint16Array(b.length + 1);
  const previous = new Uint16Array(b.length + 1);
  const current = new Uint16Array(b.length + 1);
  for (let index = 0; index <= b.length; index += 1) previous[index] = index;

  for (let row = 1; row <= a.length; row += 1) {
    current[0] = row;
    let rowMinimum = current[0];
    for (let column = 1; column <= b.length; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + cost,
      );
      if (row > 1 && column > 1 && a[row - 1] === b[column - 2] && a[row - 2] === b[column - 1]) {
        current[column] = Math.min(current[column], previousPrevious[column - 2] + 1);
      }
      rowMinimum = Math.min(rowMinimum, current[column]);
    }
    if (rowMinimum > maximum) return maximum + 1;
    previousPrevious.set(previous);
    previous.set(current);
  }
  return previous[b.length];
}

export function fuzzySimilarity(left, right) {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 0;
  return 1 - damerauLevenshtein(a, b) / Math.max(a.length, b.length);
}

export function trigrams(value = "") {
  const source = `  ${normalize(value)}  `;
  const result = new Set();
  for (let index = 0; index < source.length - 2; index += 1) {
    const trigram = source.slice(index, index + 3);
    if (trigram.trim()) result.add(trigram);
  }
  return [...result];
}

export function fnv1a(value = "") {
  let hash = 2166136261;
  const bytes = new TextEncoder().encode(String(value));
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}
