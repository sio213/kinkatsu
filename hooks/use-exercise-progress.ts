import { db } from '@/db/client';
import { sets, workoutSessionExercises, workoutSessions } from '@/db/schema';
import type { MeasurementType } from '@/lib/exercises/constants';
import {
  availableProgressMetrics,
  buildProgressSeries,
  buildRecordDays,
  resolveChartMeasurementType,
  type ProgressMetric,
  type ProgressPoint,
  type ProgressSeries,
} from '@/lib/exercises/progress';
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
  /** グラフに出す指標。省略時はその日の最強セット（Phase 1 と同じ系列） */
  metric: ProgressMetric = 'best',
  /**
   * 器具を同時に2つ扱う種目か（exercises.pairedWeights）。総重量だけが左右2つ分になる。
   * 最大重量・推定1RMは片方の重量のままなので、bestSeries には効かない
   */
  pairedWeights = false,
): {
  /** 選択中の指標の系列。グラフと点の選択はこちらを使う */
  series: ProgressSeries;
  /**
   * 最大○○（ベスト）指標の系列。**空状態・履歴一覧・自己ベストの判定はこちらを使うこと。**
   * 点を落とす条件は指標ごとに違い（推定1RMは13回以上のセットしか無い日も落ちる）、選択中の
   * 指標の系列で「記録が0件か」を判定すると、記録があるのに空状態が出てしまう
   */
  bestSeries: ProgressSeries;
  /**
   * 過去の記録一覧・「すべての記録」画面に並べる日。**系列と違い、値が置けない日も落とさない。**
   * 加重種目を加重なしでやった日はグラフに点を置けないが、やった事実は一覧に残す
   */
  recordDays: ProgressPoint[];
  /**
   * グラフ上でこの種目を何の計測タイプとして扱っているか。指標チップの文言もこれで決まる。
   * 重量を1度も記録していない加重種目は 'reps' が返る（resolveChartMeasurementType 参照）
   */
  chartMeasurementType: MeasurementType;
  /**
   * 実際に描いている指標。呼び出し側が渡した metric が、記録の変化で選べなくなった場合
   * （推定1RMを選んだまま最後の重量を消すと種目が reps 扱いになる）に左端へ戻したもの。
   * チップの選択状態・ハイライトの種類・内訳カードの値行はこちらを見ること
   */
  metric: ProgressMetric;
  loaded: boolean;
  failed: boolean;
} {
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

  // `?? []` をそのまま置くと、dataが未解決の間は毎レンダーで新しい配列になり、下の3つの
  // useMemoが毎回作り直される（系列の再計算はグラフ全体の再レイアウトを伴うので効く）
  const rows = useMemo(() => data ?? [], [data]);

  // 重量を1度も記録していない加重種目は reps 種目として描く。判定は種目単位で1回だけ行い、
  // 系列にも指標チップにも同じ値を配る（画面の中で扱いが割れないようにするため）
  const chartMeasurementType = useMemo(
    () => resolveChartMeasurementType(measurementType, rows),
    [measurementType, rows],
  );

  // 選べない指標が選ばれたまま残らないようにする。stateを書き換えるのではなく派生値にするのは、
  // 記録が戻れば元の指標に復帰させたいのと、書き戻すと再レンダーが1往復増えるため
  const effectiveMetric = useMemo(
    () => (availableProgressMetrics(chartMeasurementType).includes(metric) ? metric : 'best'),
    [chartMeasurementType, metric],
  );

  const recordDays = useMemo(
    () => buildRecordDays(chartMeasurementType, rows),
    [chartMeasurementType, rows],
  );

  const bestSeries = useMemo(
    () => buildProgressSeries(chartMeasurementType, rows, 'best'),
    [chartMeasurementType, rows],
  );
  const series = useMemo(
    () =>
      effectiveMetric === 'best'
        ? bestSeries
        : buildProgressSeries(chartMeasurementType, rows, effectiveMetric, pairedWeights),
    [effectiveMetric, bestSeries, chartMeasurementType, rows, pairedWeights],
  );

  return {
    series,
    bestSeries,
    recordDays,
    chartMeasurementType,
    metric: effectiveMetric,
    // useLiveQueryのdataは解決前から[]で、undefinedにはならない。`data !== undefined`だと
    // 常に読み込み完了扱いになり、記録があるのに一瞬「0件」の空状態が描かれてしまう。
    // 最初の解決時にだけ入るupdatedAtで判定する（use-exercise-record-count.tsと同じ理由）
    loaded: updatedAt !== undefined || error !== undefined,
    // 「取得に失敗した」と「記録が0件」は見せ方が違う（前者は空状態を出してはいけない）ため、
    // 呼び出し側が区別できるよう分けて返す
    failed: error !== undefined,
  };
}
