import './style.css';
import { judge, loadReview, pickSet, updateReview, type Question, type Verdict } from './game';
import { AreaMap, type AreaProps } from './map';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const el = {
  progress: $('progress'),
  play: $('play'),
  start: $('start'),
  result: $('result'),
  photo: $<HTMLImageElement>('photo'),
  photoButton: $('photo-button'),
  lightbox: $('lightbox'),
  lightboxImg: $<HTMLImageElement>('lightbox-img'),
  panel: $('panel'),
  prompt: $('prompt'),
  searchBox: $('search-box'),
  search: $<HTMLInputElement>('search'),
  suggest: $('suggest'),
  chips: $('chips'),
  answer: $<HTMLButtonElement>('answer'),
  next: $<HTMLButtonElement>('next'),
  feedback: $('feedback'),
  legend: $('legend'),
  reviewHint: $('review-hint'),
  startReview: $<HTMLButtonElement>('start-review'),
  resultReview: $<HTMLButtonElement>('result-review'),
  resultTitle: $('result-title'),
  resultList: $('result-list'),
};

let questions: Question[] = [];
let geo: GeoJSON.FeatureCollection<GeoJSON.MultiPolygon, AreaProps>;
const areas = new Map<string, AreaProps>();
// Created on first use: Leaflet needs a visible container to lay out the map.
let areaMap: AreaMap;

type Mode = 'normal' | 'review';
let mode: Mode = 'normal';
let set: Question[] = [];
let index = 0;
let selected = new Set<string>();
let results: { q: Question; correct: boolean }[] = [];

const nameOf = (id: string) => areas.get(id)?.name ?? id;

// ---------- screens ----------

function show(screen: 'start' | 'play' | 'result') {
  el.start.hidden = screen !== 'start';
  el.result.hidden = screen !== 'result';
  el.play.hidden = screen !== 'play';
  if (screen === 'play') {
    if (!areaMap) {
      areaMap = new AreaMap($('map'), geo);
      areaMap.onToggle = toggle;
    }
    areaMap.invalidate();
  }
  if (screen !== 'play') el.progress.textContent = '';
  refreshReviewButtons();
}

function refreshReviewButtons() {
  const ids = new Set(questions.map((q) => q.id));
  const n = loadReview().filter((id) => ids.has(id)).length;
  for (const b of [el.startReview, el.resultReview]) {
    b.disabled = n === 0;
    b.textContent = n ? `復習モード（${n}問）` : '復習モード';
  }
  el.reviewHint.textContent = n ? '' : '間違えた問題は復習モードで解き直せるよ';
}

function startSet(m: Mode) {
  let pool = questions;
  if (m === 'review') {
    const ids = new Set(loadReview());
    pool = questions.filter((q) => ids.has(q.id));
    // Everything has been cleared: fall back to a normal set.
    if (!pool.length) [m, pool] = ['normal', questions];
  }
  mode = m;
  set = pickSet(pool);
  if (!set.length) return;
  index = 0;
  results = [];
  show('play');
  showQuestion();
}

// ---------- question ----------

function showQuestion() {
  const q = set[index];
  selected = new Set();
  el.progress.textContent = `${mode === 'review' ? '復習 ' : ''}${index + 1} / ${set.length}`;
  el.photo.src = q.image;
  el.lightboxImg.src = q.image;
  el.feedback.hidden = true;
  el.feedback.replaceChildren();
  el.legend.hidden = true;
  el.prompt.hidden = false;
  el.searchBox.hidden = false;
  el.answer.hidden = false;
  el.next.hidden = true;
  el.play.classList.remove('answered');
  areaMap.invalidate();
  el.search.value = '';
  renderSuggest();
  renderChips();
  areaMap.showSelection(selected);
  areaMap.resetView();
}

function toggle(id: string) {
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  renderChips();
  areaMap.showSelection(selected);
}

