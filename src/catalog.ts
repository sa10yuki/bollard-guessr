import type { CategoryData, Guide } from './categories';
import type { Question } from './game';
import { normalize, renderInfo } from './text';

const CONTINENTS: [string, string][] = [
  ['Europe', 'ヨーロッパ'],
  ['Asia', 'アジア'],
  ['North America', '北アメリカ'],
  ['South America', '南アメリカ'],
  ['Africa', 'アフリカ'],
  ['Oceania', 'オセアニア'],
  ['Antarctica', '南極'],
];

interface CatalogElements {
  title: HTMLElement;
  search: HTMLInputElement;
  kinds: HTMLElement;
  continents: HTMLElement;
  similar: HTMLInputElement;
  similarLabel: HTMLElement;
  count: HTMLElement;
  list: HTMLElement;
  dialog: HTMLDialogElement;
  dialogImg: HTMLImageElement;
  dialogTitle: HTMLElement;
  dialogBody: HTMLElement;
}

interface Entry {
  q: Question;
  /** "uses": the country uses this item; "similar": a similar one is found there. */
  relation: 'uses' | 'similar';
}

type Names = Map<string, { name: string; nameEn: string }>;

/** The catalog of a category: every item, grouped by the countries that use it. */
export class Catalog {
  private continent = 'all';
  private kind = 'all';
  private query = '';
  private showSimilar = true;
  private noun = '';
  private data: CategoryData = { kinds: null, guides: [], questions: [] };
  private entries = new Map<string, Entry[]>();
  private readonly el: CatalogElements;
  private readonly names: Names;

  constructor(el: CatalogElements, names: Names) {
    this.el = el;
    this.names = names;
    el.search.oninput = () => {
      this.query = normalize(el.search.value);
      this.render();
    };
    el.similar.onchange = () => {
      this.showSimilar = el.similar.checked;
      this.render();
    };
    el.dialog.onclick = (e) => {
      // A click on the backdrop (outside the dialog box) closes it.
      if (e.target === el.dialog) el.dialog.close();
    };
  }

  /** Switches to a category. `noun` is its Japanese name, e.g. 「電柱」. */
  load(data: CategoryData, noun: string, kind = 'all') {
    this.data = data;
    this.noun = noun;
    this.kind = kind;
    this.continent = 'all';
    this.query = '';
    this.el.search.value = '';
    this.el.title.textContent = `${noun}図鑑`;
    this.el.similarLabel.textContent = `似ている${noun}も表示`;

    this.entries.clear();
    for (const q of data.questions) {
      for (const id of q.required) this.add(id, { q, relation: 'uses' });
      for (const id of q.optional) this.add(id, { q, relation: 'similar' });
    }

    this.el.continents.replaceChildren(
      ...filterButtons(
        [['all', 'すべて'], ...CONTINENTS.filter(([key]) => data.guides.some((g) => g.continent === key))],
        (key) => {
          this.continent = key;
          this.render();
        },
      ),
    );
    this.el.kinds.hidden = !data.kinds;
    if (data.kinds) {
      const used = new Set(data.questions.map((q) => q.kind));
      this.el.kinds.replaceChildren(
        ...filterButtons(
          [['all', 'すべての種類'], ...Object.entries(data.kinds).filter(([key]) => used.has(key))],
          (key) => {
            this.kind = key;
            this.render();
          },
        ),
      );
    }
  }

  private add(id: string, entry: Entry) {
    if (!this.entries.has(id)) this.entries.set(id, []);
    this.entries.get(id)!.push(entry);
  }

  private nameOf = (id: string) => this.names.get(id)?.name ?? id;

  private matches(id: string) {
    if (!this.query) return true;
    const n = this.names.get(id);
    return [n?.name ?? id, n?.nameEn ?? ''].some((s) => normalize(s).includes(this.query));
  }

