import { ExerciseProgressChart } from '@/components/exercises/exercise-progress-chart';
import { ExerciseProgressChartSample } from '@/components/exercises/exercise-progress-chart-sample';
import { ExerciseRecordDetailCard } from '@/components/exercises/exercise-record-detail-card';
import { ExerciseRecordHistoryList } from '@/components/exercises/exercise-record-history-list';
import { PeriodFilterChips } from '@/components/exercises/period-filter-chips';
import { DesignIcon } from '@/components/ui/design-icon';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors, Typography } from '@/constants/theme';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { useExerciseProgress } from '@/hooks/use-exercise-progress';
import { useStartWithConfirm } from '@/hooks/use-start-with-confirm';
import { useWorkoutSessions } from '@/hooks/use-workout-session';
import type { MeasurementType } from '@/lib/exercises/constants';
import {
  DEFAULT_PROGRESS_PERIOD,
  filterProgressPoints,
  type ProgressPeriod,
} from '@/lib/exercises/progress';
import { startWorkoutWithExercise } from '@/lib/workout/session';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  exerciseId: number;
  /** 「1回目を記録する」で進行中セッションの終了確認を出すときの文言に使う */
  exerciseName: string;
  measurementType: MeasurementType;
  /**
   * 種目詳細がタブ配下のStack（/exercises/[id]）から表示されているか。
   * 「すべての記録を見る」の遷移先をタブバーありのURLにするかどうかの判断に使う
   */
  insideTabBar: boolean;
};

/**
 * 種目詳細「記録」タブの中身。期間チップ → グラフ → 選択中の内訳カード → 過去の記録一覧、
 * の順に縦に並ぶ（デザイン案）。記録が0件のときは薄い見本グラフと「1回目を記録する」に
 * 差し替わり、1件のときは点1つだけを描いて履歴一覧を出さない（真上の内訳カードと同じ内容になるため）。
 */
export function ExerciseRecordTab({ exerciseId, exerciseName, measurementType, insideTabBar }: Props) {
  const push = useDebouncedPush();
  const { activeSession } = useWorkoutSessions();
  // 別のトレーニングが進行中なら確認を挟んでから開始する（ルーティン一覧のカードと同じ流儀）
  const startWithConfirm = useStartWithConfirm(
    activeSession,
    (sessionId) => push(`/workout/${sessionId}`),
    startWorkoutWithExercise,
  );
  const [period, setPeriod] = useState<ProgressPeriod>(DEFAULT_PROGRESS_PERIOD);
  const { series, loaded, failed } = useExerciseProgress(exerciseId, measurementType);

  // 単位は全期間のデータで決めたものを使い、期間の切り替えで縦軸の単位が変わらないようにする
  const points = useMemo(
    () => filterProgressPoints(series.points, period),
    [series.points, period],
  );

  // 選択中の点は添字ではなく日付で覚える。期間を切り替えても同じ日を選び続けられるようにし、
  // 選んでいた日が期間外に出たときだけ最新の点へ戻す（初期表示も最新の点＝未選択のときの既定）
  const [selectedDateKey, setSelectedDateKey] = useState<number | null>(null);
  const selectedIndex = useMemo(() => {
    if (points.length === 0) return null;
    const index = selectedDateKey == null ? -1 : points.findIndex((p) => p.dateKey === selectedDateKey);
    return index >= 0 ? index : points.length - 1;
  }, [points, selectedDateKey]);

  const handleSelect = (index: number) => {
    setSelectedDateKey(points[index]?.dateKey ?? null);
  };

  const selectedPoint = selectedIndex == null ? null : points[selectedIndex];
  // 前回比は「直前の記録」との差なので、期間で絞ったpointsではなく全期間の系列から1つ前を探す
  // （表示期間の外にあっても直前の記録であることに変わりはない）
  const previousPoint = useMemo(() => {
    if (!selectedPoint) return null;
    const index = series.points.findIndex((p) => p.dateKey === selectedPoint.dateKey);
    return index > 0 ? series.points[index - 1] : null;
  }, [series.points, selectedPoint]);

  return (
    <View style={styles.container}>
      <PeriodFilterChips value={period} onChange={setPeriod} />

      {failed ? (
        <Text style={styles.placeholder}>記録を読み込めませんでした</Text>
      ) : !loaded ? (
        <Text style={styles.placeholder}>読み込み中</Text>
      ) : series.points.length === 0 ? (
        // 記録0件。空白ではなく完成形を薄い見本で予告して、記録する動機にする（デザイン案）
        <>
          <ExerciseProgressChartSample />
          <View style={styles.emptyText}>
            <Text style={styles.emptyHeading}>記録の推移がここに出ます</Text>
            <Text style={styles.emptyBody}>まずは今日の1回を記録しましょう</Text>
          </View>
          <PrimaryButton
            style={styles.startButton}
            label="1回目を記録する"
            icon={<DesignIcon name="add" size={17} color={Colors.onAccent} />}
            onPress={() => startWithConfirm(exerciseId, exerciseName)}
          />
        </>
      ) : points.length === 0 ? (
        // 記録はあるが、選んだ期間には無い。0件と同じ文言にすると誤解を招くので分ける
        <>
          <ExerciseProgressChartSample />
          <Text style={styles.placeholder}>この期間の記録はありません</Text>
        </>
      ) : (
        <>
          <ExerciseProgressChart
            points={points}
            unit={series.unit}
            selectedIndex={selectedIndex}
            onSelect={handleSelect}
          />
          {selectedPoint && (
            <ExerciseRecordDetailCard
              // 別の日を選んだら「他N件を見る」の展開状態を持ち越さず畳んだ状態から始める
              key={selectedPoint.dateKey}
              point={selectedPoint}
              measurementType={measurementType}
              previousPoint={previousPoint}
              onPressOpen={(sessionId) => push(`/workout/${sessionId}`)}
            />
          )}

          {/* 記録が1件だけのときは、真上の内訳カードと同じ内容が並ぶだけなので出さない。
              一覧は期間チップにも選択中の点にも連動させず、常に今日から見た直近3件 */}
          {series.points.length > 1 && (
            <ExerciseRecordHistoryList
              points={series.points}
              measurementType={measurementType}
              onPressRecord={(sessionId) => push(`/workout/${sessionId}`)}
              onPressSeeAll={() =>
                push(insideTabBar ? `/exercises/history/${exerciseId}` : `/exercise/history/${exerciseId}`)
              }
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 11 },
  placeholder: { ...Typography.footnote, color: Colors.textMuted, textAlign: 'center', paddingVertical: 24 },
  emptyText: { alignItems: 'center', gap: 5 },
  emptyHeading: { ...Typography.cardTitle, color: Colors.textPrimary },
  emptyBody: { ...Typography.footnote, color: Colors.textMuted },
  // 全幅のPrimaryButtonだと空状態の中で強すぎるので、文言の幅に合わせて中央に置く
  startButton: { alignSelf: 'center', paddingHorizontal: 20 },
});
