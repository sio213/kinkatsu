import { Colors, Typography } from '@/constants/theme';
import { WEEKDAY_LABELS } from '@/lib/format';
import { buildMonthGridDates, isSameDay } from '@/lib/calendar/date-grid';
import { memo, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  year: number;
  month: number; // 0-11
  // 「今日」の判定基準。呼び出し元(app/(tabs)/calendar.tsx)で1回だけ生成した値を渡してもらい、
  // このコンポーネント自身では新規生成しない（today算出元を画面全体で1箇所に集約するため）
  today: Date;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
};

// 曜日ラベル行の日曜(index 0)・土曜(index 6)だけ色を付ける。日付の数字自体は
// どの状態（今日・選択中・実施日など）でも曜日色を混ぜず、実施状況の色分けだけに専念させる
// （デザイン案通り、曜日色は見出し行のみの装飾）
function weekdayLabelStyle(index: number) {
  if (index === 0) return styles.sundayLabel;
  if (index === 6) return styles.saturdayLabel;
  return null;
}

export const MonthGrid = memo(function MonthGrid({ year, month, today, selectedDate, onSelectDate }: Props) {
  const dates = useMemo(() => buildMonthGridDates(year, month), [year, month]);

  return (
    <View>
      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label, i) => (
          <Text key={label} style={[styles.weekdayLabel, weekdayLabelStyle(i)]}>
            {label}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {dates.map((date) => {
          const inCurrentMonth = date.getMonth() === month;
          const isToday = isSameDay(date, today);
          const isSelected = isSameDay(date, selectedDate);

          // 前月/翌月の日付は選択対象外（タップしても月を跨いだ選択は今回スコープ外）にし、
          // 表示のみ薄いグレーにする。VoiceOverでも読み上げ対象から外し、当月の日付と
          // 数字が重複して読まれる（月の境界が分からなくなる）のを防ぐ
          if (!inCurrentMonth) {
            return (
              <View key={date.getTime()} style={styles.cellTouchable} importantForAccessibility="no-hide-descendants">
                <View style={styles.cell}>
                  <Text style={[styles.cellText, styles.cellTextMuted]}>{date.getDate()}</Text>
                </View>
              </View>
            );
          }

          return (
            <TouchableOpacity
              key={date.getTime()}
              style={styles.cellTouchable}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel={`${date.getMonth() + 1}月${date.getDate()}日${isToday ? '、今日' : ''}`}
              accessibilityState={{ selected: isSelected }}
              onPress={() => onSelectDate(date)}
            >
              <View style={[styles.cell, isSelected && styles.cellSelectedBorder]}>
                <Text
                  style={[
                    styles.cellText,
                    (isToday || isSelected) && styles.cellTextAccent,
                    isToday && styles.cellTextUnderline,
                  ]}
                >
                  {date.getDate()}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
});

const CELL_WIDTH_PERCENT = `${100 / 7}%` as const;

const styles = StyleSheet.create({
  weekdayRow: { flexDirection: 'row' },
  weekdayLabel: {
    ...Typography.caption,
    fontWeight: '700',
    width: CELL_WIDTH_PERCENT,
    textAlign: 'center',
    color: Colors.textPlaceholder,
    paddingVertical: 4,
  },
  sundayLabel: { color: Colors.danger },
  saturdayLabel: { color: Colors.accent },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cellTouchable: { width: CELL_WIDTH_PERCENT, aspectRatio: 1, padding: 1 },
  cell: {
    flex: 1,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cellSelectedBorder: { borderColor: Colors.accent },
  cellText: { ...Typography.metric, color: Colors.textBody },
  cellTextMuted: { color: Colors.textPlaceholder },
  cellTextAccent: { color: Colors.accent, fontWeight: '800' },
  // デザイン案は下線をセルの枠(border-bottom)ではなく日付の数字自体の
  // text-decorationとして描画している（枠だとborderRadiusの丸みで角が
  // 欠けて見えてしまう）。RNでも同じくTextのtextDecorationLineで表現する
  cellTextUnderline: { textDecorationLine: 'underline', textDecorationColor: Colors.accent },
});