function renderChips(verdict?: Verdict) {
  el.chips.replaceChildren(
    ...[...selected].map((id) => {
      const li = document.createElement('li');
      li.className = 'chip';
      if (verdict) {
        li.classList.add(verdict.wrong.includes(id) ? 'wrong' : verdict.optional.includes(id) ? 'optional' : 'ok');
        li.textContent = nameOf(id);
      } else {
        const name = document.createElement('button');
        name.type = 'button';
        name.className = 'chip-name';
        name.textContent = nameOf(id);
        name.title = '地図で表示';
        name.onclick = () => areaMap.flyTo(id);
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'chip-x';
        x.setAttribute('aria-label', `${nameOf(id)}を外す`);
        x.textContent = '×';
        x.onclick = () => toggle(id);
        li.append(name, x);
      }
      return li;
    }),
  );
  el.answer.disabled = selected.size === 0;
}

function submit() {
  const q = set[index];
  const v = judge(q, selected);
  results.push({ q, correct: v.correct });
  updateReview(q.id, v.correct);

  renderChips(v);
  el.legend.hidden = false;
  el.prompt.hidden = true;
  el.searchBox.hidden = true;
  el.answer.hidden = true;
  el.next.hidden = false;
  el.next.textContent = index + 1 < set.length ? '次へ' : '結果を見る';
  el.play.classList.add('answered');
  renderFeedback(q, v);
  el.feedback.hidden = false;
  el.panel.scrollTop = 0;

  // The layout changes above can resize the map (on phones), so zoom afterwards.
  areaMap.invalidate();
  areaMap.showVerdict(v, selected);
}

function names(ids: string[]) {
  return ids.map(nameOf).join('、');
}

function renderFeedback(q: Question, v: Verdict) {
  const f = el.feedback;
  const verdict = document.createElement('p');
  verdict.className = `verdict ${v.correct ? 'ok' : 'ng'}`;
  verdict.textContent = v.correct ? '正解！' : '残念…';

  const facts = document.createElement('dl');
  facts.className = 'facts';
  const fact = (label: string, value: string) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    facts.append(dt, dd);
  };
  fact('使われている国・地域', names(q.required));
  if (q.optional.length) fact('似たものがある国（選んでもOK）', names(q.optional));
  if (q.region) fact('見られる地域', q.region);
  if (v.missed.length) fact('選び忘れ', names(v.missed));
  if (v.wrong.length) fact('違う国', names(v.wrong));

  const explain = document.createElement('p');
  explain.className = 'explain';
  explain.textContent = q.ja;

  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Plonk It の原文（英語）';
  const en = document.createElement('div');
  en.className = 'en';
  en.append(...renderPlonkitText(q.en));
  details.append(summary, en);

  const link = document.createElement('a');
  link.href = q.source;
  link.target = '_blank';
  link.rel = 'noopener';
  link.className = 'source';
  link.textContent = `Plonk It の「${nameOf(q.country)}」ガイドを開く ↗`;

  const credit = document.createElement('p');
  credit.className = 'item-credit';
  credit.append('画像・説明: Plonk It（');
  const cc = document.createElement('a');
  cc.href = 'https://creativecommons.org/licenses/by-nc-sa/4.0/deed.ja';
  cc.target = '_blank';
  cc.rel = 'noopener';
  cc.textContent = 'CC BY-NC-SA 4.0';
  credit.append(cc, '）。画像はトリミング、説明は翻訳・要約して使用。');

  f.replaceChildren(verdict, facts, explain, details, link, credit);
}

/** Renders Plonk It's light markdown (**bold**, [text](url)) as DOM nodes without innerHTML. */
function renderPlonkitText(text: string): Node[] {
  return text.split('\n').map((line) => {
    const p = document.createElement('p');
    const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
    let last = 0;
    for (const m of line.matchAll(re)) {
      p.append(line.slice(last, m.index));
      if (m[1] !== undefined) {
        const b = document.createElement('strong');
        b.textContent = m[1];
        p.append(b);
      } else {
        const a = document.createElement('a');
        a.textContent = m[2];
        const url = m[3].startsWith('/') ? `https://www.plonkit.net${m[3]}` : m[3];
        if (/^https?:\/\//.test(url)) {
          a.href = url;
          a.target = '_blank';
          a.rel = 'noopener';
        }
        p.append(a);
      }
      last = m.index + m[0].length;
    }
    p.append(line.slice(last).replace(/\*\*/g, ''));
    return p;
  });
}

