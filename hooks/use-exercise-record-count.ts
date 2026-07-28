import { db } from '@/db/client';
import { sets } from '@/db/schema';
import { and, countDistinct, eq, isNotNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

/**
 * その種目の「記録の件数」。✓確定（completedAt が入っている）セットを1件以上持つカード
 * （workoutSessionExercises）の数を数える。種目詳細の初期タブ判定（0件なら解説タブ、
 * 1件以上なら記録タブ）と、記録タブの「過去の記録 全N件」で共通に使う定義。
 *
 * 進行中セッション（endedAt が null）のカードもそのまま含める。仕様上、進行中でも✓を押した
 * セットは確定した記録と同じ扱いでグラフ・一覧・件数に載せるため、getExerciseHistoryEntries
 * （読み込み画面用。進行中セッションを除外する）とは意図的に条件が違う。
 *
 * ✓が1件も無いカード（種目を追加しただけ・入力途中で離脱）を数えないよう、カード側ではなく
 * sets 側から数えている（sets.exerciseId には byExercise インデックスがある）。
 */
export function useExerciseRecordCount(exerciseId: number): { count: number; loaded: boolean } {
  const { data } = useLiveQuery(
    db
      .select({ count: countDistinct(sets.workoutSessionExerciseId) })
      .from(sets)
      .where(and(eq(sets.exerciseId, exerciseId), isNotNull(sets.completedAt))),
    [exerciseId],
  );

  return { count: data?.[0]?.count ?? 0, loaded: data !== undefined };
}
