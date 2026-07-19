import { CategoryChip } from '@/components/exercises/category-chip';
import { DesignIcon } from '@/components/ui/design-icon';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors, Typography } from '@/constants/theme';
import { getCategoryLabel } from '@/lib/exercises/constants';
import { summarizeCategories } from '@/lib/routines/format';
import { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  routineName: string;
  categories: string[];
  exerciseCount: number;
  // 「毎週 日曜 07:00」（lib/notifications/format.tsのformatKindSummary）または
  // 今日自身の予定なら「今日 07:00」。呼び出し側(app/(tabs)/calendar.tsx)が組み立てて渡す
  timeLabel: string;
  onPress: () => void;
  // 今日自身の予定カードにのみ渡す（デザイン案「未来日は開始ボタンなし・＞のみ」）
  onPressStart?: () => void;
  // 手動で追加した単発予定（PR10）を表す場合true。timeLabelがリマインダーの頻度表示
  // （例:「毎週月曜 07:00」）ではなく素の時刻のみになり、見た目だけでは繰り返し予定と
  // 区別しづらいため、視覚(バッジ)・読み上げ(accessibilityLabel)の両方で明示する（@designer指摘）
  oneTime?: boolean;
};

// 選択日パネルの予定カード（デザイン案「未来01/未来03/今日01」）。ルーティン紐付き
// リマインダーから算出した「予定」を表す読み取り専用カードで、実績を表す
// CalendarExerciseCardとは別コンポーネント（種目単位のセット概要・自己ベスト・前回比較を
// 前提にしたCalendarExerciseCardをそのまま流用すると、予定には無いデータの空欄が不自然に
// 出てしまうため）。タップでルーティン編集画面へ遷移する（このアプリにはルーティンの中身を
// 見るだけの読み取り専用画面が無く、一覧・リマインダーのルーティンバッジタップも同じ
// /routine/edit/[id]に飛ぶ既存パターンに合わせる、2026-07-19確定）
export const RoutineScheduleCard = memo(function RoutineScheduleCard({
  routineName,
  categories,
  exerciseCount,
  timeLabel,
  onPress,
  onPressStart,
  oneTime = false,
}: Props) {
  // routine-card.tsxの一覧カードと同じ情報構成（名前・カテゴリ・種目数・スケジュール）で
  // 読み上げ単位をまとめる。カレンダー/一覧のどちらでルーティンを見てもVoiceOver体験が
  // 揃うようにする（@designer指摘）
  const label = [
    routineName,
    categories.length > 0 ? categories.map(getCategoryLabel).join('・') : null,
    `${exerciseCount}種目`,
    timeLabel,
    oneTime ? '1回のみ' : null,
  ]
    .filter(Boolean)
    .join('、');
  const { visible, overflowCount } = summarizeCategories(categories);
  const inner = (
    <>
      <View style={styles.info}>
        <Text style={styles.name}>{routineName}</Text>
        <View style={styles.chipsRow}>
          {visible.map((category) => (
            <CategoryChip key={category} category={category} />
          ))}
          {overflowCount > 0 && <Text style={styles.overflow}>{`+${overflowCount}`}</Text>}
          <Text style={styles.countText}>{`${exerciseCount}種目`}</Text>
        </View>
        <View style={styles.timeBadge}>
          <DesignIcon name="calendar-today" size={15} color={Colors.accent} />
          <Text style={styles.timeText}>{timeLabel}</Text>
          {oneTime && <Text style={styles.oneTimeText}>1回のみ</Text>}
        </View>
      </View>
      <IconSymbol name="chevron.right" size={22} color={Colors.textPlaceholder} />
    </>
  );

  if (onPressStart) {
    // 今日自身の予定: カード行＋開始ボタンを1つの枠で囲む（デザイン案「今日01」）
    return (
      <View style={styles.wrapperWithButton}>
        <TouchableOpacity
          style={styles.row}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint="タップして編集画面を開きます"
        >
          {inner}
        </TouchableOpacity>
        <PrimaryButton
          label="開始"
          icon={<IconSymbol name="play.fill" size={16} color={Colors.onAccent} />}
          onPress={onPressStart}
          accessibilityLabel={`「${routineName}」のトレーニングを開始`}
        />
      </View>
    );
  }

  // 他日の予定: カード全体がそのままタップ領域（デザイン案「未来01/未来03」、開始ボタン無し）
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="タップして編集画面を開きます"
    >
      {inner}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 13,
  },
  wrapperWithButton: {
    gap: 10,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 13,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  info: { flex: 1, minWidth: 0, gap: 10 },
  name: { ...Typography.bodyStrong, color: Colors.textPrimary },
  chipsRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  overflow: { ...Typography.caption, fontWeight: '700', color: Colors.textPlaceholder },
  countText: { ...Typography.caption, color: Colors.textMuted, fontWeight: '600' },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  timeText: { ...Typography.footnote, color: Colors.textBody, fontWeight: '600' },
  oneTimeText: { ...Typography.badge, color: Colors.textMuted },
});
