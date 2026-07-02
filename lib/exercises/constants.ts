export const EXERCISE_CATEGORIES = [
  '胸',
  '肩',
  '腕',
  '背中',
  '体幹',
  '腹筋',
  '脚',
  'お尻',
  '有酸素',
  'その他',
] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

export const CATEGORY_ALL = '全て' as const;
export const CATEGORY_FAVORITE = '★' as const;

export const CATEGORY_ORDER: Record<string, number> = Object.fromEntries(
  EXERCISE_CATEGORIES.map((c, i) => [c, i]),
);

export function isPresetExercise(exercise: { source: string }): boolean {
  return exercise.source === 'preset';
}
