import type { Exercise } from '@/db/schema';
import { CATEGORY_ALL, CATEGORY_FAVORITE, CATEGORY_ORDER } from './constants';
import { getReading } from './readings';
import { getAliases } from './aliases';
import { getGuide } from './guides';
import { getMuscleReadingText } from './muscle-readings';
import { isFuzzyMatch } from './fuzzy';

export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
    .toLowerCase();
}

// 種目名・読み仮名・別名を検索対象文字列として集める（あいまい検索でも共用する）
function nameSearchTexts(e: Exercise): string[] {
  const texts = [e.name];
  const reading = getReading(e);
  if (reading != null) texts.push(reading);
  for (const alias of getAliases(e)) {
    texts.push(alias.text);
    if (alias.reading != null) texts.push(alias.reading);
  }
  return texts;
}

function matchesExactly(e: Exercise, q: string): boolean {
  if (nameSearchTexts(e).some((t) => normalizeForSearch(t).includes(q))) return true;
  const guide = getGuide(e);
  if (guide == null) return false;
  if (normalizeForSearch(guide.muscle).includes(q)) return true;
  return normalizeForSearch(getMuscleReadingText(guide.muscle)).includes(q);
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
    const exactMatches = list.filter((e) => matchesExactly(e, q));
    // 完全一致が1件もないときだけ、タイプミスを許容するあいまい検索にフォールバックする
    list =
      exactMatches.length > 0
        ? exactMatches
        : list.filter((e) => nameSearchTexts(e).some((t) => isFuzzyMatch(q, normalizeForSearch(t))));
  }
  return [...list].sort((a, b) => {
    const ai = CATEGORY_ORDER[a.category] ?? 99;
    const bi = CATEGORY_ORDER[b.category] ?? 99;
    return ai !== bi ? ai - bi : a.name.localeCompare(b.name, 'ja');
  });
}
