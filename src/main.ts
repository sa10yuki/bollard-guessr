import './style.css';
import { Catalog } from './catalog';
import { CATEGORIES, type Category, type CategoryData, type CategoryId } from './categories';
import { judge, loadReview, pickSet, updateReview, type Question, type Verdict } from './game';
import { AreaMap, type AreaProps } from './map';
import { normalize, renderInfo } from './text';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const el = {
  progress: $('progress'),
  play: $('play'),
  top: $('top'),
  menu: $('menu'),
  result: $('result'),
  catalog: $('catalog'),
  genres: $('genres'),
  menuTitle: $('menu-title'),
  menuDescription: $('menu-description'),
  menuKindsBox: $('menu-kinds-box'),
  menuKinds: $('menu-kinds'),
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
  startNormal: $<HTMLButtonElement>('start-normal'),
  startReview: $<HTMLButtonElement>('start-review'),
  resultReview: $<HTMLButtonElement>('result-review'),
  resultTitle: $('result-title'),
  resultList: $('result-list'),
};

let geo: GeoJSON.FeatureCollection<GeoJSON.MultiPolygon, AreaProps>;
const areas = new Map<string, AreaProps>();
const datasets = new Map<CategoryId, CategoryData>();
// Created on first use: Leaflet needs a visible container to lay out the map.
let areaMap: AreaMap;
let catalog: Catalog;

let category: Category = CATEGORIES[0];
/** Sign kind to quiz on, or "all". */
let quizKind = 'all';

type Mode = 'normal' | 'review';
let mode: Mode = 'normal';
let set: Question[] = [];
let index = 0;
let selected = new Set<string>();
let results: { q: Question; correct: boolean }[] = [];

const nameOf = (id: string) => areas.get(id)?.name ?? id;
const data = () => datasets.get(category.id)!;

// ---------- screens ----------

type Screen = 'top' | 'menu' | 'play' | 'result' | 'catalog';

function show(screen: Screen) {
  for (const s of ['top', 'menu', 'play', 'result', 'catalog'] as const) el[s].hidden = s !== screen;
  if (screen === 'play') {
    if (!areaMap) {
      areaMap = new AreaMap($('map'), geo);
      areaMap.onToggle = toggle;
    }
    areaMap.invalidate();
  }
  if (screen === 'catalog') {
    catalog.load(data(), category.name, quizKind);
    catalog.render();
  }
  if (screen === 'top') renderGenres();
  if (screen !== 'play') el.progress.textContent = '';
  refreshReviewButtons();
  window.scrollTo(0, 0);
}

function renderGenres() {
  el.genres.replaceChildren(
    ...CATEGORIES.map((c) => {
      const d = datasets.get(c.id);
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'genre';
      b.disabled = !d?.questions.length;
      const icon = document.createElement('span');
      icon.className = 'genre-icon';
      icon.textContent = c.icon;
      const name = document.createElement('strong');
      name.textContent = c.name;
      const desc = document.createElement('small');
      desc.textContent = d?.questions.length ? `${c.description}・${d.questions.length}問` : '準備中';
      b.append(icon, name, desc);
      b.onclick = () => openMenu(c);
      li.append(b);
      return li;
    }),
  );
}

function openMenu(c: Category) {
  category = c;
  quizKind = 'all';
  el.menuTitle.textContent = `${c.icon} ${c.name}`;
  el.menuDescription.textContent = `${c.name}の写真を見て、それが使われている国・地域を地図から全部選んでね。`;
  $('open-catalog').textContent = `${c.name}図鑑`;
  renderMenuKinds();
  show('menu');
}

/** Kind picker for categories with kinds (signs). */
function renderMenuKinds() {
  const kinds = data().kinds;
  el.menuKindsBox.hidden = !kinds;
  if (!kinds) return;
  const counts = new Map<string, number>();
  for (const q of data().questions) counts.set(q.kind!, (counts.get(q.kind!) ?? 0) + 1);
  const options: [string, string][] = [
    ['all', `すべて（${data().questions.length}）`],
    ...Object.entries(kinds)
      .filter(([key]) => counts.has(key))
      .map(([key, label]): [string, string] => [key, `${label}（${counts.get(key)}）`]),
  ];
  el.menuKinds.replaceChildren(
    ...options.map(([key, label]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'filter';
      b.textContent = label;
      b.setAttribute('aria-pressed', String(key === quizKind));
      b.onclick = () => {
        quizKind = key;
        renderMenuKinds();
        refreshReviewButtons();
      };
      return b;
    }),
  );
}

