import type { Question } from './game';

export type CategoryId = 'bollard' | 'pole' | 'sign';

/** A Plonk It country guide. */
export interface Guide {
  id: string;
  continent: string;
}

/** Contents of public/data/<category>.json. */
export interface CategoryData {
  /** Sub-types (signs only): key -> Japanese label. */
  kinds: Record<string, string> | null;
  /** Items still waiting for image review (more questions are coming). */
  pending?: number;
  guides: Guide[];
  questions: Question[];
}

export interface Category {
  id: CategoryId;
  /** Japanese name, used in sentences like 「この◯◯が使われている国」. */
  name: string;
  description: string;
  icon: string;
}

export const CATEGORIES: Category[] = [
  { id: 'bollard', name: 'ボラード', description: '道路脇に立つ反射ポール', icon: '🚧' },
  { id: 'pole', name: '電柱', description: '電柱・街灯の柱のかたちや印', icon: '⚡' },
  { id: 'sign', name: '標識', description: 'シェブロン・一時停止・案内標識など', icon: '🛑' },
];
