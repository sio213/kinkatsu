import { db } from '@/db/client';
import { sets } from '@/db/schema';
import { and, countDistinct, eq, isNotNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

/**
 * その種目に記録が1件でもあるか（＝種目詳細の初期タブを記録／解説どちらにするか）を判定するための件数。
 * ✓確定（completedAt が入っている）セットを1件以上持つカード（workoutSessionExercises）を数える。
 *
 * 進行中セッション（endedAt が null）のカードもそのまま含める。仕様上、進行中でも✓を押した
 * セットは確定した記録と同じ扱いでグラフ・一覧・件数に載せるため、getExerciseHistoryEntries
 * （読み込み画面用。進行中セッションを除外する）とは意図的に条件が違う。
 *
 * ✓が1件も無いカード（種目を追加しただけ・入力途中で離脱）を数えないよう、カード側ではなく
 * sets 側から数えている（sets.exerciseId には byExercise インデックスがある）。
 *
 * グラフに出す「全N件」は日単位（useExerciseProgress の系列の点数）なので、同じ日に同じ種目を
 * 2カードに分けて記録した場合はこのカード単位の件数と一致しない。ただし「0件かどうか」は
 * どちらの数え方でも必ず一致するため、初期タブの決定にはこの軽いクエリで足りる。
 */
export function useExerciseRecordCount(exerciseId: number): { count: number; loaded: boolean } {
  const { data, updatedAt, error } = useLiveQuery(
    db
      .select({ count: countDistinct(sets.workoutSessionExerciseId) })
      .from(sets)
      .where(and(eq(sets.exerciseId, exerciseId), isNotNull(sets.completedAt))),
    [exerciseId],
  );

  if (error) console.error('[exercise record count]', error);

  return {
    count: data?.[0]?.count ?? 0,
    // useLiveQueryのdataは解決前から[]で、undefinedにはならない。`data !== undefined`で
    // 判定すると常に読み込み完了扱いになり、実際には記録があるのに0件と見なして解説タブに
    // 固定されてしまう（実機で再現済み）。最初の解決時にだけ入るupdatedAtで判定すること。
    // 取得に失敗したときは「タブが決まらず画面が真っ白のまま」になるのを避けるため完了扱いにし、
    // 0件＝解説タブへフォールバックさせる
    loaded: updatedAt !== undefined || error !== undefined,
  };
}
