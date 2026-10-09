// Builds the quiz data from the scraped items and the hand-written curation.
//
// Usage: node scripts/build-data.mjs
//
// Inputs:
//   data/raw-bollards.json   output of fetch-plonkit.mjs
//   data/curation.json       per item: crop, answer countries, Japanese explanation
//   .cache/images/...        output of download-images.mjs
// Outputs:
//   public/bollards/*.webp   cropped images (Plonk It's region maps cut away)
//   public/data/bollards.json
//
// curation.json entries, keyed by item id ("<country slug>/<item id>"):
//   { "exclude": "why" }                 not used as a question
//   { "crop": [x0, y0, x1, y1],          fractions of the original image, default whole image
//     "required": ["slug", ...],         countries that must all be selected, default [own country]
//     "optional": ["slug", ...],         countries that may be selected without penalty
//     "region": "...",                   where inside the country, for regional bollards
//     "ja": "..." }                      Japanese explanation
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'raw-bollards.json'), 'utf8'));
const curation = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'curation.json'), 'utf8'));
const world = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'world.geojson'), 'utf8'));
const areaIds = new Set(world.features.map((f) => f.properties.id));
const IMG_OUT = path.join(ROOT, 'public', 'bollards');
const MAX_WIDTH = 1200;

fs.mkdirSync(IMG_OUT, { recursive: true });

const problems = [];
const questions = [];
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

  const required = c.required ?? [item.country];
  const optional = c.optional ?? [];
  for (const slug of [...required, ...optional]) {
    if (!areaIds.has(slug)) problems.push(`${item.id}: unknown country ${slug}`);
  }
  if (!c.ja) problems.push(`${item.id}: missing Japanese explanation`);

  const src = path.join(ROOT, '.cache', 'images', item.imageUrl);
  if (!fs.existsSync(src)) {
    problems.push(`${item.id}: image not downloaded`);
    continue;
  }
  const file = `${item.id.replace('/', '-')}.webp`;
  const dest = path.join(IMG_OUT, file);
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
    .toFile(dest);

  questions.push({
    id: item.id,
    country: item.country,
    image: `bollards/${file}`,
    required,
    optional,
    region: c.region ?? null,
    ja: c.ja,
    en: item.text.join('\n'),
    source: `https://www.plonkit.net/${item.country}`,
  });
}

// Every Plonk It guide with its continent, so the catalog can also list the
// guides that have no bollard at all.
const guides = raw.countries.map((c) => ({ id: c.slug, continent: c.continent }));

fs.writeFileSync(
  path.join(ROOT, 'public', 'data', 'bollards.json'),
  JSON.stringify({ fetchedAt: raw.fetchedAt, guides, questions }, null, 1),
);
console.log(`${questions.length} questions written`);
if (problems.length) {
  console.warn(`\n${problems.length} problem(s):`);
  for (const p of problems) console.warn(`  - ${p}`);
  process.exitCode = 1;
}
