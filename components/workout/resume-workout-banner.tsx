import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Typography } from '@/constants/theme';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  // ルーティンから開始した場合はルーティン名（例: 「胸の日」）。手動開始（routineIdがnull）はnull
  routineName: string | null;
  // 経過時間表示（lib/workout/summary.tsのformatElapsedClockで整形済みの文字列）
  elapsedLabel: string;
  completedExerciseCount: number;
  totalExerciseCount: number;
  completedSetCount: number;
  onPress: () => void;
};

// 記録タブ・カレンダー今日パネル共通の「進行中のトレーニングを再開する」バナー。単体で切り出しているのは
// このバナーの見た目・文言をロジック(handleStart等)から独立して読めるようにするため
export function ResumeWorkoutBanner({
  routineName,
  elapsedLabel,
  completedExerciseCount,
  totalExerciseCount,
  completedSetCount,
  onPress,
}: Props) {
  const title = routineName ?? 'トレーニング中';
  // 開始直後、まだ種目を1つも追加していない間はtotalExerciseCountが0になりうる
  // （カレンダーの手動開始バナーは記録0件でも常に表示するため実際に起こりうる状態、
  // app/(tabs)/calendar.tsxのhandleResumeToday周りのコメント参照）。「0/0種目」という
  // 不自然な分数表示を避け、専用の文言にフォールバックする（@designer指摘）
  const subtitle =
    totalExerciseCount === 0
      ? 'まだ種目が追加されていません'
      : `${completedExerciseCount}/${totalExerciseCount}種目 ・ ${completedSetCount}セット完了`;
  // カード全体・下部のボタンのどちらをタップしても遷移先は同じ(/workout/[id])なため、
  // VoiceOver/TalkBackで情報がバラバラに読み上げられないようカード全体を1つの読み上げ単位にまとめる
  // （RoutineCard等、既存のカードコンポーネントと同じ考え方。@designer指摘）
  const accessibilityLabel = [`進行中・${elapsedLabel}`, title, subtitle].join('、');

  return (
    <TouchableOpacity
      style={styles.banner}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="タップしてトレーニング画面を開きます"
    >
      <View style={styles.statusRow}>
        <View style={styles.liveDot} />
        <Text style={styles.statusText}>進行中・{elapsedLabel}</Text>
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <View style={styles.button}>
        <IconSymbol name="play.fill" size={18} color={Colors.accent} />
        <Text style={styles.buttonText}>トレーニングを再開</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: Colors.accent,
    borderRadius: 14,
    padding: 16,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.accentLiveDot },
  // opacityで白を薄めるとColors.accent背景との合成後コントラストがWCAG AA(4.5:1)を割り込むため、
  // 不透明のonAccentをそのまま使う（@reviewer/@designer指摘）
  statusText: { ...Typography.caption, fontWeight: '700', color: Colors.onAccent },
  title: { ...Typography.cardTitle, color: Colors.onAccent, marginBottom: 3 },
  subtitle: { ...Typography.caption, color: Colors.onAccent, marginBottom: 14 },
  // borderRadiusはカード(14)に対して内側に3px小さくし同心円状に揃えている
  button: {
    flexDirection: 'row',
    gap: 6,
    borderRadius: 11,
    paddingVertical: 12,
    backgroundColor: Colors.onAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { ...Typography.bodyStrong, color: Colors.accent },
});
