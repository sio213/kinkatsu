import { CalendarExerciseCard } from '@/components/calendar/calendar-exercise-card';
import { CategoryColorLegend } from '@/components/calendar/category-color-legend';
import { DayEmptyState } from '@/components/calendar/day-empty-state';
import { RoutineScheduleCard } from '@/components/calendar/routine-schedule-card';
import { SessionTimeGroupHeader } from '@/components/calendar/session-time-group-header';
import { SwipeableMonthView } from '@/components/calendar/swipeable-month-view';
import { CategoryFilterChips } from '@/components/exercises/category-filter-chips';
import { DesignIcon } from '@/components/ui/design-icon';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ResumeWorkoutBanner } from '@/components/workout/resume-workout-banner';
import { Colors, Typography } from '@/constants/theme';
import { useCalendarDayExercises, type CalendarDayCard } from '@/hooks/use-calendar-day-exercises';
import { useCalendarDayManualSchedule, type ManualScheduleCard } from '@/hooks/use-calendar-day-manual-schedule';
import { useCalendarDaySchedule, type DayScheduleCard } from '@/hooks/use-calendar-day-schedule';
import { useCalendarMonthRecords } from '@/hooks/use-calendar-month-records';
import { useCalendarMonthSchedule } from '@/hooks/use-calendar-month-schedule';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { useStartRoutineWithConfirm } from '@/hooks/use-start-routine-with-confirm';
import { useWorkoutSessions } from '@/hooks/use-workout-session';
import { addMonths, isSameDay, toDateKey } from '@/lib/calendar/date-grid';
import { CATEGORY_ALL, EXERCISE_CATEGORIES } from '@/lib/exercises/constants';
import { buildTodayTimeline, groupCardsBySession } from '@/lib/calendar/session-groups';
import { mergeScheduleCards } from '@/lib/calendar/schedule';
import { formatHourMinute, formatHourMinuteParts } from '@/lib/calendar/time-of-day';
import { formatKindSummary } from '@/lib/notifications/format';
import { formatMonthGroup, formatSessionDateGroup } from '@/lib/workout/summary';
import { Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// カレンダーのカテゴリフィルターは「全て」+全カテゴリのみ（★お気に入りは種目単位の概念で
// 日別の実施記録には意味を持たないため、種目一覧等と共通のCATEGORY_FILTER_LISTは使わない）
const CALENDAR_FILTER_CATEGORIES = [CATEGORY_ALL, ...EXERCISE_CATEGORIES] as const;

// 過去日選択時に予定を握りつぶす際の固定参照（毎レンダー新しい配列を作らないことで
// 依存するuseMemoの不要な再計算を避ける）
const EMPTY_SCHEDULE: DayScheduleCard[] = [];
const EMPTY_MANUAL_SCHEDULE: ManualScheduleCard[] = [];

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

// 未来日パネルの予定リスト末尾に置く控えめな追加ボタン。DayEmptyStateの「予定を追加」は
// 予定が0件の日にしか出ないため、既に1件以上ある日に2件目以降を追加する導線が無かった
// （PRレビュー指摘対応）。見た目はcomponents/routines/routine-add-exercise-button.tsxの
// ghostバリアント（一覧末尾の控えめな追加ボタン）に合わせるが、ラベルが「種目を追加」固定で
// 汎用化されていないため、あちらを流用せずスタイルだけ揃えてこの画面内に定義する
function AddScheduleGhostButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.addScheduleGhost}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="予定を追加"
      hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
    >
      <DesignIcon name="add-circle" size={18} color={Colors.accent} />
      <Text style={styles.addScheduleGhostText}>予定を追加</Text>
    </TouchableOpacity>
  );
}

