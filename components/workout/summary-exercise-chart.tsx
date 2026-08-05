import { ExerciseProgressChart } from '@/components/exercises/exercise-progress-chart';
import { PeriodFilterChips } from '@/components/exercises/period-filter-chips';
import { SummaryChartDots } from '@/components/workout/summary-chart-dots';
import { SummaryExerciseNav } from '@/components/workout/summary-exercise-nav';
import { Colors, Typography } from '@/constants/theme';
import { useExerciseProgress } from '@/hooks/use-exercise-progress';
import { resolveMeasurementType } from '@/lib/exercises/constants';
import type { SummaryChartExercise } from '@/lib/workout/chart-exercises';
import {
  DEFAULT_PROGRESS_PERIOD,
  filterProgressPoints,
  findLeadIn,
  findPersonalBest,
  type ProgressPeriod,
} from '@/lib/exercises/progress';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

/**
 * 種目を送るスワイプの発火幅。グラフ本体のPan（点の選択）が8pxで有効化されるため、
 * それより十分大きく取って内側を優先させる。グラフの外（種目名の行・期間チップ・ドット・
 * ブロックの余白）で始めたスワイプだけがここに届く
 */
const SWIPE_ACTIVATE_X = 24;
/** 種目を送ると判断する移動量。誤爆を避けつつ、指を大きく動かさなくても切り替わる程度 */
const SWIPE_THRESHOLD = 40;

/**
 * 1種目分のグラフ。**必ず `key={exerciseId}` を付けて呼ぶこと。**
 *
 * useLiveQuery（useExerciseProgressの中身）は deps が変わっても前回の data と updatedAt を
 * 保持したまま新しいクエリを非同期に解決する。そのため種目を切り替えても loaded は true の
 * ままで、解決までの間ずっと**前の種目の系列がそのまま描かれる**。keyでマウントし直せば
 * フックの状態ごとリセットされ、必ず「読み込み中」を経由する。
 * 選択中の点（selectedDateKey）が種目をまたいで残る問題も同時に消える
 */
function ExerciseChart({
  exercise,
  period,
}: {
  exercise: SummaryChartExercise;
  period: ProgressPeriod;
}) {
  const { series, recordDays, loaded, failed } = useExerciseProgress(
    exercise.exerciseId,
    resolveMeasurementType(exercise.measurementType),
    'best',
    exercise.pairedWeights,
  );

  // 選択中の点は添字ではなく日付で覚える。期間を切り替えても同じ日を選び続けられ、
  // その日が期間外に出たときだけ最新の点へ戻る（種目詳細の記録タブと同じ）
  const [selectedDateKey, setSelectedDateKey] = useState<number | null>(null);

  const points = useMemo(() => filterProgressPoints(series.points, period), [series.points, period]);
  // 期間の外から線を伸ばすための、期間の直前の記録。pointsには混ぜない（選択の添字がずれる）
  const leadIn = useMemo(() => findLeadIn(series.points, period), [series.points, period]);
  // ハイライトは期間で絞る前の系列から求める。1ヶ月表示のたびにその月の最大がベスト扱いになると
  // 種目一覧のベストバッジと食い違う
  const highlight = useMemo(() => findPersonalBest(series.points), [series.points]);

  const selectedIndex = useMemo(() => {
    if (points.length === 0) return null;
    const found = selectedDateKey == null ? -1 : points.findIndex((p) => p.dateKey === selectedDateKey);
    return found >= 0 ? found : points.length - 1;
  }, [points, selectedDateKey]);

  if (failed) return <Text style={styles.placeholder}>記録を読み込めませんでした</Text>;
  if (!loaded) return <Text style={styles.placeholder}>読み込み中</Text>;
  // ✓を付けずに終えた種目はここに来る。種目詳細のような見本グラフ＋CTAは出さない
  // （サマリーは今日の結果を見る画面で、そこから記録を促す場面ではない）
  if (recordDays.length === 0) return <Text style={styles.placeholder}>まだ記録がありません</Text>;

  return (
    <ExerciseProgressChart
      points={points}
      unit={series.unit}
      // 指標は常にbestなので、ハイライトは実測の自己ベスト（アンバーの点と★）
      highlight={highlight}
      highlightKind="personal-best"
      leadIn={leadIn}
      selectedIndex={selectedIndex}
      onSelect={(i) => setSelectedDateKey(points[i]?.dateKey ?? null)}
    />
  );
}

/**
 * 完了サマリーのグラフブロック。種目名（左右送り）→ 期間チップ → グラフ → ドット の順に並ぶ。
 *
 * グラフは種目詳細の記録タブと同じ `ExerciseProgressChart` をそのまま使う。指標チップ
 * （最大重量／総重量／推定1RM）は出さず、常にその日の最強セット（best）を描く。
 *
 * **スワイプでの種目切り替えはグラフの外側でだけ効く。** グラフ本体は横方向のドラッグを
 * 点の選択に使っており（指を滑らせると選択が追従する）、同じ操作に2つの意味を持たせられない。
 * その代わりブロック全体を検出範囲にして、種目名の行・チップ・ドット・余白のどこから始めても
 * 送れるようにしている
 */
export function SummaryExerciseChart({ exercises }: { exercises: SummaryChartExercise[] }) {
  const [index, setIndex] = useState(0);
  // 記録編集で種目を消すと件数が縮む。範囲外を指したままにしない
  const safeIndex = Math.min(index, Math.max(0, exercises.length - 1));
  const current = exercises[safeIndex];

  // 期間は種目をまたいで保つ（3ヶ月で見比べたい、という見方を送るたびに壊さない）。
  // グラフの内側の状態（選択中の点）はExerciseChart側に置き、種目が変わればリセットされる
  const [period, setPeriod] = useState<ProgressPeriod>(DEFAULT_PROGRESS_PERIOD);

  const goTo = (next: number) => {
    if (next < 0 || next >= exercises.length) return;
    setIndex(next);
  };

  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-SWIPE_ACTIVATE_X, SWIPE_ACTIVATE_X])
        // 縦に動いたら本文のスクロールへ譲る
        .failOffsetY([-16, 16])
        // successを見ないと、他のハンドラやScrollViewに奪われて中断された場合も
        // 移動量だけで種目が送られてしまう
        .onEnd((event, success) => {
          if (!success) return;
          if (event.translationX <= -SWIPE_THRESHOLD) goTo(safeIndex + 1);
          else if (event.translationX >= SWIPE_THRESHOLD) goTo(safeIndex - 1);
        }),
    // goToはsafeIndexとexercises.lengthにだけ依存する
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [safeIndex, exercises.length],
  );

  if (!current) return null;

  return (
    <GestureDetector gesture={swipe}>
      <View style={styles.container}>
        <SummaryExerciseNav
          name={current.name}
          onPrev={() => goTo(safeIndex - 1)}
          onNext={() => goTo(safeIndex + 1)}
          hasPrev={safeIndex > 0}
          hasNext={safeIndex < exercises.length - 1}
        />

        {/* 期間チップはグラフの操作部なので、グラフとの間はブロック間(12px)より詰める */}
        <View style={styles.chartBlock}>
          <PeriodFilterChips value={period} onChange={setPeriod} />
          <ExerciseChart key={current.exerciseId} exercise={current} period={period} />
          <SummaryChartDots total={exercises.length} currentIndex={safeIndex} />
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  chartBlock: { gap: 8 },
  placeholder: { ...Typography.footnote, color: Colors.textMuted, textAlign: 'center', paddingVertical: 24 },
});