/** Questions of the current category, narrowed to the chosen kind. */
function pool() {
  return data().questions.filter((q) => quizKind === 'all' || q.kind === quizKind);
}

function reviewPool() {
  const ids = new Set(loadReview(category.id));
  return pool().filter((q) => ids.has(q.id));
}

function refreshReviewButtons() {
  if (!datasets.has(category.id)) return;
  const n = reviewPool().length;
  for (const b of [el.startReview, el.resultReview]) {
    b.disabled = n === 0;
    b.textContent = n ? `復習モード（${n}問）` : '復習モード';
  }
  el.reviewHint.textContent = n ? '' : '間違えた問題は復習モードで解き直せるよ';
}

function startSet(m: Mode) {
  let questions = m === 'review' ? reviewPool() : pool();
  // Everything has been cleared: fall back to a normal set.
  if (!questions.length) [m, questions] = ['normal', pool()];
  mode = m;
  set = pickSet(questions);
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
  el.progress.textContent = `${category.name}${mode === 'review' ? '（復習）' : ''} ${index + 1} / ${set.length}`;
  el.photo.src = q.image;
  el.photo.alt = `${category.name}の写真`;
  el.lightboxImg.src = q.image;
  el.prompt.replaceChildren(`この${category.name}が使われている国・地域を`, strong('すべて'), '選んでね');
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

function strong(text: string) {
  const s = document.createElement('strong');
  s.textContent = text;
  return s;
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
  updateReview(category.id, q.id, v.correct);

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
  const verdict = document.createElement('p');
  verdict.className = `verdict ${v.correct ? 'ok' : 'ng'}`;
  verdict.textContent = v.correct ? '正解！' : '残念…';

  const mistakes: [string, string][] = [];
  if (v.missed.length) mistakes.push(['選び忘れ', names(v.missed)]);
  if (v.wrong.length) mistakes.push(['違う国', names(v.wrong)]);

  el.feedback.replaceChildren(verdict, ...renderInfo(q, nameOf, data().kinds, mistakes));
}

function nextQuestion() {
  index++;
  if (index < set.length) showQuestion();
  else showResult();
}

function showResult() {
  const n = results.filter((r) => r.correct).length;
  el.resultTitle.textContent = `${category.name}: ${set.length}問中 ${n}問 正解`;
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

async function loadCategory(id: CategoryId) {
  const r = await fetch(`data/${id}.json`);
  // A category whose data hasn't been built yet is shown as "coming soon".
  if (!r.ok) return;
  datasets.set(id, await r.json());
}

async function boot() {
  const [world] = await Promise.all([
    fetch('data/world.geojson').then((r) => r.json()),
    ...CATEGORIES.map((c) => loadCategory(c.id).catch(() => {})),
  ]);
  geo = world;
  for (const f of geo.features) areas.set(f.properties.id, f.properties);
  searchIndex = [...areas.values()].map((area) => ({
    area,
    keys: [normalize(area.name), normalize(area.nameEn)],
  }));

  catalog = new Catalog(
    {
      title: $('catalog-title'),
      search: $<HTMLInputElement>('catalog-search'),
      kinds: $('catalog-kinds'),
      continents: $('catalog-continents'),
      similar: $<HTMLInputElement>('catalog-similar'),
      similarLabel: $('catalog-similar-label'),
      count: $('catalog-count'),
      list: $('catalog-list'),
      dialog: $<HTMLDialogElement>('detail'),
      dialogImg: $<HTMLImageElement>('detail-img'),
      dialogTitle: $('detail-title'),
      dialogBody: $('detail-body'),
    },
    areas,
  );

  el.startNormal.onclick = () => startSet('normal');
  el.startReview.onclick = () => startSet('review');
  $('open-catalog').onclick = () => show('catalog');
  $('menu-back').onclick = () => show('top');
  $('again').onclick = () => startSet(mode);
  el.resultReview.onclick = () => startSet('review');
  $('result-menu').onclick = () => show('menu');
  $('home-button').onclick = () => show('top');
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

  show('top');
}

boot().catch((e) => {
  document.body.textContent = `読み込みに失敗しました: ${e}`;
});