  render() {
    for (const b of this.el.continents.querySelectorAll<HTMLButtonElement>('.filter')) {
      b.setAttribute('aria-pressed', String(b.dataset.key === this.continent));
    }
    for (const b of this.el.kinds.querySelectorAll<HTMLButtonElement>('.filter')) {
      b.setAttribute('aria-pressed', String(b.dataset.key === this.kind));
    }

    const byName = (a: Guide, b: Guide) => this.nameOf(a.id).localeCompare(this.nameOf(b.id), 'ja');
    const visible = this.data.guides
      .filter((g) => this.continent === 'all' || g.continent === this.continent)
      .filter((g) => this.matches(g.id));

    const sections: HTMLElement[] = [];
    const withoutItems: Guide[] = [];
    let cards = 0;
    for (const [key, label] of CONTINENTS) {
      const guides = visible.filter((g) => g.continent === key).sort(byName);
      const countries: HTMLElement[] = [];
      for (const g of guides) {
        const entries = (this.entries.get(g.id) ?? [])
          .filter((e) => this.showSimilar || e.relation === 'uses')
          .filter((e) => this.kind === 'all' || e.q.kind === this.kind);
        if (!entries.length) {
          withoutItems.push(g);
          continue;
        }
        // The country's own items first, then the ones it shares or resembles.
        entries.sort((a, b) => rank(a, g.id) - rank(b, g.id));
        countries.push(this.renderCountry(g.id, entries));
        cards += entries.length;
      }
      if (!countries.length) continue;
      const section = document.createElement('section');
      section.className = 'continent';
      const h = document.createElement('h2');
      h.textContent = label;
      section.append(h, ...countries);
      sections.push(section);
    }

    if (withoutItems.length) {
      const what = this.kind === 'all' ? this.noun : (this.data.kinds?.[this.kind] ?? this.noun);
      const section = document.createElement('section');
      section.className = 'continent none';
      const h = document.createElement('h2');
      h.textContent = `${what}の情報がない国・地域`;
      const note = document.createElement('p');
      note.textContent = `Plonk It のガイドに${what}の項目がない国・地域。見分けの決め手にならない国も多い。`;
      const list = document.createElement('ul');
      list.className = 'plain-chips';
      list.append(
        ...withoutItems.sort(byName).map((g) => {
          const li = document.createElement('li');
          li.textContent = this.nameOf(g.id);
          return li;
        }),
      );
      section.append(h, note, list);
      sections.push(section);
    }

    const countryCount = visible.length - withoutItems.length;
    this.el.count.textContent = countryCount ? `${countryCount}か国・地域 / ${cards}件` : '';
    if (!sections.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = '見つからなかったよ';
      sections.push(empty);
    }
    this.el.list.replaceChildren(...sections);
  }

  private renderCountry(id: string, entries: Entry[]) {
    const box = document.createElement('section');
    box.className = 'country';
    const h = document.createElement('h3');
    h.textContent = this.nameOf(id);
    const count = document.createElement('small');
    count.textContent = `${entries.length}件`;
    h.append(count);

    const grid = document.createElement('ul');
    grid.className = 'cards';
    grid.append(...entries.map((e) => this.renderCard(id, e)));
    box.append(h, grid);
    return box;
  }

  private renderCard(id: string, { q, relation }: Entry) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'card-button';
    b.onclick = () => this.open(q);

    const img = document.createElement('img');
    img.src = q.image;
    img.alt = `${this.nameOf(id)}の${this.noun}`;
    img.loading = 'lazy';

    const caption = document.createElement('span');
    caption.className = 'caption';
    if (q.kind && this.data.kinds) {
      const k = document.createElement('span');
      k.className = 'kind';
      k.textContent = this.data.kinds[q.kind] ?? q.kind;
      caption.append(k);
    }
    if (relation === 'similar') {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = '似ている';
      caption.append(badge, `${this.joinNames(q.required)}の${this.noun}`);
    } else {
      // q.region describes where in q.country the item is found.
      if (q.country !== id) caption.append(`共通の${this.noun}`);
      else caption.append(q.region ?? '全国');
      const others = q.required.filter((x) => x !== id);
      if (others.length) {
        const also = document.createElement('small');
        also.textContent = `ほかに: ${this.joinNames(others)}`;
        caption.append(also);
      }
    }
    b.append(img, caption);
    li.append(b);
    return li;
  }

  private joinNames(ids: string[]) {
    return ids.map(this.nameOf).join('、');
  }

  private open(q: Question) {
    this.el.dialogImg.src = q.image;
    this.el.dialogTitle.textContent = `${this.joinNames(q.required)}の${this.noun}`;
    this.el.dialogBody.replaceChildren(...renderInfo(q, this.nameOf, this.data.kinds));
    this.el.dialog.showModal();
    this.el.dialogBody.scrollTop = 0;
  }
}

function filterButtons(options: [string, string][], onPick: (key: string) => void) {
  return options.map(([key, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'filter';
    b.dataset.key = key;
    b.textContent = label;
    b.onclick = () => onPick(key);
    return b;
  });
}

/** Sort key inside a country: own items, then shared ones, then similar ones. */
function rank(e: Entry, id: string) {
  if (e.relation === 'similar') return 2;
  return e.q.country === id ? 0 : 1;
}
