// Helper for curating a category: applies image review results to
// data/curation/<category>.json.
//
// Usage: node scripts/apply-review.mjs <category> <review file>
//
// Lines refer to items by their index in data/raw/<category>.json:
//   <index>|-                   image is fine as it is ("checked": true)
//   <index>|x0,y0,x1,y1         crop to these fractions of the image
//   <index>|x|<reason>          exclude after all (image not usable)
// An entry counts as reviewed when it has "crop" or "checked"; build-data.mjs
// only turns reviewed entries into questions.
import fs from 'node:fs';
import path from 'node:path';

const [cat, file] = process.argv.slice(2);
const ROOT = path.resolve(import.meta.dirname, '..');
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'raw', `${cat}.json`), 'utf8'));
const curationFile = path.join(ROOT, 'data', 'curation', `${cat}.json`);
const curation = JSON.parse(fs.readFileSync(curationFile, 'utf8'));

let n = 0;
for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  const [idx, what, reason] = line.split('|');
  const item = raw.items[Number(idx)];
  if (!item) throw new Error(`no item ${idx}`);
  const entry = curation[item.id];
  if (!entry) throw new Error(`${item.id} has no curation entry`);
  if (what === 'x') {
    curation[item.id] = { exclude: reason || 'image not usable' };
  } else if (what === '-') {
    const { checked: _, ...rest } = entry;
    curation[item.id] = { checked: true, ...rest };
  } else {
    const crop = what.split(',').map(Number);
    if (crop.length !== 4 || crop.some((v) => !(v >= 0 && v <= 1))) throw new Error(`bad crop on line ${line}`);
    // Keep "crop" first so entries read naturally.
    const { crop: _, ...rest } = entry;
    curation[item.id] = { crop, ...rest };
  }
  n++;
}
fs.writeFileSync(curationFile, JSON.stringify(curation, null, 2) + '\n');
const kept = Object.values(curation).filter((e) => !e.exclude);
console.log(`${n} reviews applied, ${kept.filter((e) => e.crop || e.checked).length}/${kept.length} kept items reviewed`);
