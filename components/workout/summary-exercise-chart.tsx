import { ExerciseProgressChart } from '@/components/exercises/exercise-progress-chart';
import { PeriodFilterChips } from '@/components/exercises/period-filter-chips';
import { SummaryChartDots } from '@/components/workout/summary-chart-dots';
import { SummaryExerciseNav } from '@/components/workout/summary-exercise-nav';
import { Colors, Typography } from '@/constants/theme';
import { useExerciseProgress } from '@/hooks/use-exercise-progress';
import { CHART_HEIGHT } from '@/lib/exercises/chart-layout';
import { resolveMeasurementType } from '@/lib/exercises/constants';
import {
  DEFAULT_PROGRESS_PERIOD,
  filterProgressPoints,
  findLeadIn,
  findPersonalBest,
  type ProgressPeriod,
} from '@/lib/exercises/progress';
import type { SummaryChartExercise } from '@/lib/workout/chart-exercises';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

/**
 * 種目送りのスワイプが有効化される幅。グラフ本体のPan（点の選択）が8pxで有効化されるため、
 * それより十分大きく取って内側を優先させる。グラフの外（種目名の行・期間チップ・ドット・
 * ブロックの余白）で始めたスワイプだけがここに届く
 */
const SWIPE_ACTIVATE_X = 24;
// このくらい動かした/このくらいの速度が出ていれば「種目を送る意図」とみなすしきい値。
// OR条件にして、ゆっくり大きくドラッグしても素早くフリックしても切り替わるようにする
// （カレンダーの月送りと同じ値・同じ考え方）
const SWIPE_DISTANCE_THRESHOLD = 60;
const SWIPE_VELOCITY_THRESHOLD = 800;
const SNAP_DURATION_MS = 240;
/**
 * スロット間の隙間。グラフを直接隣接させると、ドラッグ中にビューポートが2スロットの境界へ
 * かかったとき、隣り合う2つの折れ線が余白無く繋がって「実在しない1本のグラフ」に見える。
 * 不透明な背景の帯を挟んで、必ず切れ目があるようにする（カレンダーの月グリッドで実機確認済みの
 * 同じ現象への対処）
 */
const SLOT_GAP = 12;

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
 * トラックの1枠。枠と枠の間はgapではなくmarginRightで空ける
 * （キー付きの配列として並べるので、間に別要素を挟むとキーの対応がずれる）
 */
function Slot({
  exercise,
  period,
  width,
  last,
}: {
  exercise: SummaryChartExercise;
  period: ProgressPeriod;
  width: number;
  last: boolean;
}) {
  return (
    <View style={[{ width }, !last && styles.slotSpacing]}>
      <ExerciseChart exercise={exercise} period={period} />
    </View>
  );
}

/**
 * 完了サマリーのグラフブロック。種目名（左右送り）→ 期間チップ → グラフ → ドット の順に並ぶ。
 *
 * グラフは種目詳細の記録タブと同じ `ExerciseProgressChart` をそのまま使う。指標チップ
 * （最大重量／総重量／推定1RM）は出さず、常にその日の最強セット（best）を描く。
 *
 * **スワイプはグラフの外側で始めたものだけが種目送りになる。** グラフ本体は横方向のドラッグを
 * 点の選択に使っており（指を滑らせると選択が追従する）、同じ操作に2つの意味を持たせられない。
 * カレンダーの月送り（`components/calendar/swipeable-month-view.tsx`）は日付セルがタップ専用で
 * 横ドラッグを消費しないため全面で受けられるが、ここは事情が違う。その代わり検出範囲を
 * ブロック全体に広げ、種目名の行・チップ・ドット・余白のどこから始めても送れるようにしている。
 *
 * 前後の種目もマウントして指に追従させる（カレンダーと同じ3スロットのトラック）ため、
 * 表示中でない2種目分の系列取得も走る
 */
