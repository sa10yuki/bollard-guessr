// Builds public/data/world.geojson: one feature per selectable area on the map.
//
// Usage: node scripts/build-geo.mjs
//
// Source: Natural Earth 1:10m admin-0 countries (downloaded to .cache/geo).
// Areas that Plonk It treats as separate guides (Alaska, Azores, Réunion, ...)
// are split off from their parent country, and every feature gets
//   id     Plonk It slug, or "x-<code>" for areas without a Plonk It guide
//   name   Japanese name
//   nameEn English name (used for search)
//   small  true when the area is too small to click comfortably
//   center [lon, lat] for the small-area marker
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const GEO = path.join(ROOT, '.cache', 'geo');
const SRC = path.join(GEO, 'ne10.geojson');
const AREAS = path.join(GEO, 'areas.geojson');
const OUT = path.join(ROOT, 'public', 'data', 'world.geojson');
const NE_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson';

fs.mkdirSync(GEO, { recursive: true });
if (!fs.existsSync(SRC)) {
  console.log('downloading Natural Earth...');
  fs.writeFileSync(SRC, Buffer.from(await (await fetch(NE_URL)).arrayBuffer()));
}

const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'raw', 'bollard.json'), 'utf8'));
const slugByCode = Object.fromEntries(raw.countries.map((c) => [c.code, c.slug]));
const titleBySlug = Object.fromEntries(raw.countries.map((c) => [c.slug, c.title]));

// Natural Earth features merged into another area, or dropped (tiny disputed spots).
const MERGE = {
  PSX: 'israel-west-bank', ISR: 'israel-west-bank',
  CYN: 'cyprus', CNM: 'cyprus', ESB: 'cyprus', WSB: 'cyprus',
  SOL: 'x-SOM', KAS: 'india', USG: 'x-CUB',
  UMI: 'us-minor-outlying-islands',
};
const DROP = new Set(['SPI', 'BRT', 'BJN', 'SER', 'SCR', 'PGA']);

// Parts of a country polygon that become their own area. Tested against the
// bounding-box center of each polygon part, in order.
const inBox = ([lon, lat], [w, s, e, n]) => lon >= w && lon <= e && lat >= s && lat <= n;
const SPLITS = {
  USA: [
    { id: 'hawaii', test: (c) => inBox(c, [-179, 18, -154, 29]) },
    { id: 'alaska', test: (c) => (c[0] < -129 && c[1] > 50) || c[0] > 170 },
  ],
  FRA: [
    { id: 'reunion', test: (c) => inBox(c, [55, -21.5, 56, -20.8]) },
    { id: 'martinique', test: (c) => inBox(c, [-61.3, 14.3, -60.7, 15]) },
    { id: 'x-GUF', test: (c) => inBox(c, [-55, 1.5, -51, 6.5]) },
    { id: 'x-GLP', test: (c) => inBox(c, [-62, 15.8, -60.9, 16.6]) },
    { id: 'x-MYT', test: (c) => inBox(c, [44.9, -13.1, 45.4, -12.5]) },
  ],
  PRT: [
    { id: 'azores', test: (c) => c[0] < -24 },
    { id: 'madeira', test: (c) => c[1] < 34 },
  ],
  NOR: [
    { id: 'svalbard', test: (c) => c[1] > 74 },
    { id: 'x-SJM-JM', test: (c) => inBox(c, [-10, 70.5, -7, 71.5]) },
  ],
  NLD: [{ id: 'x-BES', test: (c) => c[0] < -60 }],
  IOA: [
    { id: 'christmas-island', test: (c) => c[0] > 100 },
    { id: 'cocos-islands', test: () => true },
  ],
};

