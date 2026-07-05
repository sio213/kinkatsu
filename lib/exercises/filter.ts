import type { Exercise } from '@/db/schema';
import {
  CATEGORY_ALL,
  CATEGORY_FAVORITE,
  CATEGORY_ORDER,
  getCategoryLabel,
  getCategoryLabelReading,
} from './constants';
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

type SearchIndex = {
  // 完全一致検索の対象（名前・読み・別名・カテゴリ・カテゴリ読み・使う筋肉・筋肉読み）。あらかじめ正規化済み。
  exactTexts: string[];
  // あいまい検索（タイプミス許容）の対象。カテゴリ名・筋肉名は短すぎたり範囲が広すぎたりして
  // 誤爆しやすいため、種目名・読み・別名のみに限定する。
  fuzzyTexts: string[];
};

// 種目ごとの検索対象テキストは種目データが変わらない限り不変なので、打鍵のたびに
// 正規化し直さないようキャッシュする（id + updatedAt をキーにし、編集されたら再計算する）
const searchIndexCache = new Map<string, SearchIndex>();

function buildSearchIndex(e: Exercise): SearchIndex {
  const nameTexts = [e.name];
  const reading = getReading(e);
  if (reading != null) nameTexts.push(reading);
  for (const alias of getAliases(e)) {
    nameTexts.push(alias.text);
    if (alias.reading != null) nameTexts.push(alias.reading);
  }
  const normalizedNames = nameTexts.map(normalizeForSearch);

  const exactTexts = [...normalizedNames];
  exactTexts.push(normalizeForSearch(getCategoryLabel(e.category)));
  const categoryReading = getCategoryLabelReading(e.category);
  if (categoryReading != null) exactTexts.push(normalizeForSearch(categoryReading));
  const guide = getGuide(e);
  if (guide != null) {
    exactTexts.push(normalizeForSearch(guide.muscle));
    exactTexts.push(normalizeForSearch(getMuscleReadingText(guide.muscle)));
  }

  return { exactTexts, fuzzyTexts: normalizedNames };
}

function searchIndexCacheKey(e: Exercise): string {
  return `${e.id}:${e.updatedAt ?? 0}`;
}

function getSearchIndex(e: Exercise): SearchIndex {
  const key = searchIndexCacheKey(e);
  const cached = searchIndexCache.get(key);
  if (cached != null) return cached;
  const index = buildSearchIndex(e);
  searchIndexCache.set(key, index);
  return index;
}

// お気に入りトグルや編集のたびにupdatedAtが変わり古いキーが残骸として残るため、
// 呼び出しのたびに「今存在する種目」に無いキーを間引く。キャッシュサイズは常に
// 現在の種目数以下に保たれ、無制限に肥大化しない。
function pruneSearchIndexCache(exercises: Exercise[]): void {
  const validKeys = new Set(exercises.map(searchIndexCacheKey));
  for (const key of searchIndexCache.keys()) {
    if (!validKeys.has(key)) searchIndexCache.delete(key);
  }
}

// テスト専用: キャッシュはid+updatedAtキーなので、テストフィクスチャでidを使い回すと
// 別のテストの結果が混入しうる。テストのbeforeEachで呼び、都度クリアする。
export function __resetSearchIndexCacheForTests(): void {
  searchIndexCache.clear();
}

// テスト専用: pruneSearchIndexCacheが古いキーを実際に間引いていることを検証するため
export function __getSearchIndexCacheSizeForTests(): number {
  return searchIndexCache.size;
}

// トークンの全て（AND）が、texts中のいずれか（OR）に部分一致すればtrue。
// 各トークンは別々のテキストにマッチしてもよい（例: 「ブルガリアン」は名前、「脚」はカテゴリラベル）。
function matchesAllTokens(tokens: string[], texts: string[], matches: (token: string, text: string) => boolean): boolean {
  return tokens.every((token) => texts.some((text) => matches(token, text)));
}

export function filterExercises(
  exercises: Exercise[],
  activeCategory: string,
  search: string,
): Exercise[] {
  pruneSearchIndexCache(exercises);
  let list = exercises;
  if (activeCategory === CATEGORY_FAVORITE) {
    list = list.filter((e) => e.favorite);
  } else if (activeCategory !== CATEGORY_ALL) {
    list = list.filter((e) => e.category === activeCategory);
  }
  const trimmedSearch = search.trim();
  if (trimmedSearch) {
    // スペース区切りでAND検索する（例:「ブルガリアン スクワット」）。各語は名前・カテゴリ・
    // muscle等どのテキストに一致してもよく、語順も問わない（それぞれ独立にincludes判定するため）
    const tokens = normalizeForSearch(trimmedSearch).split(/\s+/).filter((t) => t.length > 0);
    const exactMatches = list.filter((e) =>
      matchesAllTokens(tokens, getSearchIndex(e).exactTexts, (token, t) => t.includes(token)),
    );
    // 完全一致が1件もないときだけ、タイプミスを許容するあいまい検索にフォールバックする。
    // 複数語のときは語ごとに独立してfuzzy判定するため、実質的にほぼ効かない
    // （タイプミス吸収は基本的に単語1語のクエリを想定した機能のため許容する）
    list =
      exactMatches.length > 0
        ? exactMatches
        : list.filter((e) =>
            matchesAllTokens(tokens, getSearchIndex(e).fuzzyTexts, (token, t) => isFuzzyMatch(token, t)),
          );
  }
  return [...list].sort((a, b) => {
    const ai = CATEGORY_ORDER[a.category] ?? 99;
    const bi = CATEGORY_ORDER[b.category] ?? 99;
    return ai !== bi ? ai - bi : a.name.localeCompare(b.name, 'ja');
  });
}
