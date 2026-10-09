// Builds the quiz data from the scraped items and the hand-written curation.
//
// Usage: node scripts/build-data.mjs [category ...]
// Without arguments every category is built.
//
// Inputs, per category:
//   data/raw/<category>.json        output of fetch-plonkit.mjs
//   data/curation/<category>.json   per item: crop, answer countries, Japanese explanation
//   .cache/images/...               output of download-images.mjs
// Outputs:
//   public/images/<category>/*.webp cropped images (Plonk It's region maps cut away)
//   public/data/<category>.json
//
// Curation entries, keyed by item id ("<country slug>/<item id>"):
//   { "exclude": "why" }                 not used as a question
//   { "crop": [x0, y0, x1, y1],          fractions of the original image
//     "checked": true,                   the image was reviewed and needs no crop
//                                        (an entry needs crop or checked to become a question)
//     "required": ["slug", ...],         countries that must all be selected, default [own country]
//     "optional": ["slug", ...],         countries that may be selected without penalty
//     "region": "...",                   where inside the country, for regional items
//     "kind": "...",                     sub-type, for categories that have kinds (signs)
//     "ja": "..." }                      Japanese explanation
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { CATEGORIES } from './categories.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const world = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'world.geojson'), 'utf8'));
const areaIds = new Set(world.features.map((f) => f.properties.id));
const MAX_WIDTH = 1200;

const categories = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CATEGORIES);
let failed = false;

for (const cat of categories) {
  const { kinds } = CATEGORIES[cat];
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'raw', `${cat}.json`), 'utf8'));
  const curationFile = path.join(ROOT, 'data', 'curation', `${cat}.json`);
  const curation = fs.existsSync(curationFile) ? JSON.parse(fs.readFileSync(curationFile, 'utf8')) : {};
  const imgOut = path.join(ROOT, 'public', 'images', cat);
  fs.mkdirSync(imgOut, { recursive: true });

  const problems = [];
  const questions = [];
  let unreviewed = 0;
  const rawIds = new Set(raw.items.map((i) => i.id));
  for (const id of Object.keys(curation)) {
    if (!rawIds.has(id)) problems.push(`curation entry for unknown item ${id} (removed from Plonk It?)`);
  }

  for (const item of raw.items) {
    const c = curation[item.id];
    if (!c) {
      problems.push(`new item without curation: ${item.id} ${item.imageUrl}`);
      continue;
    }
    if (c.exclude) continue;
    if (!c.crop && !c.checked) {
      unreviewed++;
      continue;
    }

    const required = c.required ?? [item.country];
    const optional = c.optional ?? [];
    for (const slug of [...required, ...optional]) {
      if (!areaIds.has(slug)) problems.push(`${item.id}: unknown country ${slug}`);
    }
    if (!c.ja) problems.push(`${item.id}: missing Japanese explanation`);
    if (kinds && !kinds[c.kind]) problems.push(`${item.id}: unknown kind ${c.kind}`);

    const src = path.join(ROOT, '.cache', 'images', item.imageUrl);
    if (!fs.existsSync(src)) {
      problems.push(`${item.id}: image not downloaded`);
      continue;
    }
    const file = `${item.id.replace('/', '-')}.webp`;
    const meta = await sharp(src).metadata();
    const [x0, y0, x1, y1] = c.crop ?? [0, 0, 1, 1];
    const left = Math.round(x0 * meta.width);
    const top = Math.round(y0 * meta.height);
    await sharp(src)
      .extract({
        left,
        top,
        width: Math.round(x1 * meta.width) - left,
        height: Math.round(y1 * meta.height) - top,
      })
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(path.join(imgOut, file));

    questions.push({
      id: item.id,
      country: item.country,
      image: `images/${cat}/${file}`,
      required,
      optional,
      region: c.region ?? null,
      ...(kinds ? { kind: c.kind } : {}),
      ja: c.ja,
      en: item.text.join('\n'),
      source: `https://www.plonkit.net/${item.country}`,
    });
  }

  // Images of items that are no longer questions.
  const files = new Set(questions.map((q) => path.basename(q.image)));
  for (const f of fs.readdirSync(imgOut)) if (!files.has(f)) fs.rmSync(path.join(imgOut, f));

  // Every Plonk It guide with its continent, so the catalog can also list the
  // guides that have nothing in this category.
  const guides = raw.countries.map((c) => ({ id: c.slug, continent: c.continent }));
  fs.writeFileSync(
    path.join(ROOT, 'public', 'data', `${cat}.json`),
    JSON.stringify({ fetchedAt: raw.fetchedAt, kinds: kinds ?? null, pending: unreviewed, guides, questions }, null, 1),
  );
  console.log(`${cat}: ${questions.length} questions written${unreviewed ? ` (${unreviewed} items waiting for image review)` : ''}`);
  if (problems.length) {
    failed = true;
    console.warn(`  ${problems.length} problem(s):`);
    for (const p of problems) console.warn(`  - ${p}`);
  }
}
if (failed) process.exitCode = 1;
