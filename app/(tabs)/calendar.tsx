import { CalendarExerciseCard } from '@/components/calendar/calendar-exercise-card';
import { CategoryColorLegend } from '@/components/calendar/category-color-legend';
import { DayEmptyState } from '@/components/calendar/day-empty-state';
import { SwipeableMonthView } from '@/components/calendar/swipeable-month-view';
import { CategoryFilterChips } from '@/components/exercises/category-filter-chips';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ResumeWorkoutBanner } from '@/components/workout/resume-workout-banner';
import { Colors, Typography } from '@/constants/theme';
import { useCalendarDayExercises, type CalendarDayCard } from '@/hooks/use-calendar-day-exercises';
import { useCalendarMonthRecords } from '@/hooks/use-calendar-month-records';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { useWorkoutSessions } from '@/hooks/use-workout-session';
import { addMonths, isSameDay } from '@/lib/calendar/date-grid';
import { CATEGORY_ALL, EXERCISE_CATEGORIES, getCategoryLabel } from '@/lib/exercises/constants';
import { formatMonthGroup, formatSessionDateGroup } from '@/lib/workout/summary';
import { Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// カレンダーのカテゴリフィルターは「全て」+全カテゴリのみ（★お気に入りは種目単位の概念で
// 日別の実施記録には意味を持たないため、種目一覧等と共通のCATEGORY_FILTER_LISTは使わない）
const CALENDAR_FILTER_CATEGORIES = [CATEGORY_ALL, ...EXERCISE_CATEGORIES] as const;

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

  // カテゴリフィルターチップの選択状態。CATEGORY_ALL（絞り込みなし）がデフォルト
  const [activeCategory, setActiveCategory] = useState<string>(CATEGORY_ALL);
  const activeFilter = activeCategory === CATEGORY_ALL ? null : activeCategory;

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
  const { primaryCategoryByDay, categorySetByDay } = useCalendarMonthRecords(rangeStart, rangeEnd);

  const { cards: dayCards, retry: retryDayCards } = useCalendarDayExercises(selectedDate);
  // フィルター中は選択日パネルも該当カテゴリの種目だけに絞る。開始/再開ボタンの出し分け
  // （下のisSelectedToday && dayCards.length===0判定）はフィルターの影響を受けず、
  // その日に実績があるかどうかは常に未フィルターのdayCardsで判定する
  const visibleDayCards: CalendarDayCard[] | null = useMemo(() => {
    if (!Array.isArray(dayCards)) return null;
    if (activeFilter == null) return dayCards;
    return dayCards.filter((c) => c.category === activeFilter);
  }, [dayCards, activeFilter]);

  const pushDebounced = useDebouncedPush();
  const handlePressExercise = useCallback(
    (exerciseId: number) => pushDebounced(`/exercise/${exerciseId}`),
    [pushDebounced],
  );

  const isSelectedToday = isSameDay(selectedDate, today);
  const { activeSession } = useWorkoutSessions();
  // 今日の空状態は進行中セッション(endedAtがnull)のendedAtがnullなためuseCalendarDayExercises
  // 側では「記録なし」に見えている状態でも起こりうる（今日開始したが1セットも確定していない等）。
  // その場合「トレーニングを開始」ボタンのまま無言でそのセッションに合流すると、新規に始めたい
  // ユーザーの意図と実際の挙動がズレるため、記録タブ(app/(tabs)/index.tsx)と同じ
  // ResumeWorkoutBannerに出し分けて「再開」であることを明示する
  const handleResumeToday = useCallback(() => {
    if (activeSession) pushDebounced(`/workout/${activeSession.id}`);
  }, [activeSession, pushDebounced]);
  const handleStartToday = useCallback(() => {
    pushDebounced('/workout/start-chooser');
  }, [pushDebounced]);

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <Stack.Screen
        options={{
          title: formatMonthGroup(new Date(viewed.year, viewed.month, 1).getTime()),
          headerLeft: () => <MonthNavButton direction="prev" onPress={() => goToMonth(-1)} />,
          headerRight: () => <MonthNavButton direction="next" onPress={() => goToMonth(1)} />,
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.filterRow}>
          <CategoryFilterChips
            activeCategory={activeCategory}
            onChange={setActiveCategory}
            categories={CALENDAR_FILTER_CATEGORIES}
          />
        </View>
        <SwipeableMonthView
          year={viewed.year}
          month={viewed.month}
          today={today}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onChangeMonth={goToMonth}
          primaryCategoryByDay={primaryCategoryByDay}
          categorySetByDay={categorySetByDay}
          activeFilter={activeFilter}
        />
        <View style={styles.legend}>
          <CategoryColorLegend />
        </View>

        <View style={styles.dayPanel}>
          <Text style={styles.dayHeading}>
            {formatSessionDateGroup(selectedDate.getTime())}
            {/* その日自体に記録が無ければ絞り込みは無関係なので、Array.isArrayかつ非空のときだけ
                バッジを出す（無いと「フィルターのせいで何も出ていない」と誤読されかねない） */}
            {activeFilter && Array.isArray(dayCards) && dayCards.length > 0 && (
              <Text style={styles.dayHeadingFilter}> （{getCategoryLabel(activeFilter)}で絞り込み中）</Text>
            )}
          </Text>
          {dayCards === null ? (
            <ActivityIndicator style={styles.dayLoading} color={Colors.accent} />
          ) : dayCards === 'error' ? (
            <View style={styles.dayErrorWrapper}>
              <IconSymbol name="exclamationmark.triangle.fill" size={18} color={Colors.danger} />
              <Text style={styles.dayErrorText}>記録を読み込めませんでした</Text>
              <TouchableOpacity
                onPress={retryDayCards}
                accessibilityRole="button"
                accessibilityLabel="再試行"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.dayRetryText}>再試行</Text>
              </TouchableOpacity>
            </View>
          ) : dayCards.length === 0 ? (
            isSelectedToday && activeSession ? (
              <ResumeWorkoutBanner onPress={handleResumeToday} />
            ) : isSelectedToday ? (
              <DayEmptyState buttonIcon="play.fill" actionLabel="トレーニングを開始" onPressAction={handleStartToday} />
            ) : (
              <Text style={styles.dayEmptyText}>記録がありません</Text>
            )
          ) : visibleDayCards!.length === 0 ? (
            <Text style={styles.dayEmptyText}>{getCategoryLabel(activeFilter!)}の記録はありません</Text>
          ) : (
            <View style={styles.dayCardList}>
              {visibleDayCards!.map((card) => (
                <CalendarExerciseCard
                  key={card.workoutSessionExerciseId}
                  exerciseId={card.exerciseId}
                  name={card.name}
                  category={card.category}
                  source={card.source}
                  slug={card.slug}
                  measurementType={card.measurementType}
                  sets={card.sets}
                  isBest={card.isBest}
                  comparison={card.comparison}
                  onPress={handlePressExercise}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
  navButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  filterRow: { marginBottom: 10 },
  legend: { marginTop: 10 },

  dayPanel: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  // 記録タブ(app/(tabs)/index.tsx)の日付グループ見出しと同じ役割（formatSessionDateGroupを
  // 使う日付見出し）のため、同じトークン（caption/textMuted/700）に揃える
  dayHeading: { ...Typography.caption, fontWeight: '700', color: Colors.textMuted, marginBottom: 10 },
  // 絞り込み中バッジはdayHeadingへのネストTextなのでfontWeightだけ通常に戻す（太字が続くと目立ちすぎるため）
  dayHeadingFilter: { fontWeight: '400' },
  dayLoading: { marginTop: 12 },
  dayEmptyText: { ...Typography.body, color: Colors.textMuted },
  dayErrorWrapper: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  dayErrorText: { ...Typography.body, color: Colors.danger },
  dayRetryText: { ...Typography.bodyStrong, color: Colors.accent },
  dayCardList: { gap: 8 },
});
