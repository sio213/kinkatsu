import { db } from '@/db/client';
import { exercises, sets, workoutSessionExercises, workoutSessions } from '@/db/schema';
import { aggregateDailyPrimaryCategory, type DailyCategoryRow } from '@/lib/calendar/day-category';
import { toDateKey } from '@/lib/calendar/date-grid';
import { and, asc, eq, gte, isNotNull, lt } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

// カレンダーの日別マーカー用。[startMs, endMs)の範囲に開始した実績（✓確定セットを持つ完了済み
// セッション）を日付ごとに集計し、代表カテゴリ（lib/calendar/day-category.ts参照）のMapを返す。
// startMs/endMsは表示中の月グリッド（前月/当月/翌月をまたぐ場合はそれを含む範囲）をカバーする
// 呼び出し側の責務とする。sets単位でJOINし、完了済みセット1件につき1行取得することで
// 「セット数が最も多いカテゴリ」の集計にそのまま使える形にしている
export function useCalendarMonthRecords(startMs: number, endMs: number): Map<string, string> {
  const { data } = useLiveQuery(
    db
      .select({
        startedAt: workoutSessions.startedAt,
        category: exercises.category,
      })
      .from(sets)
      .innerJoin(workoutSessionExercises, eq(sets.workoutSessionExerciseId, workoutSessionExercises.id))
      .innerJoin(workoutSessions, eq(workoutSessionExercises.sessionId, workoutSessions.id))
      .innerJoin(exercises, eq(workoutSessionExercises.exerciseId, exercises.id))
      .where(
        and(
          gte(workoutSessions.startedAt, startMs),
          lt(workoutSessions.startedAt, endMs),
          isNotNull(workoutSessions.endedAt),
          isNotNull(sets.completedAt),
        ),
      )
      // 集計側(aggregateDailyPrimaryCategory)が「先頭に見つかった行=先にやった種目」という
      // 前提を置いているため、セッション開始時刻→カード追加順で必ず安定ソートする。
      // 同一ミリ秒に開始したセッションが複数あるケース（lib/workout/history.tsの
      // getPastTrainingSessionsと同じ懸念）に備え、セッションidも最終タイブレークに加えて
      // 常に決定的な順序にする（orderIndexはソートにのみ使うためselect projectionには含めない）
      .orderBy(asc(workoutSessions.startedAt), asc(workoutSessions.id), asc(workoutSessionExercises.orderIndex)),
  );

  return useMemo(() => {
    const rows: DailyCategoryRow[] = (data ?? []).map((r) => ({
      dateKey: toDateKey(new Date(r.startedAt)),
      category: r.category,
    }));
    return aggregateDailyPrimaryCategory(rows);
  }, [data]);
}
