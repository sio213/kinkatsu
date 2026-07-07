import { db } from '@/db/client';
import { workoutSessionExercises, workoutSessions } from '@/db/schema';
import type { ExerciseUsageStats } from '@/lib/exercises/usage-stats';
import { RECENT_USAGE_WINDOW_MS } from '@/lib/exercises/usage-stats';
import { eq, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

// 種目一覧の並び替え（よく使う順・最近使った順）用に、種目ごとの使用実績を集計する。
// sets単位ではなくworkoutSessionExercises単位で数えるのは、セットを1件も入力していない
// （カードを追加しただけの）種目も「使った」とみなすため。1セッション内に同じ種目を
// 複数カード追加した場合（ウォームアップ/本番等）はその都度加算する仕様（＝セッション数ではなく
// カード追加回数）。また終了していないセッション（endedAt null）のカードも実績に含める。
// 「過去の記録から読み込む」機能（getExerciseHistoryEntries）が確定記録に限定しているのとは
// 目的が異なり、こちらは「種目を使う頻度・直近使ったか」という一覧の並び替え軸のため
export function useExerciseUsageStats(): Map<number, ExerciseUsageStats> {
  // 呼び出しのたびにDate.now()がずれてSQLパラメータが変わり、useLiveQueryが
  // 無駄に再購読されないよう、マウント中は同じ起点を使い回す
  const since = useMemo(() => Date.now() - RECENT_USAGE_WINDOW_MS, []);

  const { data } = useLiveQuery(
    db
      .select({
        exerciseId: workoutSessionExercises.exerciseId,
        recentUsageCount: sql<number>`sum(case when ${workoutSessions.startedAt} >= ${since} then 1 else 0 end)`,
        lastUsedAt: sql<number | null>`max(${workoutSessions.startedAt})`,
      })
      .from(workoutSessionExercises)
      .innerJoin(workoutSessions, eq(workoutSessionExercises.sessionId, workoutSessions.id))
      .groupBy(workoutSessionExercises.exerciseId),
  );

  return useMemo(
    () =>
      new Map(
        (data ?? []).map((row) => [
          row.exerciseId,
          { recentUsageCount: row.recentUsageCount, lastUsedAt: row.lastUsedAt },
        ]),
      ),
    [data],
  );
}
