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
  // ルーティン紐付き予定（自動・手動どちらも）の見出し右端に表示するルーティン名（2026-07-22、
  // デザイン案「複数18: 時間帯アイコン（朝・夕方・夜）」に合わせてtimeGroupの右側・余白の後ろへ
  // 移動）。直接予定（個別種目選択、ルーティン名に相当するものが無い）では渡さない。実績セッション側は
  // workoutSessionsにroutineIdが無く解決できないため、引き続き渡さない
  routineName?: string;
};

// 選択日パネルで同日複数セッションを時間帯ごとに分けて表示するときの見出し
// （デザイン案「複数18: 時間帯アイコン（朝・夕方・夜）」＝時間帯アイコン・時刻・余白・
// ルーティン名の順）。ルーティン名の右寄せ表示は実績セッション側（workoutSessionsに
// routineIdが無く解決できない）ではまだ実現できないため、引き続き保留している。periodは
// sessionStartedAtから一意に決まるためpropとして受け取らず内部で導出する（呼び出し側が
// 矛盾した値を渡す余地を無くすため）
export function SessionTimeGroupHeader({ sessionStartedAt, isSchedule = false, routineName }: Props) {
  const period = getTimeOfDay(new Date(sessionStartedAt));
  const { icon, color } = TIME_OF_DAY_STYLE[period];
  const timeLabel = `${getTimeOfDayLabel(period)} ${formatHourMinute(new Date(sessionStartedAt))}`;
  const accessibilityLabel = [timeLabel, isSchedule ? '予定' : null, routineName].filter(Boolean).join('、');
  return (
    <View style={styles.row} accessible accessibilityRole="header" accessibilityLabel={accessibilityLabel}>
      <View style={styles.timeGroup}>
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
      {/* marginLeft:'auto'でtimeGroupとは反対の右端に押し出す（デザイン案のmargin-left:auto
          そのまま）。ルーティン名は可変長のため、長い名前でも時刻情報側（アイコン・時刻・予定
          ピル）が押し出されて見切れないよう、ルーティン名だけflexShrinkさせる */}
      {routineName ? (
        <Text style={styles.routineName} numberOfLines={1}>
          {routineName}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // このViewは常にcolumn親（wrapper/dayGroup）の唯一の子として置かれ、alignItems:stretchで
  // 全幅になるため、routineNameのmarginLeft:'auto'による右寄せが成立する
  row: { flexDirection: 'row', alignItems: 'center' },
  timeGroup: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 0 },
  label: { ...Typography.footnote, fontWeight: '700', color: Colors.textPrimary },
  // デザイン案通り、時刻ラベル(footnote/13px)より一段小さく控えめなトーンにする
  routineName: { ...Typography.caption, fontWeight: '600', color: Colors.textMuted, marginLeft: 'auto', flexShrink: 1 },
  scheduleTag: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  scheduleTagText: { ...Typography.caption, color: Colors.textMuted, fontWeight: '600' },
});
