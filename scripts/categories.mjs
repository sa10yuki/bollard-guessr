// Quiz categories and how their candidate items are picked from Plonk It.
// Candidates are then reviewed by hand in data/curation/<category>.json.

const hasTag = (item, re) => item.tags.some((t) => re.test(t));

export const CATEGORIES = {
  bollard: {
    match: (item) => hasTag(item, /bollard/i),
  },
  pole: {
    match: (item) => hasTag(item, /\bpole/i),
  },
  sign: {
    // Sub-types the player can filter by. Key -> Japanese label.
    kinds: {
      chevron: 'シェブロン',
      stop: '一時停止',
      giveway: '譲れ・優先道路',
      pedestrian: '横断歩道・歩行者',
      speed: '速度制限',
      warning: '警戒標識',
      direction: '案内標識',
      route: '路線番号',
      street: '道路名・地名標識',
      back: '裏面・支柱',
      other: 'その他の標識',
    },
    // Plonk It tags only some sign items, so items that talk about signs are
    // candidates too. Items about the language on signs etc. are excluded in curation.
    match: (item) =>
      hasTag(item, /sign|chevron/i) || /\b(signs?|signposts?|chevrons?)\b/i.test(item.text.join(' ')),
  },
};
