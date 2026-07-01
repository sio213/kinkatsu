import type { Exercise } from '@/db/schema';
import { CATEGORY_ALL, CATEGORY_FAVORITE, CATEGORY_ORDER } from './constants';

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
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    list = list.filter((e) => e.name.toLowerCase().includes(q));
  }
  return [...list].sort((a, b) => {
    const ai = CATEGORY_ORDER[a.category] ?? 99;
    const bi = CATEGORY_ORDER[b.category] ?? 99;
    return ai !== bi ? ai - bi : a.name.localeCompare(b.name, 'ja');
  });
}
