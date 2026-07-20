import { CalendarExerciseCard } from '@/components/calendar/calendar-exercise-card';
import { SessionTimeGroupHeader } from '@/components/calendar/session-time-group-header';
import { DropdownMenu, type DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors, Typography } from '@/constants/theme';
import { useScheduledExerciseCards } from '@/hooks/use-scheduled-exercise-cards';
import { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// 一度も実施していない種目は、summarizeExerciseSetsの「0セット」（実在のセッションで
// 記録し忘れた場合と同じ文言）を出すと「記録し忘れ」と誤読される（@designer指摘）ため、
// このコンポーネント専用の文言に差し替える
const NO_HISTORY_LABEL = '実施記録なし';

function deleteMenuItems(onDelete: () => void): DropdownMenuItem[] {
  return [{ key: 'delete', label: '削除', icon: 'delete-outline', danger: true, onPress: onDelete }];
}

type Props = {
  scheduledWorkoutId: number;
  // SessionTimeGroupHeaderにそのまま渡す時刻表示用の合成タイムスタンプ（選択日+予定のhour/minute）。
  // 今日パネルは実績セッションと同じ時系列に混ぜるためentry.sortAtをそのまま流用できる
  sessionStartedAt: number;
  title: string;
  // 今日自身の予定にのみ渡す（デザイン案「未来日は開始ボタンなし」、routine-schedule-card.tsxと同じ）
  onPressStart?: () => void;
  onDelete: () => void;
  // 種目カードは1件ごとの詳細ではなく、この予定の種目一覧をまとめて編集する画面へ遷移する
  // （過去の記録の種目カードが記録編集画面(/workout/[sessionId])へ飛ぶのと同じ考え方、
  // @ユーザー指摘2026-07-20）。どの種目カードをタップしても遷移先は同じなので引数を取らない
  onPress: () => void;
};

// 「直接追加」予定（ルーティンを介さず個別に選んだ種目、2026-07-20）の選択日パネル表示。
// ルーティン予定(RoutineScheduleCard)と違い、予定の中身（種目）を確認する手段が無いという
// @designer指摘を受け、要約カード1枚ではなく過去の記録と同じ種目一覧カード
// (CalendarExerciseCard)をそのまま並べる（サムネ・カテゴリ・前回のセット内容が見える、
// @ユーザー指摘）。まだ実施していない予定のため、セット内容は目標セット（設定済みならそれ、
// 無ければ直近の実施記録を参考値）として表示し(useScheduledExerciseCards)、前回比較
// (comparison)は今回の実施が無いと成立しない概念のため常にnullで渡す。自己ベストバッジも
// 同様の理由（まだ実施していないのに「ベスト」と出ると実績と誤認する、@designer指摘）で
// 常にfalse固定にする
export const DirectScheduleExerciseGroup = memo(function DirectScheduleExerciseGroup({
  scheduledWorkoutId,
  sessionStartedAt,
  title,
  onPressStart,
  onDelete,
  onPress,
}: Props) {
  const { cards, retry } = useScheduledExerciseCards(scheduledWorkoutId);

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <SessionTimeGroupHeader sessionStartedAt={sessionStartedAt} isSchedule />
        <View style={styles.menuSlot}>
          <DropdownMenu
            groups={[deleteMenuItems(onDelete)]}
            minWidth={140}
            renderTrigger={({ open, onPress: onOpenMenu }) => (
              <TouchableOpacity
                onPress={onOpenMenu}
                hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                accessibilityRole="button"
                accessibilityLabel={`「${title}」のメニューを開く`}
                accessibilityState={{ expanded: open }}
              >
                <IconSymbol name="ellipsis" size={20} color={open ? Colors.accent : Colors.textPlaceholder} />
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
      {cards != null && cards !== 'error' && (
        <View style={styles.cardList}>
          {cards.map((card) => (
            <CalendarExerciseCard
              key={card.scheduledWorkoutExerciseId}
              exerciseId={card.exerciseId}
              name={card.name}
              category={card.category}
              source={card.source}
              slug={card.slug}
              measurementType={card.measurementType}
              sets={card.sets}
              isBest={false}
              comparison={null}
              onPress={onPress}
              accessibilityHint="タップして予定の種目をまとめて編集します"
              emptySetsLabel={NO_HISTORY_LABEL}
            />
          ))}
        </View>
      )}
      {cards === 'error' && (
        // useCalendarDayExercises(過去日パネル)のエラー表示・再試行ボタンと同じ体験に揃える
        <View style={styles.errorRow}>
          <IconSymbol name="exclamationmark.triangle.fill" size={18} color={Colors.danger} />
          <Text style={styles.errorText}>種目を読み込めませんでした</Text>
          <TouchableOpacity
            onPress={retry}
            accessibilityRole="button"
            accessibilityLabel="再試行"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.retryText}>再試行</Text>
          </TouchableOpacity>
        </View>
      )}
      {onPressStart && (
        <PrimaryButton
          label="開始"
          icon={<IconSymbol name="play.fill" size={16} color={Colors.onAccent} />}
          onPress={onPressStart}
          accessibilityLabel={`「${title}」のトレーニングを開始`}
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  // ルーティン予定(RoutineScheduleCard)と同じsurfaceMuted+borderで軽く囲み、「1つの予定の
  // まとまり」であることを視覚的に示す（@designer指摘: 枠が無いと隣接カードとの境界が
  // 分かりづらい）
  wrapper: {
    gap: 10,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 13,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  menuSlot: { marginLeft: 'auto' },
  cardList: { gap: 8 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  errorText: { ...Typography.body, color: Colors.danger },
  retryText: { ...Typography.bodyStrong, color: Colors.accent },
});
