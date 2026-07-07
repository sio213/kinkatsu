// 表示順は「胸/背中→肩→腕→脚→お尻→体幹/腹筋→有酸素→その他」。
// プッシュ/プルの代表格である胸・背中を先頭に並べ、肩・腕（アイソレーション系）、
// 下半身（脚→お尻）、コア系（体幹・腹筋は隣接）、最後に有酸素・その他という
// 実際のトレーニング分割の感覚に合わせた並び（2026-07-07 要件定義で決定）
export const EXERCISE_CATEGORIES = [
  'chest',
  'back',
  'shoulder',
  'arm',
  'leg',
  'glute',
  'core',
  'abs',
  'cardio',
  'other',
] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

// カテゴリの表示ラベル（将来の多言語対応時はロケールごとのリソースに置き換える）
export const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  chest: '胸',
  shoulder: '肩',
  arm: '腕',
  back: '背中',
  core: '体幹',
  abs: '腹筋',
  leg: '脚',
  glute: 'お尻',
  cardio: '有酸素',
  other: 'その他',
};

export function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category as ExerciseCategory] ?? category;
}

// カテゴリラベルはすべて漢字を含むため、ひらがな入力でも検索できるよう読み仮名を持たせる
// （種目名の readings.ts と同じ理由。normalizeForSearch のひらがな→カタカナ変換だけでは
// 漢字は変換されないため、素の読み仮名を別途持つ必要がある）
const CATEGORY_LABEL_READINGS: Record<ExerciseCategory, string> = {
  chest: 'むね',
  shoulder: 'かた',
  arm: 'うで',
  back: 'せなか',
  core: 'たいかん',
  abs: 'ふっきん',
  leg: 'あし',
  glute: 'おしり',
  cardio: 'ゆうさんそ',
  other: 'そのた',
};

export function getCategoryLabelReading(category: string): string | undefined {
  return CATEGORY_LABEL_READINGS[category as ExerciseCategory];
}

export const CATEGORY_ALL = '全て' as const;
export const CATEGORY_FAVORITE = '★' as const;

// 検索画面・種目追加ピッカーで共通のカテゴリチップ絞り込み一覧
export const CATEGORY_FILTER_LIST = [
  CATEGORY_ALL,
  CATEGORY_FAVORITE,
  ...EXERCISE_CATEGORIES,
] as const;

export const CATEGORY_ORDER: Record<string, number> = Object.fromEntries(
  EXERCISE_CATEGORIES.map((c, i) => [c, i]),
);

export function isPresetExercise(exercise: { source: string }): boolean {
  return exercise.source === 'preset';
}

// 種目一覧の並び替え軸。'category' が既存の挙動（デフォルト）
export const EXERCISE_SORT_OPTIONS = ['category', 'name', 'frequent', 'recent'] as const;
export type ExerciseSortBy = (typeof EXERCISE_SORT_OPTIONS)[number];

export const EXERCISE_SORT_LABELS: Record<ExerciseSortBy, string> = {
  name: '名前順（50音）',
  category: 'カテゴリ順',
  frequent: 'よく使う順',
  recent: '最近使った順',
};

// 種目の計測方法。sets テーブルでどの列を使うかを決める
export const MEASUREMENT_TYPES = [
  'weight_reps',
  'reps',
  'time',
  'distance_time',
  'weight_time',
] as const;
export type MeasurementType = (typeof MEASUREMENT_TYPES)[number];