export function SummaryExerciseChart({
  exercises,
  horizontalInset,
}: {
  exercises: SummaryChartExercise[];
  /**
   * 画面本文の左右パディング。その分だけブロックを外側へ広げ、内側で同じだけ戻すことで、
   * **画面端までスワイプを拾えるようにする**（グラフは横幅いっぱいなので、そうしないと
   * 「グラフの左右」に指を置ける場所が無い）。レイアウトは広げる前と変わらない
   */
  horizontalInset: number;
}) {
  const [index, setIndex] = useState(0);
  // 記録編集で種目を消すと件数が縮む。範囲外を指したままにしない
  const safeIndex = Math.min(index, Math.max(0, exercises.length - 1));

  // 期間は種目をまたいで保つ（3ヶ月で見比べたい、という見方を送るたびに壊さない）。
  // グラフの内側の状態（選択中の点）はExerciseChart側に置く
  const [period, setPeriod] = useState<ProgressPeriod>(DEFAULT_PROGRESS_PERIOD);

  const [containerWidth, setContainerWidth] = useState(0);
  // 確定済みの位置と、指をドラッグしている間の差分。トラックの位置はこの2つの和だけで決まり、
  // Reactの再レンダーには依存しない。送りを確定する瞬間に「baseを1枠ぶん進める」と
  // 「dragを0に戻す」を同じ関数内で書くので、合計は変わらず見た目が飛ばない
  const base = useSharedValue(0);
  const drag = useSharedValue(0);

  const step = containerWidth + SLOT_GAP;

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  // 幅が確定したとき・種目が減って位置が丸められたときに、確定位置を現在地へ合わせ直す。
  // 送りの確定時は既に同じ値になっているため、ここは実質何もしない
  useEffect(() => {
    if (containerWidth === 0) return;
    base.value = -safeIndex * step;
  }, [safeIndex, containerWidth, step, base]);

  // アニメーション中の二重発火を防ぐ。送りボタンやドットは連打できてしまい、
  // スナップの途中から別のスナップを始めると位置が中途半端なまま確定する
  const isSlidingRef = useRef(false);

  const commitSlide = useCallback(
    (delta: number) => {
      // 2つのsharedValueを同じ関数内で書くことで、UIスレッドへ同じフレームで反映される。
      // 片方だけ先に効くと1枠ぶん飛んで見える
      base.value = base.value - delta * step;
      drag.value = 0;
      setIndex((i) => i + delta);
      isSlidingRef.current = false;
    },
    [base, drag, step],
  );

  /**
   * 隣の種目へスライドして送る。送りボタン・ドット・スワイプの共通経路。
   * 隣以外（ドットで2つ以上先を指した場合）はアニメーションせずその場で移す
   */
  const slideBy = useCallback(
    (delta: number) => {
      const next = safeIndex + delta;
      if (next < 0 || next >= exercises.length) return;
      if (isSlidingRef.current) return;
      if (Math.abs(delta) !== 1 || containerWidth === 0) {
        setIndex(next);
        return;
      }
      isSlidingRef.current = true;
      drag.value = withTiming(delta > 0 ? -step : step, { duration: SNAP_DURATION_MS }, (finished) => {
        if (finished) runOnJS(commitSlide)(delta);
      });
    },
    [safeIndex, exercises.length, containerWidth, step, drag, commitSlide],
  );

  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-SWIPE_ACTIVATE_X, SWIPE_ACTIVATE_X])
        // 縦に動いたら本文のスクロールへ譲る
        .failOffsetY([-16, 16])
        .onUpdate((e) => {
          drag.value = e.translationX;
        })
        .onEnd((e) => {
          const wantsNext =
            e.translationX < -SWIPE_DISTANCE_THRESHOLD || e.velocityX < -SWIPE_VELOCITY_THRESHOLD;
          const wantsPrev =
            e.translationX > SWIPE_DISTANCE_THRESHOLD || e.velocityX > SWIPE_VELOCITY_THRESHOLD;
          const delta = wantsNext ? 1 : wantsPrev ? -1 : 0;
          const canSlide = delta === 1 ? safeIndex < exercises.length - 1 : delta === -1 && safeIndex > 0;
          // 端では送らずに元の位置へ戻す。送りボタンが無効になっているのと同じ扱い
          if (canSlide) runOnJS(slideBy)(delta);
          else drag.value = withTiming(0, { duration: SNAP_DURATION_MS });
        }),
    [safeIndex, exercises.length, slideBy, drag],
  );

  const animatedTrackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: base.value + drag.value }],
  }));

  const current = exercises[safeIndex];
  if (!current) return null;

  return (
    <GestureDetector gesture={swipe}>
      <View
        style={[
          styles.container,
          { marginHorizontal: -horizontalInset, paddingHorizontal: horizontalInset },
        ]}
      >
        <SummaryExerciseNav
          name={current.name}
          onPrev={() => slideBy(-1)}
          onNext={() => slideBy(1)}
          hasPrev={safeIndex > 0}
          hasNext={safeIndex < exercises.length - 1}
        />

        {/* 期間チップはグラフの操作部なので、グラフとの間はブロック間(12px)より詰める */}
        <View style={styles.chartBlock}>
          <PeriodFilterChips value={period} onChange={setPeriod} />
          {/* 高さを固定するのは、グラフと「読み込み中」等の1行表示で高さが変わると
              種目を送るたびに下の一覧が上下してしまうため */}
          <View onLayout={handleLayout} style={styles.viewport}>
            {containerWidth > 0 && (
              <Animated.View
                style={[
                  styles.track,
                  { width: exercises.length * containerWidth + (exercises.length - 1) * SLOT_GAP },
                  animatedTrackStyle,
                ]}
              >
                {/* **全種目を並べて一度もアンマウントしない。** 前後3枠だけを持ち回す形だと、
                    送った先の種目はその瞬間に初めてマウントされ、系列の取得が終わるまで
                    「読み込み中」＝白い枠が見える。連続で送るほど当たりやすく、画面を開いた
                    直後の1回目だけ出にくい、という現れ方になっていた（@ユーザー報告）。
                    1セッションの種目数は多くても十数件なので、全部載せて先に読ませてしまう */}
                {exercises.map((exercise, i) => (
                  <Slot
                    key={exercise.exerciseId}
                    exercise={exercise}
                    period={period}
                    width={containerWidth}
                    last={i === exercises.length - 1}
                  />
                ))}
              </Animated.View>
            )}
          </View>
          <SummaryChartDots
            total={exercises.length}
            currentIndex={safeIndex}
            onSelect={(next) => slideBy(next - safeIndex)}
          />
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  chartBlock: { gap: 8 },
  viewport: { height: CHART_HEIGHT, overflow: 'hidden' },
  track: { flexDirection: 'row', alignItems: 'flex-start' },
  // 枠と枠の間。ページ背景と同化させて「余白」に見せる（隣接する折れ線が繋がって見えるのを断ち切る）
  slotSpacing: { marginRight: SLOT_GAP, backgroundColor: Colors.background },
  // グラフと同じ高さの枠の中で中央に置き、送るたびに高さが変わらないようにする
  placeholder: {
    ...Typography.footnote,
    color: Colors.textMuted,
    textAlign: 'center',
    height: CHART_HEIGHT,
    textAlignVertical: 'center',
    lineHeight: CHART_HEIGHT,
  },
});
