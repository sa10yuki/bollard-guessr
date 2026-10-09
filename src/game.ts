export interface Question {
  id: string;
  country: string;
  image: string;
  /** Areas that must all be selected. */
  required: string[];
  /** Areas that may be selected without making the answer wrong. */
  optional: string[];
  region: string | null;
  /** Sub-type within the category (signs only). */
  kind?: string;
  ja: string;
  en: string;
  source: string;
}

export interface Verdict {
  correct: boolean;
  /** Required areas the player selected. */
  hit: string[];
  /** Required areas the player did not select. */
  missed: string[];
  /** Selected areas that are neither required nor optional. */
  wrong: string[];
  /** Optional areas, whether selected or not. */
  optional: string[];
}

export const SET_SIZE = 5;

export function judge(q: Question, selected: Set<string>): Verdict {
  const hit = q.required.filter((id) => selected.has(id));
  const missed = q.required.filter((id) => !selected.has(id));
  const allowed = new Set([...q.required, ...q.optional]);
  const wrong = [...selected].filter((id) => !allowed.has(id));
  return { correct: missed.length === 0 && wrong.length === 0, hit, missed, wrong, optional: q.optional };
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Picks a set of questions. Questions with the same answer (e.g. the Czech and
 * the Slovak photo of the same bollard) are kept out of the same set when possible.
 */
export function pickSet(pool: Question[], size = SET_SIZE): Question[] {
  const picked: Question[] = [];
  const seen = new Set<string>();
  const rest: Question[] = [];
  for (const q of shuffle(pool)) {
    const key = [...q.required].sort().join(',');
    if (seen.has(key)) rest.push(q);
    else {
      seen.add(key);
      picked.push(q);
    }
    if (picked.length === size) return picked;
  }
  return [...picked, ...rest].slice(0, size);
}

// --- review list (questions answered wrong), kept in localStorage per category ---

const reviewKey = (category: string) => `bollard-guessr:review:${category}`;

// Before categories existed, the bollard review list was stored without a suffix.
try {
  const legacy = localStorage.getItem('bollard-guessr:review');
  if (legacy !== null) {
    if (localStorage.getItem(reviewKey('bollard')) === null) localStorage.setItem(reviewKey('bollard'), legacy);
    localStorage.removeItem('bollard-guessr:review');
  }
} catch {
  // storage unavailable
}

export function loadReview(category: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(reviewKey(category)) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function updateReview(category: string, id: string, correct: boolean): void {
  const ids = new Set(loadReview(category));
  if (correct) ids.delete(id);
  else ids.add(id);
  try {
    localStorage.setItem(reviewKey(category), JSON.stringify([...ids]));
  } catch {
    // storage unavailable (private mode etc.): review just won't persist
  }
}
