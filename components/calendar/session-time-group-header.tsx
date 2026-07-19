import { DesignIcon, type DesignIconName } from '@/components/ui/design-icon';
import { Colors, Typography } from '@/constants/theme';
import { formatHourMinute, getTimeOfDay, getTimeOfDayLabel, type TimeOfDay } from '@/lib/calendar/time-of-day';
import { StyleSheet, Text, View } from 'react-native';

// SF Symbols/MaterialIconsのクラシック版には塗りつぶし版が無い、または形状が異なる
// （calendar-month/nightlight等）ため、デザイン案（Material Symbols Rounded塗り）の
// 公式パスをDesignIconでそのまま使い、3プラットフォームで見た目を一致させる
const TIME_OF_DAY_STYLE: Record<TimeOfDay, { icon: DesignIconName; color: string }> = {
  morning: { icon: 'wb-sunny', color: Colors.timeOfDayMorning },
  // 昼は朝と同じアイコン（wb-sunny）を使い、色（timeOfDayMidday）だけで区別する（ユーザー指示）
  midday: { icon: 'wb-sunny', color: Colors.timeOfDayMidday },
  evening: { icon: 'wb-twilight', color: Colors.timeOfDayEvening },
  night: { icon: 'nightlight', color: Colors.timeOfDayNight },
};

type Props = {
  sessionStartedAt: number;
  // 今日パネルで実績セッションと予定（ルーティン紐付きリマインダー由来）を同じ時系列
  // リストに混ぜて表示するときにtrueを渡す（2026-07-19確定）。太字の主見出しと紛らわしく
  // ならないよう、実績とは別の控えめな「予定」ラベルを添えるだけに留める
  isSchedule?: boolean;
};

// 選択日パネルで同日複数セッションを時間帯ごとに分けて表示するときの見出し
// （デザイン案「複数18: 時間帯アイコン（朝・夕方・夜）」）。ルーティン名の右寄せ表示は
// workoutSessionsにroutineIdが無く実現できないため、マイグレーション対応まで保留している。
// periodはsessionStartedAtから一意に決まるためpropとして受け取らず内部で導出する
// （呼び出し側が矛盾した値を渡す余地を無くすため）
export function SessionTimeGroupHeader({ sessionStartedAt, isSchedule = false }: Props) {
  const period = getTimeOfDay(new Date(sessionStartedAt));
  const { icon, color } = TIME_OF_DAY_STYLE[period];
  const timeLabel = `${getTimeOfDayLabel(period)} ${formatHourMinute(new Date(sessionStartedAt))}`;
  const accessibilityLabel = isSchedule ? `${timeLabel}、予定` : timeLabel;
  return (
    <View style={styles.row} accessible accessibilityRole="header" accessibilityLabel={accessibilityLabel}>
      <DesignIcon name={icon} size={17} color={color} />
      <Text style={styles.label}>{timeLabel}</Text>
      {/* テキストの太さ・色の差だけだと「夜20:00予定」と1語に読めてしまう懸念（@designer指摘）
          があるため、ピル形状の背景で実績見出しとの境界を明示する */}
      {isSchedule && (
        <View style={styles.scheduleTag}>
          <Text style={styles.scheduleTagText}>予定</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  label: { ...Typography.footnote, fontWeight: '700', color: Colors.textPrimary },
  scheduleTag: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  scheduleTagText: { ...Typography.caption, color: Colors.textMuted, fontWeight: '600' },
});
