import type { Question } from './game';

/** Hiragana -> katakana and lowercase, so "どいつ" and "ドイツ" both match. */
export function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/[\s・･·-]/g, '');
}

function externalLink(href: string, text: string, className?: string) {
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = text;
  if (className) a.className = className;
  return a;
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
        const url = m[3].startsWith('/') ? `https://www.plonkit.net${m[3]}` : m[3];
        if (/^https?:\/\//.test(url)) p.append(externalLink(url, m[2]));
        else p.append(m[2]);
      }
      last = m.index + m[0].length;
    }
    p.append(line.slice(last).replace(/\*\*/g, ''));
    return p;
  });
}

/**
 * The facts, explanation, original text, source link and license credit of a
 * quiz item. `extraFacts` are appended to the facts list (e.g. the player's mistakes).
 */
export function renderInfo(
  q: Question,
  nameOf: (id: string) => string,
  kinds: Record<string, string> | null,
  extraFacts: [string, string][] = [],
): Node[] {
  const names = (ids: string[]) => ids.map(nameOf).join('、');

  const facts = document.createElement('dl');
  facts.className = 'facts';
  const rows: [string, string][] = [];
  if (q.kind && kinds) rows.push(['種類', kinds[q.kind] ?? q.kind]);
  rows.push(['使われている国・地域', names(q.required)]);
  if (q.optional.length) rows.push(['似たものがある国（選んでもOK）', names(q.optional)]);
  if (q.region) rows.push(['見られる地域', q.region]);
  for (const [label, value] of [...rows, ...extraFacts]) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    facts.append(dt, dd);
  }

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

  const link = externalLink(q.source, `Plonk It の「${nameOf(q.country)}」ガイドを開く ↗`, 'source');

  const credit = document.createElement('p');
  credit.className = 'item-credit';
  credit.append(
    '画像・説明: Plonk It（',
    externalLink('https://creativecommons.org/licenses/by-nc-sa/4.0/deed.ja', 'CC BY-NC-SA 4.0'),
    '）。画像はトリミング、説明は翻訳・要約して使用。',
  );

  return [facts, explain, details, link, credit];
}
