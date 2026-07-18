import { IconSymbol } from '@/components/ui/icon-symbol';
import { SwipeableMonthView } from '@/components/calendar/swipeable-month-view';
import { Colors } from '@/constants/theme';
import { addMonths } from '@/lib/calendar/date-grid';
import { formatMonthGroup } from '@/lib/workout/summary';
import { Stack } from 'expo-router';
import { useCallback, useState } from 'react';
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
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 16, paddingTop: 8 },
  navButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
