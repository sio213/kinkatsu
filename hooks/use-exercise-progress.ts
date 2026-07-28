import { db } from '@/db/client';
import { sets, workoutSessionExercises, workoutSessions } from '@/db/schema';
import type { MeasurementType } from '@/lib/exercises/constants';
import { buildProgressSeries, type ProgressSeries } from '@/lib/exercises/progress';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

/**
 * 種目詳細「記録」タブの重量グラフ用の系列を取得する。
 *
 * 進行中セッションのカードも除外しない——✓を押した時点で保存済みの記録であり、確定した記録と
 * 同じ見た目で描くのが仕様（デザイン案「進行中セッション」）。getExerciseHistoryEntries
 * （「過去の記録から読み込み」画面）は進行中セッションを除外するので、そちらとは条件が違う。
 *
 * ✓未確定のセットも引く。グラフの値・自己ベストには使わない（後で外されると点が下がって
 * 「減った」ように見えるため）が、内訳カードでは「未実施」として並べる必要があるため。
 * 値に使うかどうかの絞り込みは buildProgressSeries 側で行う。
 *
 * 1種目あたりの行数は「週4回×5年×3セット」でも数千行に収まる規模なので、SQL側で
 * 日ごとに集計せず全行を引いてJS側（buildProgressSeries）でまとめている。集計をSQLに
 * 寄せると内訳カードが必要とするセット単位の生データを別途引き直すことになり、
 * クエリが2本に増えるだけで得が無い。
 */
export function useExerciseProgress(
  exerciseId: number,
  measurementType: MeasurementType,
): { series: ProgressSeries; loaded: boolean; failed: boolean } {
  const { data, updatedAt, error } = useLiveQuery(
    db
      .select({
        sessionId: workoutSessions.id,
        workoutSessionExerciseId: sets.workoutSessionExerciseId,
        startedAt: workoutSessions.startedAt,
        setNumber: sets.setNumber,
        weight: sets.weight,
        reps: sets.reps,
        durationSeconds: sets.durationSeconds,
        distanceMeters: sets.distanceMeters,
        completedAt: sets.completedAt,
      })
      .from(sets)
      .innerJoin(workoutSessionExercises, eq(sets.workoutSessionExerciseId, workoutSessionExercises.id))
      .innerJoin(workoutSessions, eq(workoutSessionExercises.sessionId, workoutSessions.id))
      .where(eq(sets.exerciseId, exerciseId))
      // buildProgressSeriesが「同じ日の最初のセッションの開始時刻」を先勝ちで拾うため、
      // 開始時刻の昇順であることが前提になる
      .orderBy(workoutSessions.startedAt, workoutSessionExercises.id, sets.setNumber),
    [exerciseId],
  );

  if (error) console.error('[exercise progress]', error);

  const series = useMemo(
    () => buildProgressSeries(measurementType, data ?? []),
    [measurementType, data],
  );

  return {
    series,
    // useLiveQueryのdataは解決前から[]で、undefinedにはならない。`data !== undefined`だと
    // 常に読み込み完了扱いになり、記録があるのに一瞬「0件」の空状態が描かれてしまう。
    // 最初の解決時にだけ入るupdatedAtで判定する（use-exercise-record-count.tsと同じ理由）
    loaded: updatedAt !== undefined || error !== undefined,
    // 「取得に失敗した」と「記録が0件」は見せ方が違う（前者は空状態を出してはいけない）ため、
    // 呼び出し側が区別できるよう分けて返す
    failed: error !== undefined,
  };
}
