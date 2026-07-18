import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { Colors, Typography } from '@/constants/theme';
import { formatHourMinute, getTimeOfDay, getTimeOfDayLabel, type TimeOfDay } from '@/lib/calendar/time-of-day';
import { StyleSheet, Text, View } from 'react-native';

const TIME_OF_DAY_STYLE: Record<TimeOfDay, { icon: IconSymbolName; color: string }> = {
  morning: { icon: 'sun.max.fill', color: Colors.timeOfDayMorning },
  midday: { icon: 'sun.min.fill', color: Colors.timeOfDayMidday },
  evening: { icon: 'sunset.fill', color: Colors.timeOfDayEvening },
  night: { icon: 'moon.stars.fill', color: Colors.timeOfDayNight },
};

type Props = {
  sessionStartedAt: number;
};

// 選択日パネルで同日複数セッションを時間帯ごとに分けて表示するときの見出し
// （デザイン案「複数18: 時間帯アイコン（朝・夕方・夜）」）。ルーティン名の右寄せ表示は
// workoutSessionsにroutineIdが無く実現できないため、マイグレーション対応まで保留している。
// periodはsessionStartedAtから一意に決まるためpropとして受け取らず内部で導出する
// （呼び出し側が矛盾した値を渡す余地を無くすため）
export function SessionTimeGroupHeader({ sessionStartedAt }: Props) {
  const period = getTimeOfDay(new Date(sessionStartedAt));
  const { icon, color } = TIME_OF_DAY_STYLE[period];
  const label = `${getTimeOfDayLabel(period)} ${formatHourMinute(new Date(sessionStartedAt))}`;
  return (
    <View style={styles.row} accessible accessibilityRole="header" accessibilityLabel={label}>
      <IconSymbol name={icon} size={17} color={color} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  label: { ...Typography.footnote, fontWeight: '700', color: Colors.textPrimary },
});
