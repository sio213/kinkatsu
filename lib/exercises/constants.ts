export const EXERCISE_CATEGORIES = [
  'chest',
  'shoulder',
  'arm',
  'back',
  'core',
  'abs',
  'leg',
  'glute',
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

export const CATEGORY_ALL = '全て' as const;
export const CATEGORY_FAVORITE = '★' as const;

export const CATEGORY_ORDER: Record<string, number> = Object.fromEntries(
  EXERCISE_CATEGORIES.map((c, i) => [c, i]),
);

export function isPresetExercise(exercise: { source: string }): boolean {
  return exercise.source === 'preset';
}
