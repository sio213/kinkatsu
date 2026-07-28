import { DesignIcon } from '@/components/ui/design-icon';
import { RecordSummaryCard } from '@/components/workout/record-summary-card';
import { Colors, Typography } from '@/constants/theme';
import type { HistoryEntry } from '@/lib/workout/history';
import { formatHistorySetSummary, type SetColumn } from '@/lib/workout/set-format';
import { formatRelativeDaysAgo, formatSessionDateGroup } from '@/lib/workout/summary';
import { memo } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';

type Props = {
  entry: HistoryEntry;
  columns: SetColumn[];
  isBest: boolean;
  disabled: boolean;
  // このカード自身が読み込み処理中かどうか（disabledは他カードの操作中も含めて一律trueになるため、
  // ボタンの見た目をスピナーに差し替えるかはこのカード固有の状態で判断する）
  loading: boolean;
  onLoad: (entry: HistoryEntry) => void;
};

// 「過去の記録から読み込み」画面のカード。カードの箱と情報表示はRecordSummaryCardに共通化してあり、
// ここは右端の「読み込む」ボタンだけを足している（種目詳細の過去記録一覧はchevronを足す）
export const HistoryEntryCard = memo(function HistoryEntryCard({
  entry,
  columns,
  isBest,
  disabled,
  loading,
  onLoad,
}: Props) {
  const dateLabel = formatSessionDateGroup(entry.startedAt);

  return (
    <RecordSummaryCard
      dateLabel={dateLabel}
      relativeLabel={formatRelativeDaysAgo(entry.startedAt)}
      summary={formatHistorySetSummary(columns, entry.sets)}
      isBest={isBest}
      trailing={
        <TouchableOpacity
          style={[styles.loadButton, disabled && styles.loadButtonDisabled]}
          onPress={() => onLoad(entry)}
          disabled={disabled}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          accessibilityRole="button"
          accessibilityLabel={`${dateLabel}の記録を読み込む`}
          accessibilityState={{ disabled, busy: loading }}
        >
          {loading ? (
            <ActivityIndicator size="small" color={Colors.onAccent} />
          ) : (
            <DesignIcon name="download" size={13} color={Colors.onAccent} />
          )}
          <Text style={styles.loadButtonText}>読み込む</Text>
        </TouchableOpacity>
      }
    />
  );
});

const styles = StyleSheet.create({
  loadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  loadButtonDisabled: { backgroundColor: Colors.textPlaceholder },
  loadButtonText: { ...Typography.footnote, fontWeight: '700', color: Colors.onAccent },
});
