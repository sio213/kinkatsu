import { IconSymbol } from '@/components/ui/icon-symbol';
import { RecordSummaryCard } from '@/components/workout/record-summary-card';
import { Colors, IconSizes } from '@/constants/theme';
import type { MeasurementType } from '@/lib/exercises/constants';
import type { ProgressPoint } from '@/lib/exercises/progress';
import { completedSets } from '@/lib/exercises/progress-detail';
import { formatHistorySetSummary, MEASUREMENT_COLUMNS } from '@/lib/workout/set-format';
import { formatRelativeDaysAgo, formatSessionDateGroup } from '@/lib/workout/summary';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

type Props = {
  point: ProgressPoint;
  measurementType: MeasurementType;
  isBest: boolean;
  /** カードを押したとき。その日の記録編集画面へ遷移する（読み込みではない） */
  onPress: (sessionId: number) => void;
};

/**
 * 種目詳細の記録タブの過去記録一覧と「過去の記録」画面で使う、1日分の記録カード。
 * 「過去の記録から読み込み」画面のカード（HistoryEntryCard）と箱・情報表示を共有し
 * （RecordSummaryCard）、右端だけ「読み込む」ボタンではなく遷移を示すchevronにしている。
 */
export const ExerciseRecordCard = memo(function ExerciseRecordCard({
  point,
  measurementType,
  isBest,
  onPress,
}: Props) {
  return (
    <RecordSummaryCard
      dateLabel={formatSessionDateGroup(point.startedAt)}
      relativeLabel={formatRelativeDaysAgo(point.startedAt)}
      // 要約は✓確定したセットだけで作る（自己ベスト判定や他の履歴表示と基準を揃えるため）
      summary={formatHistorySetSummary(MEASUREMENT_COLUMNS[measurementType], completedSets(point))}
      isBest={isBest}
      onPress={() => onPress(point.best.sessionId)}
      accessibilityHint="タップするとこの日の記録を編集できます"
      trailing={
        // 非テキストUIのコントラスト比3:1を満たすため textPlaceholder(slate400) ではなく
        // textSecondary(slate600) を使う（デザイン案の指定）
        <View style={styles.chevron}>
          <IconSymbol name="chevron.right" size={IconSizes.cardChevron} color={Colors.textSecondary} />
        </View>
      }
    />
  );
});

const styles = StyleSheet.create({
  // 2行のカードの縦中央にchevronを置く
  chevron: { alignSelf: 'center' },
});
