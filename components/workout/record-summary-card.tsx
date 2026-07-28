import { BestBadge } from '@/components/workout/best-badge';
import { Colors, Typography } from '@/constants/theme';
import type { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  /** 「7月23日（木）」 */
  dateLabel: string;
  /** 「3日前」。未来方向のずれ等で出せない場合はnull */
  relativeLabel: string | null;
  /** 「70kg×8・75kg×7・70kg×8」 */
  summary: string;
  isBest: boolean;
  /** 右端に置く操作（読み込むボタン・chevronなど） */
  trailing: ReactNode;
  /**
   * カード全体を押せるようにする場合に渡す。省略すると押せない箱になり、操作はtrailing側だけが担う
   * （「過去の記録から読み込み」画面は読み込むボタンだけがタップ対象）
   */
  onPress?: () => void;
  /** onPressを渡すときの読み上げ。省略すると日付などから組み立てた説明だけになる */
  accessibilityHint?: string;
};

/**
 * 1回分の記録を1行で表す共通カード。
 *
 * 「過去の記録から読み込み」画面（HistoryEntryCard）と、種目詳細の記録タブの過去記録一覧・
 * 「過去の記録」画面で見た目が完全に一致していたため共通化した。違いは右端に置くものだけで、
 * 前者は「読み込む」ボタン、後者は遷移を示すchevron。
 */
export function RecordSummaryCard({
  dateLabel,
  relativeLabel,
  summary,
  isBest,
  trailing,
  onPress,
  accessibilityHint,
}: Props) {
  // VoiceOver/TalkBackで日付・相対日付・自己ベスト・要約がバラバラに読み上げられないよう、
  // 情報表示部分は1つの読み上げ単位にまとめる
  const infoLabel = [dateLabel, relativeLabel, isBest ? '自己ベスト' : null, summary]
    .filter(Boolean)
    .join('、');

  const content = (
    <>
      <View style={styles.info} accessible={onPress == null} accessibilityLabel={infoLabel}>
        <View style={styles.dateRow}>
          <Text style={styles.date}>{dateLabel}</Text>
          {relativeLabel && <Text style={styles.relative}>{relativeLabel}</Text>}
          {isBest && <BestBadge />}
        </View>
        <Text style={styles.summary} numberOfLines={1}>
          {summary}
        </Text>
      </View>
      {trailing}
    </>
  );

  if (onPress == null) return <View style={styles.card}>{content}</View>;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={infoLabel}
      accessibilityHint={accessibilityHint}
    >
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
  },
  info: { flex: 1, gap: 6 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  date: { ...Typography.cardTitle, color: Colors.textPrimary },
  relative: { ...Typography.caption, color: Colors.textMuted },
  summary: { ...Typography.footnote, color: Colors.textMuted },
});