// 時間帯グループ表示・フラット表示のどちらでもカード列の描画は同一のため共有する
// （CalendarExerciseCardへ渡すpropsを2箇所に重複させない）
function DayCardList({
  cards,
  onPressExercise,
}: {
  cards: CalendarDayCard[];
  onPressExercise: (exerciseId: number) => void;
}) {
  return (
    <View style={styles.dayCardList}>
      {cards.map((card) => (
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
          onPress={onPressExercise}
        />
      ))}
    </View>
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
  // 予定（ルーティン紐付きリマインダー由来）はtodayStart以降のみを対象にする
  // （過去日は上のuseCalendarMonthRecordsが担当する実績のみを表示する）
  const todayStart = useMemo(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime(), [today]);
  const { primaryCategoryByScheduleDay, categorySetByScheduleDay } = useCalendarMonthSchedule(
    rangeStart,
    rangeEnd,
    todayStart,
  );

  // カテゴリフィルターは月グリッドのマーカー表示だけに作用する（デザイン案「確定：カテゴリ
  // フィルタ適用」の仕様通り）。選択日パネルはフィルターの影響を受けず常に全記録を表示する
  const { cards: dayCards, retry: retryDayCards } = useCalendarDayExercises(selectedDate);
  // 同日に複数セッションがある場合だけ、セッション単位（時刻の早い順）でグルーピングして
  // 時間帯見出しを表示する（デザイン案「複数18」）。1セッションのみの日は見出しを出さず
  // 従来通りのフラットな一覧のままにする（1件しかないのに時刻見出しを出す価値が薄いため）
  const dayCardGroups = useMemo(
    () => (Array.isArray(dayCards) ? groupCardsBySession(dayCards) : []),
    [dayCards],
  );

  const isSelectedToday = isSameDay(selectedDate, today);
  const selectedDayStart = useMemo(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()).getTime(),
    [selectedDate],
  );
  // 予定は「今日以降」だけが対象（過去日は実績のみを表示する既存仕様、2026-07-19確定）。
  // useCalendarDaySchedule自体は日付の前後関係を知らず選択日の発火有無だけを返すため、
  // 過去日のときはここで結果を空配列に握りつぶす。EMPTY_SCHEDULEで参照を固定し、
  // 過去日を選んでいる間はdaySchedule/todayTimelineのuseMemoが毎回再計算されないようにする
  const isFutureDay = selectedDayStart > todayStart;
  const rawDaySchedule = useCalendarDaySchedule(selectedDate);
  const daySchedule: DayScheduleCard[] = isSelectedToday || isFutureDay ? rawDaySchedule : EMPTY_SCHEDULE;
  // 手動予定（PR10）は今のところ未来日パネルのみ対象（今日タイムラインへの統合は後続PR）
  const rawManualSchedule = useCalendarDayManualSchedule(selectedDate);
  const manualSchedule: ManualScheduleCard[] = isFutureDay ? rawManualSchedule : EMPTY_MANUAL_SCHEDULE;
  // 同じルーティンがリマインダー予定・手動予定の両方にあると同一予定が二重に見えるため、
  // routineId単位で手動予定を優先し重複を畳む（lib/calendar/schedule.tsのmergeScheduleCards、
  // 2026-07-19確定。「リマインダー予定自体を打ち消す」機能は別スコープ）
  const futureDaySchedule = useMemo(
    () => (isFutureDay ? mergeScheduleCards(daySchedule, manualSchedule) : []),
    [isFutureDay, daySchedule, manualSchedule],
  );
  const todayTimeline = useMemo(
    () =>
      isSelectedToday
        ? buildTodayTimeline(dayCardGroups, daySchedule, selectedDayStart)
        : [],
    [isSelectedToday, dayCardGroups, daySchedule, selectedDayStart],
  );

  const pushDebounced = useDebouncedPush();
  const handlePressExercise = useCallback(
    (exerciseId: number) => pushDebounced(`/exercise/${exerciseId}`),
    [pushDebounced],
  );
  const handlePressRoutine = useCallback(
    (routineId: number) => pushDebounced(`/routine/edit/${routineId}`),
    [pushDebounced],
  );
  // 未来日パネルの「予定を追加」ボタン用（PR10）。日付は選択日で確定済みのため
  // ルーティン選択画面（app/calendar/schedule-routine-picker.tsx）へdateKeyだけ渡す
  const handlePressAddSchedule = useCallback(
    () => pushDebounced({ pathname: '/calendar/schedule-routine-picker', params: { dateKey: toDateKey(selectedDate) } }),
    [pushDebounced, selectedDate],
  );

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

  // 今日の予定カードの「開始」ボタン用。進行中セッションがある場合の確認ダイアログを含む
  // ロジックはuseStartRoutineWithConfirmに共通化してある（ルーティン一覧のカード
  // 「開始」ボタンと挙動が同一のため）
  const handleStartRoutine = useStartRoutineWithConfirm(activeSession, (sessionId) => pushDebounced(`/workout/${sessionId}`));

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
          primaryCategoryByScheduleDay={primaryCategoryByScheduleDay}
          categorySetByScheduleDay={categorySetByScheduleDay}
          activeFilter={activeFilter}
        />
        <View style={styles.legend}>
          <CategoryColorLegend />
        </View>
        {/* 予定（リング/ドット表現）が実際に画面上にある場合だけ表示する。予定を使っていない
            （＝ルーティン紐付きリマインダーも手動予定も無い）ユーザーには不要な説明のため
            常時表示にはしない（@designer指摘: 塗り=実施/リング・ドット=予定の凡例が無いと
            初見で誤読されるおそれがあるとの指摘への対応）。手動予定(PR10)もリング/ドットに
            反映されるようになったため「リマインダー由来」の限定は外す */}
        {primaryCategoryByScheduleDay.size > 0 && (
          <Text style={styles.scheduleLegendHint}>塗りつぶし＝実施済み、輪郭・点＝予定</Text>
        )}

        <View style={styles.dayPanel}>
          <Text style={styles.dayHeading}>{formatSessionDateGroup(selectedDate.getTime())}</Text>
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
          ) : isSelectedToday ? (
            <View style={styles.dayGroupList}>
              {/* 進行中セッションがある場合は、実績・予定の有無にかかわらず常にバナーを出す
                  （PR6で発見したバグ「無言で古いセッションに合流」の再発防止を、実績+予定が
                  混在するようになった今回のPR9-2でも一貫させる） */}
              {activeSession && <ResumeWorkoutBanner onPress={handleResumeToday} />}
              {todayTimeline.length === 0 ? (
                !activeSession && (
                  <DayEmptyState buttonIcon="play.fill" actionLabel="トレーニングを開始" onPressAction={handleStartToday} />
                )
              ) : (
                todayTimeline.map((entry) =>
                  entry.kind === 'session' ? (
                    <View key={entry.key} style={styles.dayGroup}>
                      {todayTimeline.length > 1 && <SessionTimeGroupHeader sessionStartedAt={entry.group.sessionStartedAt} />}
                      <DayCardList cards={entry.group.cards} onPressExercise={handlePressExercise} />
                    </View>
                  ) : (
                    <View key={entry.key} style={styles.dayGroup}>
                      {todayTimeline.length > 1 && <SessionTimeGroupHeader sessionStartedAt={entry.sortAt} isSchedule />}
                      <RoutineScheduleCard
                        routineName={entry.card.routineName}
                        categories={entry.card.categories}
                        exerciseCount={entry.card.exerciseCount}
                        timeLabel={`今日 ${formatHourMinute(new Date(entry.sortAt))}`}
                        onPress={() => handlePressRoutine(entry.card.routineId)}
                        onPressStart={() => handleStartRoutine(entry.card.routineId, entry.card.routineName)}
                      />
                    </View>
                  ),
                )
              )}
            </View>
          ) : isFutureDay ? (
            futureDaySchedule.length === 0 ? (
              <DayEmptyState
                buttonIcon="plus"
                actionLabel="予定を追加"
                text="予定がありません"
                onPressAction={handlePressAddSchedule}
              />
            ) : (
              <View style={styles.dayCardList}>
                {futureDaySchedule.map((card) => (
                  <RoutineScheduleCard
                    key={card.key}
                    routineName={card.routineName}
                    categories={card.categories}
                    exerciseCount={card.exerciseCount}
                    timeLabel={card.source === 'reminder' ? formatKindSummary(card.reminder) : formatHourMinuteParts(card.hour, card.minute)}
                    onPress={() => handlePressRoutine(card.routineId)}
                    oneTime={card.source === 'manual'}
                  />
                ))}
                <AddScheduleGhostButton onPress={handlePressAddSchedule} />
              </View>
            )
          ) : dayCards.length === 0 ? (
            <Text style={styles.dayEmptyText}>記録がありません</Text>
          ) : dayCardGroups.length > 1 ? (
            <View style={styles.dayGroupList}>
              {dayCardGroups.map((group) => (
                <View key={group.sessionId} style={styles.dayGroup}>
                  <SessionTimeGroupHeader sessionStartedAt={group.sessionStartedAt} />
                  <DayCardList cards={group.cards} onPressExercise={handlePressExercise} />
                </View>
              ))}
            </View>
          ) : (
            <DayCardList cards={dayCards} onPressExercise={handlePressExercise} />
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
  scheduleLegendHint: { ...Typography.caption, color: Colors.textPlaceholder, marginTop: 6 },

  dayPanel: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  // 記録タブ(app/(tabs)/index.tsx)の日付グループ見出しと同じ役割（formatSessionDateGroupを
  // 使う日付見出し）のため、同じトークン（caption/textMuted/700）に揃える
  dayHeading: { ...Typography.caption, fontWeight: '700', color: Colors.textMuted, marginBottom: 10 },
  dayLoading: { marginTop: 12 },
  dayEmptyText: { ...Typography.body, color: Colors.textMuted },
  dayErrorWrapper: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  dayErrorText: { ...Typography.body, color: Colors.danger },
  dayRetryText: { ...Typography.bodyStrong, color: Colors.accent },
  dayCardList: { gap: 8 },
  // 時間帯グループ間の余白はデザイン案「複数18」のheight:12px相当
  dayGroupList: { gap: 12 },
  dayGroup: { gap: 8 },
  // components/routines/routine-add-exercise-button.tsxのghostバリアントと同じ見た目
  addScheduleGhost: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    width: '100%',
    backgroundColor: Colors.accentSurface,
    borderRadius: 8,
    paddingVertical: 11,
  },
  addScheduleGhostText: { ...Typography.footnote, fontWeight: '600', color: Colors.accent },
});
