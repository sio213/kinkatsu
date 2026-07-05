import type { Exercise } from '@/db/schema';
import { CATEGORY_ALL, CATEGORY_FAVORITE, CATEGORY_ORDER } from './constants';
import { getReading } from './readings';
import { getAliases } from './aliases';
import { getGuide } from './guides';
import { getMuscleReadingText } from './muscle-readings';

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
    list = list.filter((e) => {
      if (normalizeForSearch(e.name).includes(q)) return true;
      const reading = getReading(e);
      if (reading != null && normalizeForSearch(reading).includes(q)) return true;
      if (
        getAliases(e).some((alias) => {
          if (normalizeForSearch(alias.text).includes(q)) return true;
          return alias.reading != null && normalizeForSearch(alias.reading).includes(q);
        })
      ) {
        return true;
      }
      const guide = getGuide(e);
      if (guide == null) return false;
      if (normalizeForSearch(guide.muscle).includes(q)) return true;
      return normalizeForSearch(getMuscleReadingText(guide.muscle)).includes(q);
    });
  }
  return [...list].sort((a, b) => {
    const ai = CATEGORY_ORDER[a.category] ?? 99;
    const bi = CATEGORY_ORDER[b.category] ?? 99;
    return ai !== bi ? ai - bi : a.name.localeCompare(b.name, 'ja');
  });
}
