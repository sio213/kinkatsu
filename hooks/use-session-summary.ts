import { db } from '@/db/client';
import { exercises, sets, workoutSessions } from '@/db/schema';
import { computeSessionTotal, type SessionTotal } from '@/lib/workout/session-total';
import { startOfWeek } from '@/lib/workout/summary';
import { and, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

/**
 * 完了サマリーの主役数値（総重量／合計回数／合計時間／合計距離）。
 *
 * 集計をSQLに寄せず全行を引いてJS側でまとめているのは、どの計測タイプで出すかが
 * 「重量を足せる種目が実際にあったか」に依存し、CASE式1本では表現しきれないため。
 * 1セッションのセットは多くても数十行なので引き上げのコストは無視できる
 */
export function useSessionTotal(sessionId: number): { total: SessionTotal | null | undefined } {
  const { data, updatedAt, error } = useLiveQuery(
    db
      .select({
        measurementType: exercises.measurementType,
        pairedWeights: exercises.pairedWeights,
        weight: sets.weight,
        reps: sets.reps,
        durationSeconds: sets.durationSeconds,
        distanceMeters: sets.distanceMeters,
      })
      .from(sets)
      .innerJoin(exercises, eq(sets.exerciseId, exercises.id))
      // ✓未確定のセットは記録として成立していないため主役数値にも入れない
      // （記録タブのセッションカード・カレンダーの集計と同じ基準）
      .where(and(eq(sets.sessionId, sessionId), isNotNull(sets.completedAt))),
    [sessionId],
  );

  if (error) console.error('[session total]', error);

  const rows = useMemo(() => data ?? [], [data]);
  const total = useMemo(() => computeSessionTotal(rows), [rows]);

  // dataの初期値は[]なので、解決前は「確定セット0件」と見分けが付かない。未解決のまま
  // 「値なし」を描くと、開くたびに一瞬「—」が出てから実際の総重量に切り替わる。
  // undefined（未解決）とnull（解決済みだが合計が立たない）を呼び出し側に描き分けさせる
  const loaded = updatedAt !== undefined || error !== undefined;

  return { total: loaded ? total : undefined };
}

/**
 * そのセッションが「今週N回目」か。週の始まりは月曜（lib/workout/summary.tsのstartOfWeek）。
 *
 * 週の合計ではなく序数として数える（自分より後に始まったセッションは含めない）。今まさに
 * 終えたセッションでは両者は一致するが、過去の記録からサマリーを開く将来のPhaseでは
 * 「そのとき何回目だったか」が読みたい値になるため。
 *
 * 未解決の間はundefinedを返す。startedAtは画面がセッションを読み終えてから初めて確定するため、
 * それまでは weekStart=0 で張ったクエリの結果（0件）しか無く、そのまま数値として描くと
 * 「今週 0回目」——終了直後にはありえない値——が必ず一瞬見えてしまう
 */
export function useSessionWeekOrdinal(startedAt: number | null): number | undefined {
  const weekStart = startedAt == null ? 0 : startOfWeek(startedAt);
  const { data, updatedAt, error } = useLiveQuery(
    db
      .select({ count: sql<number>`count(*)` })
      .from(workoutSessions)
      .where(
        and(
          // 進行中のセッションは「実施した回数」に数えない
          isNotNull(workoutSessions.endedAt),
          gte(workoutSessions.startedAt, weekStart),
          lte(workoutSessions.startedAt, startedAt ?? 0),
        ),
      ),
    [weekStart, startedAt],
  );

  if (error) console.error('[session week ordinal]', error);

  // startedAtが未確定のうちは、クエリが解決していても「自分より前の週」を数えた結果でしかない
  if (startedAt == null) return undefined;
  const loaded = updatedAt !== undefined || error !== undefined;
  return loaded ? (data?.[0]?.count ?? 0) : undefined;
}
