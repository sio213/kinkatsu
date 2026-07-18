import { IconSymbol } from '@/components/ui/icon-symbol';
import { CategoryColorLegend } from '@/components/calendar/category-color-legend';
import { SwipeableMonthView } from '@/components/calendar/swipeable-month-view';
import { Colors } from '@/constants/theme';
import { useCalendarMonthRecords } from '@/hooks/use-calendar-month-records';
import { addMonths } from '@/lib/calendar/date-grid';
import { formatMonthGroup } from '@/lib/workout/summary';
import { Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function MonthNavButton({
  direction,
  onPress,
}: {
  direction: 'prev' | 'next';
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.navButton}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={direction === 'prev' ? '前の月' : '次の月'}
      onPress={onPress}
    >
      <IconSymbol
        name={direction === 'prev' ? 'chevron.left' : 'chevron.right'}
        size={20}
        color={Colors.textPlaceholder}
      />
    </TouchableOpacity>
  );
}

export default function CalendarScreen() {
  // 「今日」は選択日(selectedDate、タップで変わる)とは別に固定で持つ。MonthGridへ
  // props経由で渡すことで、今日の判定基準を画面全体で1箇所（ここ）に集約する
  const [today] = useState(() => new Date());
  // year/monthを1つのstateにまとめ、年またぎの月送り（12月→翌年1月等）を
  // addMonthsの結果でアトミックに更新する（year/monthを別state・別setterにすると
  // 更新タイミングがズレて年またぎ計算が崩れるため）
  const [viewed, setViewed] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selectedDate, setSelectedDate] = useState(today);

  const goToMonth = useCallback((delta: number) => {
    setViewed((prev) => addMonths(prev.year, prev.month, delta));
  }, []);

  // SwipeableMonthViewは前月/当月/翌月の3ヶ月分を同時に描画するため、実績データも
  // その3ヶ月分をまとめて1回のクエリで取得する（月ごとに3クエリ張るとスワイプ時に
  // 無駄な再購読が増えるため）
  const { rangeStart, rangeEnd } = useMemo(() => {
    const start = addMonths(viewed.year, viewed.month, -1);
    const endExclusive = addMonths(viewed.year, viewed.month, 2);
    return {
      rangeStart: new Date(start.year, start.month, 1).getTime(),
      rangeEnd: new Date(endExclusive.year, endExclusive.month, 1).getTime(),
    };
  }, [viewed.year, viewed.month]);
  const dayCategories = useCalendarMonthRecords(rangeStart, rangeEnd);

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <Stack.Screen
        options={{
          title: formatMonthGroup(new Date(viewed.year, viewed.month, 1).getTime()),
          headerLeft: () => <MonthNavButton direction="prev" onPress={() => goToMonth(-1)} />,
          headerRight: () => <MonthNavButton direction="next" onPress={() => goToMonth(1)} />,
        }}
      />
      <View style={styles.content}>
        <SwipeableMonthView
          year={viewed.year}
          month={viewed.month}
          today={today}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onChangeMonth={goToMonth}
          dayCategories={dayCategories}
        />
        <View style={styles.legend}>
          <CategoryColorLegend />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 16, paddingTop: 8 },
  navButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  legend: { marginTop: 10 },
});
