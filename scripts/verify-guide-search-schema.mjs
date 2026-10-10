#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEBSITE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'website');
const MANIFEST_PATH = path.join(WEBSITE_ROOT, 'search', 'data', '.generated-diagnostic-pages.json');
const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
const slugs = Array.isArray(manifest.slugs) ? manifest.slugs : [];
if (!slugs.length) throw new Error('Nu există un manifest generat din API-ul Cubis Shop.');

let articles = 0;
for (const slug of slugs) {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) throw new Error(`Slug invalid în manifest: ${slug}`);
  const html = await readFile(path.join(WEBSITE_ROOT, `${slug}.html`), 'utf8');
  const matches = [...html.matchAll(/<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  let found = false;
  for (const match of matches) {
    const schema = JSON.parse(match[1]);
    if (schema?.['@type'] === 'Article') found = true;
    if (JSON.stringify(schema).includes('"@type":"Product"')) {
      throw new Error(`Schema Product invalidă într-un ghid diagnostic: ${slug}`);
    }
  }
  if (!found) throw new Error(`Schema Article lipsește din ${slug}`);
  articles += 1;
}

process.stdout.write(`${JSON.stringify({ ok: true, source: 'local-cubis-manifest', guides: slugs.length, articles })}\n`);
