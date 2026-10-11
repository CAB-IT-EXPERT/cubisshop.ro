import { normalize, uniqueTokens, trigrams, damerauLevenshtein } from "./cubis-search-normalize.mjs";

let documents = [];
let documentFrequency = new Map();
let averageLength = 1;

function prepare(product) {
  const fields = {
    name: normalize(product.name),
    sku: normalize(product.sku),
    category: normalize(product.category),
    manufacturer: normalize(product.manufacturer),
    brands: normalize((product.brands || []).join(" ")),
    description: normalize(product.description),
  };
  const text = Object.values(fields).join(" ");
  const tokens = uniqueTokens(text);
  const frequencies = new Map();
  tokens.forEach(token => frequencies.set(token, (frequencies.get(token) || 0) + 1));
  return { ...product, fields, text, tokens, frequencies, grams: new Set(trigrams(text)) };
}

function initialize(products) {
  documents = (products || []).map(prepare);
  documentFrequency = new Map();
  let totalLength = 0;
  documents.forEach(document => {
    totalLength += document.tokens.length;
    new Set(document.tokens).forEach(token => documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1));
  });
  averageLength = Math.max(1, totalLength / Math.max(1, documents.length));
}

function fuzzyTerm(term, candidate) {
  if (term === candidate) return 1;
  if (candidate.startsWith(term) || term.startsWith(candidate)) return .82;
  if (Math.abs(term.length - candidate.length) > 2 || Math.min(term.length, candidate.length) < 4) return 0;
  const limit = Math.max(term.length, candidate.length) > 7 ? 2 : 1;
  const distance = damerauLevenshtein(term, candidate, limit);
  return distance <= limit ? 1 - distance / Math.max(term.length, candidate.length) : 0;
}

function search(rawQuery, limit = 8) {
  const query = normalize(rawQuery);
  const queryTokens = uniqueTokens(query);
  const queryGrams = new Set(trigrams(query));
  const count = Math.max(1, documents.length);
  const scores = documents.map(document => {
    let score = 0;
    if (document.fields.name === query) score += 900;
    else if (document.fields.name.startsWith(query)) score += 340;
    else if (document.fields.name.includes(query)) score += 220;
    if (document.fields.sku === query) score += 850;
    else if (document.fields.sku.includes(query)) score += 260;
    if (document.fields.category.includes(query)) score += 100;
    if (document.fields.brands.includes(query)) score += 130;
    if (document.fields.manufacturer.includes(query)) score += 120;

    queryTokens.forEach(term => {
      let bestToken = "";
      let similarity = 0;
      document.frequencies.forEach((_frequency, candidate) => {
        const current = fuzzyTerm(term, candidate);
        if (current > similarity) { similarity = current; bestToken = candidate; }
      });
      if (!bestToken || similarity < .62) return;
      const frequency = document.frequencies.get(bestToken) || 1;
      const df = documentFrequency.get(bestToken) || 1;
      const idf = Math.log(1 + (count - df + .5) / (df + .5));
      const k1 = 1.35;
      const b = .72;
      const length = document.tokens.length || averageLength;
      score += similarity * idf * (frequency * (k1 + 1)) / (frequency + k1 * (1 - b + b * length / averageLength)) * 55;
    });

    if (queryGrams.size) {
      let overlap = 0;
      queryGrams.forEach(gram => { if (document.grams.has(gram)) overlap += 1; });
      score += overlap / Math.sqrt(queryGrams.size * Math.max(1, document.grams.size)) * 100;
    }
    return { id: document.id, score };
  }).filter(row => row.score > 0);
  scores.sort((first, second) => second.score - first.score || first.id.localeCompare(second.id));
  return scores.slice(0, Math.max(1, limit)).map(row => row.id);
}

self.addEventListener("message", event => {
  const message = event.data || {};
  if (message.type === "INIT") {
    initialize(message.products);
    self.postMessage({ type: "READY", count: documents.length });
  }
  if (message.type === "SEARCH") {
    self.postMessage({ type: "RESULT", requestId: message.requestId, ids: search(message.query, message.limit) });
  }
});
