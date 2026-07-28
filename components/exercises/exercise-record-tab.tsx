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

  return (
    <View style={styles.container}>
      <PeriodFilterChips value={period} onChange={setPeriod} />

      {/* TODO(重量グラフ): グラフ・内訳カード・過去の記録一覧を後続PRで載せる。
          この暫定表示は系列が正しく組めているか確認するためのもので、まるごと差し替える */}
      <Text style={styles.placeholder}>
        {failed
          ? '記録を読み込めませんでした'
          : !loaded
            ? '読み込み中'
            : `この期間 ${points.length}点 / 全 ${series.points.length}点（単位: ${series.unit.label}）`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 11 },
  placeholder: { ...Typography.footnote, color: Colors.textMuted, textAlign: 'center', paddingVertical: 24 },
});
