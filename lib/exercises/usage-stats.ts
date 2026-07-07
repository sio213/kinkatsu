// 種目の使用実績（並び替えの「よく使う順」「最近使った順」で使う）の型・定数。
// 実データの集計はhooks/use-exercise-usage-stats.tsが担う（DBアクセスをlib層に持ち込まないため）
export type ExerciseUsageStats = {
  // 直近4週間にセッションへ追加された回数
  recentUsageCount: number;
  // セッションへ最後に追加された日時。一度も使われていなければnull
  lastUsedAt: number | null;
};

export const RECENT_USAGE_WINDOW_MS = 28 * 24 * 60 * 60 * 1000;
