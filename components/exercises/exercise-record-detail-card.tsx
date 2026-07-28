import { DesignIcon } from '@/components/ui/design-icon';
import { Colors, IconSizes, Typography } from '@/constants/theme';
import type { MeasurementType } from '@/lib/exercises/constants';
import type { ProgressPoint } from '@/lib/exercises/progress';
import {
  buildDetailSetRows,
  COLLAPSE_THRESHOLD,
  completedSets,
  hiddenSetCount,
  type DetailSetRow,
} from '@/lib/exercises/progress-detail';
import { compareToPrevious } from '@/lib/workout/comparison';
import { MEASUREMENT_COLUMNS, splitSetDisplay } from '@/lib/workout/set-format';
import { formatRelativeDaysAgo, formatSessionDateGroup } from '@/lib/workout/summary';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  point: ProgressPoint;
  measurementType: MeasurementType;
  /**
   * 直前の記録。前回比の計算に使う。期間の絞り込みではなく全期間の系列で1つ前の点を渡すこと
   * （表示期間の外にあっても「直前の記録」であることに変わりはないため）。最初の記録ならnull
   */
  previousPoint: ProgressPoint | null;
  /** 見出し右端の > を押したとき。その日の記録編集画面へ遷移する */
  onPressOpen: (sessionId: number) => void;
};

function SetRow({
  row,
  measurementType,
  comparisonLabel,
  comparisonIsIncrease,
}: {
  row: DetailSetRow;
  measurementType: MeasurementType;
  comparisonLabel: string | null;
  comparisonIsIncrease: boolean;
}) {
  const display = splitSetDisplay(MEASUREMENT_COLUMNS[measurementType], row.set);
  const isUnfinished = row.set.completedAt == null;

  return (
    <View style={styles.setRow}>
      <Text style={styles.setNumber}>{row.position}セット</Text>
      {display == null || isUnfinished ? (
        // 進行中セッションでまだ✓を押していないセット。値があっても「確定した記録」ではないので
        // 数値は出さず、その日にやり残しがあることだけを示す
        <Text style={styles.unfinished}>未実施</Text>
      ) : (
        <>
          <Text style={styles.setValue}>{display.value}</Text>
          {display.rest !== '' && <Text style={styles.setRest}>{display.rest}</Text>}
        </>
      )}
      {row.isBest && (
        <>
          <DesignIcon name="star" size={14} color={Colors.chartBest} />
          {comparisonLabel && (
            <>
              <Text style={styles.comparisonLabel}>前回比</Text>
              <Text
                style={[
                  styles.comparisonValue,
                  { color: comparisonIsIncrease ? Colors.success : Colors.danger },
                ]}
              >
                {comparisonLabel}
              </Text>
            </>
          )}
        </>
      )}
    </View>
  );
}

/**
 * グラフで選択中の点の内訳カード。グラフの直下にインライン展開する。
 *
 * 吹き出しは指で隠れ、ボトムシートはグラフが見えなくなるためどちらも採らない（デザイン案）。
 * 閉じるボタンも持たない——初期状態で最新の点が選択済みなので、閉じられるとカードが空になり
 * 画面に穴が空いてしまう。
 *
 * カードの見た目は「過去の記録から読み込み」画面の HistoryEntryCard と揃えてある
 * （surfaceMuted ／ 1px border ／ 角丸10 ／ padding 12）。
 */
export function ExerciseRecordDetailCard({
  point,
  measurementType,
  previousPoint,
  onPressOpen,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const dateLabel = formatSessionDateGroup(point.startedAt);
  const relativeLabel = formatRelativeDaysAgo(point.startedAt);

  // 前回比はベストのセット行に置く。値は既存のカレンダー選択日パネルと同じ compareToPrevious で
  // 求めるので、同じ記録に対して両画面が違う数字を出すことはない
  const comparison = useMemo(
    () =>
      previousPoint
        ? compareToPrevious(measurementType, completedSets(point), completedSets(previousPoint))
        : null,
    [measurementType, point, previousPoint],
  );

  const rows = useMemo(() => buildDetailSetRows(point, expanded), [point, expanded]);
  const hidden = hiddenSetCount(point, false);
  const collapsible = point.sets.length >= COLLAPSE_THRESHOLD;

  return (
    // 見出しの > だけでなくカード全体をタップ領域にする。「他N件を見る」は入れ子の
    // TouchableOpacityとして残るので、そちらを押したときは展開が優先される
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPressOpen(point.best.sessionId)}
      accessibilityRole="button"
      accessibilityLabel={`${dateLabel}${relativeLabel ? `、${relativeLabel}` : ''}の記録`}
      accessibilityHint="タップするとこの日の記録を編集できます"
    >
      <View style={styles.header}>
        <Text style={styles.date}>{dateLabel}</Text>
        {relativeLabel && <Text style={styles.relative}>{relativeLabel}</Text>}
        <View style={styles.headerSpacer} />
        {/* 非テキストUIのコントラスト比3:1を満たすため textPlaceholder(slate400) ではなく
            textSecondary(slate600) を使う（デザイン案の指定） */}
        <DesignIcon name="chevron-right" size={IconSizes.cardChevron} color={Colors.textSecondary} />
      </View>

      <View style={styles.sets}>
        {rows.map((row) => (
          <SetRow
            key={row.position}
            row={row}
            measurementType={measurementType}
            comparisonLabel={comparison?.label ?? null}
            comparisonIsIncrease={(comparison?.delta ?? 0) > 0}
          />
        ))}

        {/* 「他N件を見る」は内訳ブロックの最終行に置く（セット行の続きであることを位置で示す）。
            デザイン案には展開だけしか無いが、一度開くと戻せないのは不便なので折りたたみも用意する */}
        {collapsible && (
          <TouchableOpacity
            style={styles.expandRow}
            onPress={() => setExpanded(!expanded)}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={expanded ? 'セットの表示を折りたたむ' : `残り${hidden}件のセットを表示`}
          >
            <Text style={styles.expandText}>{expanded ? '折りたたむ' : `他${hidden}件を見る`}</Text>
            <DesignIcon name={expanded ? 'expand-less' : 'expand-more'} size={16} color={Colors.accent} />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  date: { ...Typography.cardTitle, color: Colors.textPrimary },
  relative: { ...Typography.caption, color: Colors.textMuted },
  headerSpacer: { flex: 1 },

  // セット内訳は見出しから細い線で区切る
  sets: { borderTopWidth: 1, borderTopColor: Colors.surfaceSubtle, paddingTop: 3 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 4 },
  setNumber: { ...Typography.caption, fontWeight: '600', color: Colors.textSecondary },
  setValue: { ...Typography.metric, color: Colors.textPrimary },
  setRest: { ...Typography.footnote, color: Colors.textMuted },
  unfinished: { ...Typography.footnote, color: Colors.textSecondary },
  // 「前回比」ラベルと差分は BestBadge・カレンダー選択日パネルと同じ「バッジ的な強調テキスト」の役割
  comparisonLabel: { ...Typography.badge, fontWeight: '600', color: Colors.textSecondary },
  comparisonValue: { ...Typography.badge },

  expandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 4 },
  expandText: { ...Typography.caption, fontWeight: '600', color: Colors.accent },
});
