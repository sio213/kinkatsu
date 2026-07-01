export const EXERCISE_CATEGORIES = ['胸', '肩', '腕', '体幹', '背中', '脚', '有酸素'] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

export const CATEGORY_ALL = '全て' as const;
export const CATEGORY_FAVORITE = '★' as const;

export const CATEGORY_ORDER: Record<string, number> = Object.fromEntries(
  EXERCISE_CATEGORIES.map((c, i) => [c, i]),
);
