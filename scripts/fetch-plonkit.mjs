// Fetches Plonk It guide pages and extracts the items of each quiz category.
//
// Usage: node scripts/fetch-plonkit.mjs [--refresh]
//   --refresh  ignore the page cache and download every page again
//
// Output: data/raw/<category>.json for every category in categories.mjs
// Pages are cached in .cache/pages so re-runs don't hit the site again.
// Requests are throttled; if Cloudflare starts answering with a challenge page
// the script waits and retries.
import fs from 'node:fs';
import path from 'node:path';
import { CATEGORIES } from './categories.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE = path.join(ROOT, '.cache', 'pages');
const OUT_DIR = path.join(ROOT, 'data', 'raw');
const BASE = 'https://www.plonkit.net';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const DELAY_MS = 4000;
const NON_COUNTRY = new Set(['spillover-countries', 'maps', 'beginners-guide', 'middle-earth']);

const refresh = process.argv.includes('--refresh');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parsePreloaded(html) {
  const m = html.match(/__PRELOADED_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  return m ? JSON.parse(m[1]) : null;
}

async function getPage(slug) {
  const file = path.join(CACHE, `${slug}.html`);
  if (!refresh && fs.existsSync(file)) return parsePreloaded(fs.readFileSync(file, 'utf8'));
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(`${BASE}/${slug}`, { headers: { 'User-Agent': UA } });
    const html = await res.text();
    await sleep(DELAY_MS);
    const data = parsePreloaded(html);
    if (data) {
      fs.writeFileSync(file, html);
      return data;
    }
    console.warn(`  blocked on ${slug} (HTTP ${res.status}), waiting before retry ${attempt}/5`);
    await sleep(60_000 * attempt);
  }
  throw new Error(`could not fetch ${slug}`);
}

fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const guide = await getPage('guide');
const countries = guide.data.filter((c) => !NON_COUNTRY.has(c.slug));
console.log(`${countries.length} country pages`);

const items = Object.fromEntries(Object.keys(CATEGORIES).map((k) => [k, []]));
for (const c of countries) {
  const page = (await getPage(c.slug)).data.public;
  page.steps.forEach((step, stepIndex) => {
    for (const it of step.items ?? []) {
      const item = {
        id: `${c.slug}/${it.id}`,
        country: c.slug,
        code: c.code,
        title: c.title,
        continent: c.cat?.[0] ?? '',
        stepIndex,
        stepTitle: step.title,
        tags: it.tags ?? [],
        imageUrl: it.data?.image?.imageUrl ?? it.imageUrl ?? null,
        text: it.data?.text ?? [],
      };
      if (!item.imageUrl) continue;
      for (const [key, cat] of Object.entries(CATEGORIES)) {
        if (cat.match(item)) items[key].push(item);
      }
    }
  });
}

const countryList = countries.map((c) => ({ slug: c.slug, code: c.code, title: c.title, continent: c.cat?.[0] ?? '' }));
const fetchedAt = new Date().toISOString();
for (const [key, list] of Object.entries(items)) {
  const out = path.join(OUT_DIR, `${key}.json`);
  fs.writeFileSync(out, JSON.stringify({ fetchedAt, countries: countryList, items: list }, null, 2));
  console.log(`${key}: ${list.length} items from ${new Set(list.map((i) => i.country)).size} countries -> ${path.relative(ROOT, out)}`);
}
