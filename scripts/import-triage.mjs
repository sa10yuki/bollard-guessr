// Helper for curating a category: merges a compact triage file into
// data/curation/<category>.json.
//
// Usage: node scripts/import-triage.mjs <category> <triage file>
//
// Triage lines refer to items by their index in data/raw/<category>.json:
//   <index>|x|<reason>                                   exclude the item
//   <index>|<kind>|<required>|<optional>|<region>|<ja>   keep it
// <required> and <optional> are comma-separated slugs; an empty <required>
// means the item's own country. <kind> is "-" for categories without kinds.
// Existing fields of an entry (e.g. crop) are kept. Lines starting with # are ignored.
import fs from 'node:fs';
import path from 'node:path';

const [cat, file] = process.argv.slice(2);
const ROOT = path.resolve(import.meta.dirname, '..');
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'raw', `${cat}.json`), 'utf8'));
const curationFile = path.join(ROOT, 'data', 'curation', `${cat}.json`);
const curation = fs.existsSync(curationFile) ? JSON.parse(fs.readFileSync(curationFile, 'utf8')) : {};

const list = (s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);
let n = 0;
for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  const [idx, kind, ...rest] = line.split('|');
  const item = raw.items[Number(idx)];
  if (!item) throw new Error(`no item ${idx}`);
  const prev = curation[item.id] ?? {};
  if (kind === 'x') {
    curation[item.id] = { exclude: rest.join('|') || 'not useful' };
  } else {
    const [req, opt, region, ...ja] = rest;
    const entry = { ...(prev.crop ? { crop: prev.crop } : {}) };
    if (kind !== '-') entry.kind = kind;
    if (list(req).length) entry.required = list(req);
    if (list(opt).length) entry.optional = list(opt);
    if (region) entry.region = region;
    entry.ja = ja.join('|');
    curation[item.id] = entry;
  }
  n++;
}
fs.mkdirSync(path.dirname(curationFile), { recursive: true });
fs.writeFileSync(curationFile, JSON.stringify(curation, null, 2) + '\n');
console.log(`${n} lines imported, ${Object.keys(curation).length}/${raw.items.length} items curated`);
