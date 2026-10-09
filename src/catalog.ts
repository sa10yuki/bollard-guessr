import type { Question } from './game';
import { normalize, renderBollardInfo } from './text';

/** A Plonk It country guide. */
export interface Guide {
  id: string;
  continent: string;
}

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
  search: HTMLInputElement;
  continents: HTMLElement;
  similar: HTMLInputElement;
  count: HTMLElement;
  list: HTMLElement;
  dialog: HTMLDialogElement;
  dialogImg: HTMLImageElement;
  dialogTitle: HTMLElement;
  dialogBody: HTMLElement;
}

interface Entry {
  q: Question;
  /** "uses": the country uses this bollard; "similar": a similar one is found there. */
  kind: 'uses' | 'similar';
}

/** The bollard catalog: every bollard, grouped by the countries that use it. */
export class Catalog {
  private continent = 'all';
  private query = '';
  private showSimilar = true;
  private entries = new Map<string, Entry[]>();
  private readonly el: CatalogElements;
  private readonly guides: Guide[];
  private readonly names: Map<string, { name: string; nameEn: string }>;

  constructor(
    el: CatalogElements,
    guides: Guide[],
    questions: Question[],
    names: Map<string, { name: string; nameEn: string }>,
  ) {
    this.el = el;
    this.guides = guides;
    this.names = names;
    for (const q of questions) {
      for (const id of q.required) this.add(id, { q, kind: 'uses' });
      for (const id of q.optional) this.add(id, { q, kind: 'similar' });
    }

    el.continents.replaceChildren(
      ...[['all', 'すべて'], ...CONTINENTS.filter(([key]) => guides.some((g) => g.continent === key))].map(
        ([key, label]) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'filter';
          b.dataset.key = key;
          b.textContent = label;
          b.onclick = () => {
            this.continent = key;
            this.render();
          };
          return b;
        },
      ),
    );
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

    const byName = (a: Guide, b: Guide) => this.nameOf(a.id).localeCompare(this.nameOf(b.id), 'ja');
    const visible = this.guides
      .filter((g) => this.continent === 'all' || g.continent === this.continent)
      .filter((g) => this.matches(g.id));

    const sections: HTMLElement[] = [];
    const withoutBollards: Guide[] = [];
    let cards = 0;
    for (const [key, label] of CONTINENTS) {
      const guides = visible.filter((g) => g.continent === key).sort(byName);
      const countries: HTMLElement[] = [];
      for (const g of guides) {
        const entries = (this.entries.get(g.id) ?? []).filter((e) => this.showSimilar || e.kind === 'uses');
        if (!entries.length) {
          withoutBollards.push(g);
          continue;
        }
        // The country's own bollards first, then the ones it shares or resembles.
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

    if (withoutBollards.length) {
      const section = document.createElement('section');
      section.className = 'continent none';
      const h = document.createElement('h2');
      h.textContent = 'ボラードの情報がない国・地域';
      const note = document.createElement('p');
      note.textContent =
        'Plonk It のガイドにボラードの項目がない国・地域。ボラード自体が少ないか、決め手にならない国が多い。';
      const list = document.createElement('ul');
      list.className = 'plain-chips';
      list.append(
        ...withoutBollards.sort(byName).map((g) => {
          const li = document.createElement('li');
          li.textContent = this.nameOf(g.id);
          return li;
        }),
      );
      section.append(h, note, list);
      sections.push(section);
    }

    const countryCount = visible.length - withoutBollards.length;
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

  private renderCard(id: string, { q, kind }: Entry) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'card-button';
    b.onclick = () => this.open(q);

    const img = document.createElement('img');
    img.src = q.image;
    img.alt = `${this.nameOf(id)}のボラード`;
    img.loading = 'lazy';

    const caption = document.createElement('span');
    caption.className = 'caption';
    if (kind === 'similar') {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = '似ている';
      caption.append(badge, `${this.joinNames(q.required)}のボラード`);
    } else {
      // q.region describes where in q.country the bollard is found.
      if (q.country !== id) caption.append('共通のボラード');
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
    this.el.dialogTitle.textContent = `${this.joinNames(q.required)}のボラード`;
    this.el.dialogBody.replaceChildren(...renderBollardInfo(q, this.nameOf));
    this.el.dialog.showModal();
    this.el.dialogBody.scrollTop = 0;
  }
}

/** Sort key inside a country: own bollards, then shared ones, then similar ones. */
function rank(e: Entry, id: string) {
  if (e.kind === 'similar') return 2;
  return e.q.country === id ? 0 : 1;
}
