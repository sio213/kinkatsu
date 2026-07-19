import { DesignIcon } from '@/components/ui/design-icon';
import { Colors, Typography } from '@/constants/theme';
import { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  routineName: string;
  timeLabel: string;
  onUndo: () => void;
};

// 選択日パネルの「今回だけスキップ」済みの予定を表すゴースト行（PR10-6a）。他のカード
// （RoutineScheduleCard・CalendarExerciseCard）と違いカード全体はタップ不可にする——
// 「元に戻す」以外に意味のある遷移先が無いため、全面タップにすると誤操作やタップしても
// 何も起きない体験になる（@designer方針）。破線ボーダーはDayEmptyStateと同じトークンを
// 流用し、「意図して空にした日」という視覚言語を再利用する。選択日パネルに複数枚描画され
// うるため、他のカード群（RoutineScheduleCard・CalendarExerciseCard）と同じくmemo化する
export const SkippedReminderCard = memo(function SkippedReminderCard({ routineName, timeLabel, onUndo }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.info} accessible accessibilityLabel={`${routineName}、${timeLabel}、スキップ済み`}>
        <DesignIcon name="event-busy" size={15} color={Colors.textPlaceholder} />
        <View style={styles.textGroup}>
          <Text style={styles.name} numberOfLines={1}>
            {routineName}
          </Text>
          <Text style={styles.caption}>{`${timeLabel}・スキップ済み`}</Text>
        </View>
      </View>
      <TouchableOpacity
        onPress={onUndo}
        style={styles.undoButton}
        hitSlop={{ top: 4, bottom: 4, left: 14, right: 14 }}
        accessibilityRole="button"
        accessibilityLabel={`「${routineName}」${timeLabel}のスキップを元に戻す`}
      >
        <Text style={styles.undoText}>元に戻す</Text>
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.borderStrong,
    borderRadius: 10,
    // routine-schedule-card.tsx(padding: 13)と揃える。アクティブなカードとゴーストカードが
    // 時刻順に隣接して並ぶようになった(PR10-6aレビュー3巡目対応)ため、高さの微妙な差が
    // 目立つようになった(@designer指摘)。44pt相当のタップ領域はundoButton自身のpadding/hitSlopで
    // 確保しているため、カード全体のpaddingをここで縮めても実際のタップ領域は変わらない
    padding: 13,
  },
  info: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  textGroup: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...Typography.bodyStrong, color: Colors.textMuted, textDecorationLine: 'line-through' },
  // textPlaceholderは白背景でWCAG AA(4.5:1)を大きく下回るため、DayEmptyStateの本文と同じ
  // textMutedに揃える（@designer指摘: 視覚的な弱さは取り消し線・破線ボーダーで十分表現できている）
  caption: { ...Typography.caption, color: Colors.textMuted },
  // hitSlop(旧14pt)がカード間の余白(dayCardList: gap 8)を超えて隣接カードの領域まで
  // タップ判定を広げてしまう指摘への対応。paddingVertical(実レイアウト分の余白、隣接カードとの
  // 間隔を実際に押し広げるためhitSlopと違って隣を侵食しない)でタップ領域を44pt相当まで確保し、
  // hitSlopは隣接カードとのgapの半分(4pt)に収まる範囲だけの微調整に留める(@reviewer指摘)
  undoButton: { paddingVertical: 11, paddingHorizontal: 4 },
  undoText: { ...Typography.bodyStrong, color: Colors.accent },
});
