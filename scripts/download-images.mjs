// Downloads the original images of the quiz items into .cache/images.
//
// Usage: node scripts/download-images.mjs [category ...]
// Without arguments every category is downloaded. Run after fetch-plonkit.mjs.
// Already downloaded images, and items excluded in data/curation/<category>.json,
// are skipped.
//
// The image URLs answer a Cloudflare page challenge when requested like a page,
// but serve normally for image requests, so we send the headers an <img> tag would.
import fs from 'node:fs';
import path from 'node:path';
import { CATEGORIES } from './categories.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.cache', 'images');
const BASE = 'https://www.plonkit.net';
const DELAY_MS = 5000;
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
  Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
  'Sec-Fetch-Dest': 'image',
};

const categories = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CATEGORIES);

// Downloads are slow (the server allows a few dozen images per hour), so the
// order matters: take one image per country and category in turn, so that
// every country gets some questions early instead of finishing one country
// after another.
const queues = []; // one queue of image URLs per category + country
for (const cat of categories) {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'raw', `${cat}.json`), 'utf8'));
  const curationFile = path.join(ROOT, 'data', 'curation', `${cat}.json`);
  const curation = fs.existsSync(curationFile) ? JSON.parse(fs.readFileSync(curationFile, 'utf8')) : {};
  const byCountry = new Map();
  for (const item of raw.items) {
    if (curation[item.id]?.exclude) continue;
    if (!byCountry.has(item.country)) byCountry.set(item.country, []);
    byCountry.get(item.country).push(item.imageUrl);
  }
  queues.push(...byCountry.values());
}
const urls = [];
for (let round = 0; queues.some((q) => q.length > round); round++) {
  for (const q of queues) if (q[round] && !urls.includes(q[round])) urls.push(q[round]);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// On HTTP 429 the server wants us to slow down: wait (Retry-After, or an
// increasing pause) and try the same image again.
async function download(url) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch(BASE + encodeURI(url), { headers: { ...HEADERS, Referer: `${BASE}/${url.split('/')[2]}` } });
    const type = res.headers.get('content-type') ?? '';
    if (res.ok && type.startsWith('image/')) return Buffer.from(await res.arrayBuffer());
    if (res.status !== 429) throw new Error(`HTTP ${res.status} ${type}`);
    const wait = Number(res.headers.get('retry-after')) * 1000 || 60_000 * attempt;
    console.warn(`  rate limited on ${url}, waiting ${wait / 1000}s`);
    await sleep(wait);
  }
  throw new Error('still rate limited');
}

let saved = 0;
let failed = 0;
for (const url of urls) {
  const dest = path.join(OUT, url);
  if (fs.existsSync(dest)) continue;
  try {
    const buf = await download(url);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    saved++;
  } catch (e) {
    console.warn(`failed ${url}: ${e.message}`);
    failed++;
  }
  await sleep(DELAY_MS);
}
console.log(`saved ${saved}, failed ${failed}, total ${urls.length}`);
