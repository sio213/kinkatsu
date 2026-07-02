import type { Exercise } from '@/db/schema';
import { CATEGORY_ALL, CATEGORY_FAVORITE, CATEGORY_ORDER } from './constants';

export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
    .toLowerCase();
}

export function filterExercises(
  exercises: Exercise[],
  activeCategory: string,
  search: string,
): Exercise[] {
  let list = exercises;
  if (activeCategory === CATEGORY_FAVORITE) {
    list = list.filter((e) => e.favorite);
  } else if (activeCategory !== CATEGORY_ALL) {
    list = list.filter((e) => e.category === activeCategory);
  }
  const trimmedSearch = search.trim();
  if (trimmedSearch) {
    const q = normalizeForSearch(trimmedSearch);
    list = list.filter((e) => normalizeForSearch(e.name).includes(q));
  }
  return [...list].sort((a, b) => {
    const ai = CATEGORY_ORDER[a.category] ?? 99;
    const bi = CATEGORY_ORDER[b.category] ?? 99;
    return ai !== bi ? ai - bi : a.name.localeCompare(b.name, 'ja');
  });
}