function nextQuestion() {
  index++;
  if (index < set.length) showQuestion();
  else showResult();
}

function showResult() {
  const n = results.filter((r) => r.correct).length;
  el.resultTitle.textContent = `${set.length}問中 ${n}問 正解`;
  el.resultList.replaceChildren(
    ...results.map(({ q, correct }) => {
      const li = document.createElement('li');
      li.className = correct ? 'ok' : 'ng';
      const img = document.createElement('img');
      img.src = q.image;
      img.alt = '';
      const text = document.createElement('div');
      const mark = document.createElement('strong');
      mark.textContent = correct ? '○ 正解' : '× 不正解';
      const ans = document.createElement('span');
      ans.textContent = names(q.required) + (q.region ? `（${q.region}）` : '');
      text.append(mark, ans);
      li.append(img, text);
      return li;
    }),
  );
  show('result');
}

// ---------- search ----------

/** Hiragana -> katakana and lowercase, so "どいつ" and "ドイツ" both match. */
function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/[\s・･·-]/g, '');
}

let searchIndex: { area: AreaProps; keys: string[] }[] = [];

function renderSuggest() {
  const q = normalize(el.search.value);
  if (!q) {
    el.suggest.hidden = true;
    el.suggest.replaceChildren();
    return;
  }
  const hits = searchIndex
    .map((e) => ({ e, rank: Math.min(...e.keys.map((k) => (k.startsWith(q) ? 0 : k.includes(q) ? 1 : 9))) }))
    .filter((h) => h.rank < 9)
    .sort((a, b) => a.rank - b.rank || a.e.area.name.localeCompare(b.e.area.name, 'ja'))
    .slice(0, 8);
  el.suggest.replaceChildren(
    ...hits.map(({ e }) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = e.area.name;
      const en = document.createElement('small');
      en.textContent = e.area.nameEn;
      b.append(en);
      if (selected.has(e.area.id)) b.classList.add('on');
      b.onclick = () => pickFromSearch(e.area.id);
      li.append(b);
      return li;
    }),
  );
  el.suggest.hidden = hits.length === 0;
}

function pickFromSearch(id: string) {
  if (!selected.has(id)) toggle(id);
  areaMap.flyTo(id);
  el.search.value = '';
  renderSuggest();
}

// ---------- boot ----------

async function boot() {
  const [world, data] = await Promise.all([
    fetch('data/world.geojson').then((r) => r.json()),
    fetch('data/bollards.json').then((r) => r.json()),
  ]);
  geo = world;
  for (const f of geo.features) areas.set(f.properties.id, f.properties);
  questions = data.questions;
  searchIndex = [...areas.values()].map((area) => ({
    area,
    keys: [normalize(area.name), normalize(area.nameEn)],
  }));

  const startNormal = $<HTMLButtonElement>('start-normal');
  startNormal.onclick = () => startSet('normal');
  startNormal.disabled = false; // start-review is handled by refreshReviewButtons()
  el.startReview.onclick = () => startSet('review');
  $('again').onclick = () => startSet(mode);
  el.resultReview.onclick = () => startSet('review');
  $('result-home').onclick = () => show('start');
  $('home-button').onclick = () => show('start');
  el.answer.onclick = submit;
  el.next.onclick = nextQuestion;
  el.photoButton.onclick = () => (el.lightbox.hidden = false);
  el.lightbox.onclick = () => (el.lightbox.hidden = true);
  el.search.oninput = renderSuggest;
  el.search.onkeydown = (e) => {
    if (e.isComposing) return; // Enter that confirms IME conversion
    if (e.key === 'Enter') {
      el.suggest.querySelector('button')?.click();
    } else if (e.key === 'Escape') {
      el.search.value = '';
      renderSuggest();
    }
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') el.lightbox.hidden = true;
  });

  show('start');
}

boot().catch((e) => {
  document.body.textContent = `読み込みに失敗しました: ${e}`;
});