const NAMES = {
  'united-states': ['アメリカ合衆国（本土）', 'United States (contiguous)'],
  alaska: ['アラスカ', 'Alaska'],
  hawaii: ['ハワイ', 'Hawaii'],
  reunion: ['レユニオン', 'Réunion'],
  martinique: ['マルティニーク', 'Martinique'],
  azores: ['アゾレス諸島', 'Azores'],
  madeira: ['マデイラ諸島', 'Madeira'],
  svalbard: ['スヴァールバル諸島', 'Svalbard'],
  'christmas-island': ['クリスマス島', 'Christmas Island'],
  'cocos-islands': ['ココス諸島', 'Cocos Islands'],
  'us-minor-outlying-islands': ['合衆国領有小離島', 'US Minor Outlying Islands'],
  'israel-west-bank': ['イスラエル・ヨルダン川西岸', 'Israel & West Bank'],
  cyprus: ['キプロス', 'Cyprus'],
  'x-GUF': ['フランス領ギアナ', 'French Guiana'],
  'x-GLP': ['グアドループ', 'Guadeloupe'],
  'x-MYT': ['マヨット', 'Mayotte'],
  'x-SJM-JM': ['ヤンマイエン島', 'Jan Mayen'],
  'x-BES': ['カリブ・オランダ', 'Caribbean Netherlands'],
  'x-SOM': ['ソマリア', 'Somalia'],
  france: ['フランス', 'France'],
  portugal: ['ポルトガル', 'Portugal'],
  norway: ['ノルウェー', 'Norway'],
  netherlands: ['オランダ', 'Netherlands'],
};

const src = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const areas = new Map(); // id -> { name, nameEn, polygons: [] }

function add(id, name, nameEn, polygons) {
  if (!areas.has(id)) areas.set(id, { name, nameEn, polygons: [] });
  areas.get(id).polygons.push(...polygons);
}

function ringBox(ring) {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of ring) [w, s, e, n] = [Math.min(w, x), Math.min(s, y), Math.max(e, x), Math.max(n, y)];
  return [w, s, e, n];
}

for (const f of src.features) {
  const p = f.properties;
  const a3 = p.ADM0_A3;
  if (DROP.has(a3) || !f.geometry) continue;
  const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const iso = p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : p.ISO_A2;
  const id = MERGE[a3] ?? (a3 === 'IOA' ? null : slugByCode[iso] ?? `x-${a3}`);

  const rest = [];
  for (const poly of polygons) {
    const [w, s, e, n] = ringBox(poly[0]);
    const rule = (SPLITS[a3] ?? []).find((r) => r.test([(w + e) / 2, (s + n) / 2]));
    if (rule) add(rule.id, null, null, [poly]);
    else rest.push(poly);
  }
  if (rest.length && id) add(id, p.NAME_JA, p.NAME, rest);
}

const features = [];
for (const [id, a] of areas) {
  const [name, nameEn] = NAMES[id] ?? [a.name, titleBySlug[id] ?? a.nameEn];
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  let biggest = null;
  let biggestArea = -1;
  for (const poly of a.polygons) {
    const b = ringBox(poly[0]);
    [w, s, e, n] = [Math.min(w, b[0]), Math.min(s, b[1]), Math.max(e, b[2]), Math.max(n, b[3])];
    const area = (b[2] - b[0]) * (b[3] - b[1]);
    if (area > biggestArea) [biggestArea, biggest] = [area, b];
  }
  const center = [+((biggest[0] + biggest[2]) / 2).toFixed(3), +((biggest[1] + biggest[3]) / 2).toFixed(3)];
  features.push({
    type: 'Feature',
    properties: { id, name, nameEn, guide: !id.startsWith('x-'), small: biggestArea < 1.5, center },
    geometry: { type: 'MultiPolygon', coordinates: a.polygons },
  });
}

const missing = raw.countries.filter((c) => !areas.has(c.slug)).map((c) => c.slug);
if (missing.length) console.warn('Plonk It guides without map area:', missing.join(', '));
const unnamed = features.filter((f) => !f.properties.name).map((f) => f.properties.id);
if (unnamed.length) console.warn('areas without Japanese name:', unnamed.join(', '));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(AREAS, JSON.stringify({ type: 'FeatureCollection', features }));
execFileSync(
  process.execPath,
  [
    path.join(ROOT, 'node_modules', 'mapshaper', 'bin', 'mapshaper'),
    AREAS,
    '-simplify', '4%', 'keep-shapes',
    '-o', OUT, 'precision=0.001', 'force',
  ],
  { stdio: 'inherit' },
);
const out = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const lost = out.features.filter((f) => !f.geometry).map((f) => f.properties.id);
if (lost.length) console.warn('areas lost in simplification:', lost.join(', '));
console.log(`${features.length} areas, ${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB -> ${path.relative(ROOT, OUT)}`);
