import { DesignIcon } from '@/components/ui/design-icon';
import { Colors, Typography } from '@/constants/theme';
import type { HistoryEntry } from '@/lib/workout/history';
import { formatHistorySetSummary, type SetColumn } from '@/lib/workout/set-format';
import { formatRelativeDaysAgo, formatSessionDateGroup } from '@/lib/workout/summary';
import { memo } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

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

export const HistoryEntryCard = memo(function HistoryEntryCard({
  entry,
  columns,
  isBest,
  disabled,
  loading,
  onLoad,
}: Props) {
  const dateLabel = formatSessionDateGroup(entry.startedAt);
  const relativeLabel = formatRelativeDaysAgo(entry.startedAt);
  const summary = formatHistorySetSummary(columns, entry.sets);
  // VoiceOver/TalkBackで日付・相対日付・自己ベスト・要約がバラバラに読み上げられないよう、
  // ボタン以外の情報表示部分は1つの読み上げ単位にまとめる
  const infoLabel = [dateLabel, relativeLabel, isBest ? '自己ベスト' : null, summary]
    .filter(Boolean)
    .join('、');

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.info} accessible accessibilityLabel={infoLabel}>
          <View style={styles.dateRow}>
            <Text style={styles.date}>{dateLabel}</Text>
            {relativeLabel && <Text style={styles.relative}>{relativeLabel}</Text>}
            {isBest && (
              <View style={styles.bestBadge}>
                <DesignIcon name="star" size={11} color={Colors.warningText} />
                <Text style={styles.bestBadgeText}>自己ベスト</Text>
              </View>
            )}
          </View>
          <Text style={styles.summary} numberOfLines={1}>
            {summary}
          </Text>
        </View>
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
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
  },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  info: { flex: 1, gap: 6 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  date: { ...Typography.cardTitle, color: Colors.textPrimary },
  relative: { ...Typography.caption, color: Colors.textMuted },
  bestBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.warningSurface,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  bestBadgeText: { ...Typography.badge, color: Colors.warningText },
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
  summary: { ...Typography.footnote, color: Colors.textMuted },
});
