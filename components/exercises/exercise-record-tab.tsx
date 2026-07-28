import { ExerciseProgressChart } from '@/components/exercises/exercise-progress-chart';
import { PeriodFilterChips } from '@/components/exercises/period-filter-chips';
import { Colors, Typography } from '@/constants/theme';
import { useExerciseProgress } from '@/hooks/use-exercise-progress';
import type { MeasurementType } from '@/lib/exercises/constants';
import {
  DEFAULT_PROGRESS_PERIOD,
  filterProgressPoints,
  type ProgressPeriod,
} from '@/lib/exercises/progress';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  exerciseId: number;
  measurementType: MeasurementType;
};

/**
 * 種目詳細「記録」タブの中身。期間チップ → グラフ → 選択中の内訳カード → 過去の記録一覧、
 * の順に縦に並ぶ（デザイン案）。現時点では期間チップまで実装済み。
 */
export function ExerciseRecordTab({ exerciseId, measurementType }: Props) {
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

  return (
    <View style={styles.container}>
      <PeriodFilterChips value={period} onChange={setPeriod} />

      {failed ? (
        <Text style={styles.placeholder}>記録を読み込めませんでした</Text>
      ) : !loaded ? (
        <Text style={styles.placeholder}>読み込み中</Text>
      ) : (
        // TODO(重量グラフ): 選択中の点の内訳カード・過去の記録一覧を後続PRで載せる。
        // 記録0件／1件のときの専用表示も後続PRで入れる
        <ExerciseProgressChart
          points={points}
          unit={series.unit}
          selectedIndex={selectedIndex}
          onSelect={handleSelect}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 11 },
  placeholder: { ...Typography.footnote, color: Colors.textMuted, textAlign: 'center', paddingVertical: 24 },
});
