#!/usr/bin/env node

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEBSITE_ROOT = path.join(PROJECT_ROOT, 'website');
const MANIFEST_PATH = path.join(WEBSITE_ROOT, 'search', 'data', '.generated-diagnostic-pages.json');
const BASE_URL = (process.env.CUBIS_WEBSITE_URL || 'https://cubisshop.ro').replace(/\/$/, '');
const SOURCE_URL = String(process.env.CUBIS_DIAGNOSTIC_API_URL || '').trim();
const ALLOWED_HOSTS = new Set(['cubisshop.ro', 'www.cubisshop.ro', 'localhost', '127.0.0.1', '[::1]']);

function safeSlug(value) {
  const slug = String(value || '').trim();
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug) || slug.includes('..')) {
    throw new Error(`Slug diagnostic invalid: ${slug || '(gol)'}`);
  }
  return slug;
}

function assertCubisUrl(raw, label) {
  if (!raw) throw new Error(`${label} este obligatoriu; generatorul refuză datele locale copiate sau sursele implicite.`);
  const url = new URL(raw);
  if (!ALLOWED_HOSTS.has(url.hostname)) throw new Error(`${label} trebuie să folosească exclusiv Cubis Shop sau localhost.`);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.protocol !== 'https:') {
    throw new Error(`${label} trebuie să folosească HTTPS.`);
  }
  return url;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[character]);
}

function cleanList(value) {
  return Array.isArray(value) ? value.map(item => String(item || '').trim()).filter(Boolean) : [];
}

function normalizeDocument(raw) {
  const document = raw && typeof raw === 'object' ? raw : {};
  const normalized = {
    slug: safeSlug(document.slug),
    title: String(document.title || '').trim(),
    quick_answer: String(document.quick_answer || '').trim(),
    likely_causes: cleanList(document.likely_causes),
    safe_checks: cleanList(document.safe_checks),
    possible_repairs: cleanList(document.possible_repairs),
    clarifying_questions: cleanList(document.clarifying_questions),
    risk_level: String(document.risk_level || '').trim(),
    brand: String(document.brand || '').trim(),
    model: String(document.model || '').trim(),
  };
  if (!normalized.title || !normalized.quick_answer) {
    throw new Error(`Document diagnostic incomplet: ${normalized.slug}`);
  }
  return normalized;
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

async function atomicWrite(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.cubis-${process.pid}.tmp`;
  await writeFile(temporary, content, 'utf8');
  try {
    await rename(temporary, filePath);
  } catch (error) {
    if (!['EEXIST', 'EPERM', 'UNKNOWN'].includes(error?.code)) throw error;
    await rm(filePath, { force: true });
    await rename(temporary, filePath);
  }
}

function renderDocument(document) {
  const url = `${BASE_URL}/${document.slug}`;
  const description = document.quick_answer.slice(0, 158).replace(/\s+\S*$/, '') || document.quick_answer;
  const list = values => values.map(value => `<li>${escapeHtml(value)}</li>`).join('');
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: document.title,
    description: document.quick_answer,
    mainEntityOfPage: url,
    author: { '@type': 'Organization', name: 'Cubis Shop' },
    publisher: { '@type': 'Organization', name: 'Cubis Shop' },
    inLanguage: 'ro-RO',
    about: [document.brand, document.model].filter(Boolean).map(name => ({ '@type': 'Thing', name })),
  };
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(document.title)} | Cubis Shop</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="index, follow"><link rel="canonical" href="${url}">
<meta property="og:type" content="article"><meta property="og:locale" content="ro_RO"><meta property="og:title" content="${escapeHtml(document.title)} | Cubis Shop"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${url}"><link rel="icon" href="/assets/favicon.png"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/seo-pages.css"><script type="application/ld+json">${safeJson(schema)}</script></head>
<body><main class="seo-page"><article><nav aria-label="Breadcrumb"><a href="/">Acasă</a> / <a href="/ghiduri">Ghiduri</a></nav><p class="eyebrow">GHID DE DIAGNOSTIC</p><h1>${escapeHtml(document.title)}</h1><section class="quick-answer"><h2>Răspuns rapid</h2><p>${escapeHtml(document.quick_answer)}</p></section><section><h2>Cauze posibile</h2><ul>${list(document.likely_causes)}</ul></section><section><h2>Verificări sigure</h2><ul>${list(document.safe_checks)}</ul></section><section><h2>Reparații posibile după diagnostic</h2><ul>${list(document.possible_repairs)}</ul></section><section><h2>Întrebări utile pentru diagnostic</h2><ul>${list(document.clarifying_questions)}</ul></section>${document.risk_level ? `<p><strong>Nivel orientativ de risc:</strong> ${escapeHtml(document.risk_level)}</p>` : ''}<p><a href="/contact">Contactează Cubis Shop pentru diagnosticare</a></p></article></main><script src="/legal-footer.js" defer></script></body></html>\n`;
}

async function previousSlugs() {
  try {
    const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
    return Array.isArray(manifest.slugs) ? manifest.slugs.map(safeSlug) : [];
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function main() {
  assertCubisUrl(BASE_URL, 'CUBIS_WEBSITE_URL');
  const source = assertCubisUrl(SOURCE_URL, 'CUBIS_DIAGNOSTIC_API_URL');
  const response = await fetch(source, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`API-ul Cubis a răspuns cu HTTP ${response.status}.`);
  const payload = await response.json();
  const input = Array.isArray(payload) ? payload : payload?.documents;
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('API-ul Cubis nu a returnat documente; nu s-a șters și nu s-a generat nimic.');
  }
  const documents = input.map(normalizeDocument);
  const slugs = documents.map(document => document.slug);
  if (new Set(slugs).size !== slugs.length) throw new Error('API-ul Cubis a returnat sluguri duplicate.');

  for (const document of documents) {
    await atomicWrite(path.join(WEBSITE_ROOT, `${document.slug}.html`), renderDocument(document));
  }
  const keep = new Set(slugs);
  let removed = 0;
  for (const slug of await previousSlugs()) {
    if (keep.has(slug)) continue;
    await rm(path.join(WEBSITE_ROOT, `${slug}.html`), { force: true });
    removed += 1;
  }
  await atomicWrite(MANIFEST_PATH, `${JSON.stringify({ version: 1, source: source.href, generated_at: new Date().toISOString(), slugs }, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ success: true, generated: documents.length, removed })}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
});
