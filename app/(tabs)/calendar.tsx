import { CalendarExerciseCard } from '@/components/calendar/calendar-exercise-card';
import { CategoryColorLegend } from '@/components/calendar/category-color-legend';
import { DayEmptyState } from '@/components/calendar/day-empty-state';
import { RoutineScheduleCard } from '@/components/calendar/routine-schedule-card';
import { SessionTimeGroupHeader } from '@/components/calendar/session-time-group-header';
import { SkippedReminderCard } from '@/components/calendar/skipped-reminder-card';
import { SwipeableMonthView } from '@/components/calendar/swipeable-month-view';
import { CategoryFilterChips } from '@/components/exercises/category-filter-chips';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { AddExerciseButton } from '@/components/workout/add-exercise-button';
import { ResumeWorkoutBanner } from '@/components/workout/resume-workout-banner';
import { Colors, Typography } from '@/constants/theme';
import type { Reminder } from '@/db/schema';
import { useCalendarDayExercises, type CalendarDayCard } from '@/hooks/use-calendar-day-exercises';
import { useCalendarDayManualSchedule, type ManualScheduleCard } from '@/hooks/use-calendar-day-manual-schedule';
import { useCalendarDaySchedule, type DaySchedule } from '@/hooks/use-calendar-day-schedule';
import { useCalendarMonthRecords } from '@/hooks/use-calendar-month-records';
import { useCalendarMonthSchedule } from '@/hooks/use-calendar-month-schedule';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { useStartRoutineWithConfirm } from '@/hooks/use-start-routine-with-confirm';
import { useWorkoutSessions } from '@/hooks/use-workout-session';
import { addMonths, isSameDay, toDateKey } from '@/lib/calendar/date-grid';
import { CATEGORY_ALL, EXERCISE_CATEGORIES } from '@/lib/exercises/constants';
import { buildTodayTimeline, groupCardsBySession } from '@/lib/calendar/session-groups';
import { mergeScheduleCards, type UnifiedScheduleCard } from '@/lib/calendar/schedule';
import { formatHourMinute, formatHourMinuteParts, timeOfDayOffsetMs } from '@/lib/calendar/time-of-day';
import { formatKindSummary } from '@/lib/notifications/format';
import { skipReminderOccurrence, unskipReminderOccurrence } from '@/lib/notifications/reminder-skip-scheduler';
import { removeScheduledWorkout } from '@/lib/notifications/scheduled-workout-scheduler';
import { formatMonthGroup, formatSessionDateGroup } from '@/lib/workout/summary';
import { Stack } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// カレンダーのカテゴリフィルターは「全て」+全カテゴリのみ（★お気に入りは種目単位の概念で
// 日別の実施記録には意味を持たないため、種目一覧等と共通のCATEGORY_FILTER_LISTは使わない）
const CALENDAR_FILTER_CATEGORIES = [CATEGORY_ALL, ...EXERCISE_CATEGORIES] as const;

// 過去日選択時に予定を握りつぶす際の固定参照（毎レンダー新しい配列を作らないことで
// 依存するuseMemoの不要な再計算を避ける）
const EMPTY_SCHEDULE: DaySchedule = { cards: [], skipped: [] };
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

// UnifiedScheduleCard（lib/calendar/schedule.tsのmergeScheduleCards出力）を
// RoutineScheduleCardのpropsへ変換する部分を今日パネル・未来日パネルで共有する
// （oneTime/onDeleteの分岐がJSX2箇所に複製されていた、PRレビュー指摘対応）。
// cardを通常の関数引数として受け取ることで、source==='manual'の絞り込みが
// scheduledWorkoutId参照までそのまま効く（entry.card.xxxのような複合参照だとTSが
// 絞り込みを保持できずIIFEが必要だった、PRレビュー指摘対応）
// ReturnType<typeof mergeScheduleCards>はmergeScheduleCardsの型パラメータ制約
// （reminder: unknown）で解決されてしまい、card.reminderへのプロパティアクセスが
// 効かなくなる（実際の呼び出し箇所のcardは型推論で正しくReminderになるため問題なかったが、
// このコンポーネント内でcard.reminder.idにアクセスする際に顕在化した）。呼び出し元
// （lib/calendar/schedule.tsのUnifiedScheduleCard）をReminderで具体化して参照する
type MergedScheduleCard = UnifiedScheduleCard<Reminder>;
function ScheduleEntryCard({
  card,
  timeLabel,
  onPress,
  onPressStart,
  onDelete,
  onSkip,
  onReplace,
}: {
  card: MergedScheduleCard;
  timeLabel: string;
  onPress: () => void;
  onPressStart?: () => void;
  onDelete: (scheduledWorkoutId: number, routineName: string) => void;
  // リマインダー予定の⋮メニュー「今回だけスキップ」用（PR10-6a）
  onSkip: (reminderId: number) => void;
  // リマインダー予定の⋮メニュー「今回だけ差し替え」用（PR10-6b）
  onReplace: (reminderId: number, routineName: string, hour: number, minute: number) => void;
}) {
  return (
    <RoutineScheduleCard
      routineName={card.routineName}
      categories={card.categories}
      exerciseCount={card.exerciseCount}
      timeLabel={timeLabel}
      onPress={onPress}
      onPressStart={onPressStart}
      oneTime={card.source === 'manual'}
      // 手動予定は削除、リマインダー予定はスキップ・差し替え——出所ごとに⋮メニューの中身が異なる
      // （RoutineScheduleCard側もonDelete/onSkip・onReplaceを排他的な入力として扱う）
      onDelete={card.source === 'manual' ? () => onDelete(card.scheduledWorkoutId, card.routineName) : undefined}
      onSkip={card.source === 'reminder' ? () => onSkip(card.reminder.id) : undefined}
      onReplace={
        card.source === 'reminder'
          ? () => onReplace(card.reminder.id, card.routineName, card.hour, card.minute)
          : undefined
      }
    />
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
  // 「予定を表示する日か」の判定は複数箇所（daySchedule/manualSchedule/mergedSchedule）で
  // 同じ式を繰り返さないよう1つにまとめる（PRレビュー指摘対応）
  const showsSchedule = isSelectedToday || isFutureDay;
  const rawDaySchedule = useCalendarDaySchedule(selectedDate);
  const daySchedule: DaySchedule = showsSchedule ? rawDaySchedule : EMPTY_SCHEDULE;
  // 手動予定（PR10）はPR10-4より今日も対象に含める（今日になった瞬間パネルから消えていた
  // 既知バグの修正）。daySchedule同様、過去日だけ空に握りつぶす
  const rawManualSchedule = useCalendarDayManualSchedule(selectedDate);
  const manualSchedule: ManualScheduleCard[] = showsSchedule ? rawManualSchedule : EMPTY_MANUAL_SCHEDULE;
  // 同じルーティンがリマインダー予定・手動予定の両方にあると同一予定が二重に見えるため、
  // routineId単位で手動予定を優先し重複を畳む（lib/calendar/schedule.tsのmergeScheduleCards、
  // 2026-07-19確定。「胸→背中に差し替え」のような別ルーティンへの打ち消しはdedupeの対象外、
  // PR10-6の「今回だけスキップ」は別レイヤー(daySchedule.skipped)で扱う）。今日・未来日どちらも
  // 同じ統合結果を使う（PR10-4で今日パネルにも適用範囲を拡張）。daySchedule/manualScheduleが
  // 既にEMPTY_*に握りつぶされているため、ここでshowsScheduleを再度見る必要は無い
  // （過去日はmergeScheduleCards(EMPTY, EMPTY)が[]を返すので自然に空になる）
  const mergedSchedule = useMemo(
    () => mergeScheduleCards(daySchedule.cards, manualSchedule),
    [daySchedule, manualSchedule],
  );
  const todayTimeline = useMemo(
    () =>
      isSelectedToday
        ? buildTodayTimeline(dayCardGroups, mergedSchedule, selectedDayStart)
        : [],
    [isSelectedToday, dayCardGroups, mergedSchedule, selectedDayStart],
  );
  // スキップ済みゴーストカード(daySchedule.skipped)を、アクティブな予定/実績と同じ時刻順の
  // 1つのリストに統合する（@reviewer指摘: 別ループでリスト末尾にまとめて描画すると、時刻の
  // 早い予定をスキップした場合にゴーストが遅い時刻のカードより下に来てしまい、一日の流れを
  // 直感的に追えなくなる）。buildTodayTimeline(session-groups.ts、実績セッションとの統合も担う
  // 共有の純粋関数)の型は変更せず、その出力とゴーストをこのコンポーネント内だけでマージする
  const todayDisplayEntries = useMemo(
    () =>
      [
        ...todayTimeline.map((entry) => ({ kind: 'timeline' as const, key: entry.key, sortAt: entry.sortAt, entry })),
        ...daySchedule.skipped.map((s) => ({
          kind: 'skipped' as const,
          key: `skip-${s.reminderId}`,
          sortAt: selectedDayStart + timeOfDayOffsetMs(s.hour, s.minute),
          skipped: s,
        })),
      ].sort((a, b) => a.sortAt - b.sortAt),
    [todayTimeline, daySchedule.skipped, selectedDayStart],
  );
  const futureDisplayEntries = useMemo(
    () =>
      [
        ...mergedSchedule.map((card) => ({
          kind: 'card' as const,
          key: card.key,
          sortAt: timeOfDayOffsetMs(card.hour, card.minute),
          card,
        })),
        ...daySchedule.skipped.map((s) => ({
          kind: 'skipped' as const,
          key: `skip-${s.reminderId}`,
          sortAt: timeOfDayOffsetMs(s.hour, s.minute),
          skipped: s,
        })),
      ].sort((a, b) => a.sortAt - b.sortAt),
    [mergedSchedule, daySchedule.skipped],
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
  // 手動予定カードの⋮メニュー「削除」用（PR10-3、PR10-5で通知キャンセルも合わせて行うよう変更）。
  // app/routine/index.tsxのhandleDeleteやsession-exercise-card.tsxのhandleDeleteExerciseと同じ
  // Alert確認→try/catch+Alert.alertパターン。削除後はuseCalendarDayManualSchedule/
  // useCalendarMonthScheduleがuseLiveQueryで自動再購読するため、追加の状態更新は不要
  // （LayoutAnimationは非同期のDB書き込み・再購読を挟むと配置タイミングがずれ効かないため、
  // 他の非同期削除処理と同じくここでは使わない）
  const handleDeleteSchedule = useCallback((scheduledWorkoutId: number, routineName: string) => {
    Alert.alert(
      'この予定を削除しますか？',
      `「${routineName}」の予定を削除します。ルーティン自体や記録には影響しませんが、設定していた通知も届かなくなります。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeScheduledWorkout(scheduledWorkoutId);
            } catch (e) {
              console.error('[delete scheduled workout]', e);
              Alert.alert('エラー', '予定を削除できませんでした。');
            }
          },
        },
      ],
    );
  }, []);

  // リマインダー予定の⋮メニュー「今回だけスキップ」用（PR10-6a）。取り消せる操作
  // （ゴーストカードの「元に戻す」で戻せる）なので、手動予定の削除と違い確認Alertを挟まない
  // （@designer方針: 気軽に試して気軽に戻せることを優先）。日付は選択日で確定済み。
  // PR10-6cにより、毎日/毎週/単純な毎月の「ネイティブ方式」リマインダーも一時的にキュー方式へ
  // 切り替えることで該当日の通知を止められるようになった。notificationSuppressed=falseは
  // トリガー方式による既知の制約ではなく通知API側の想定外エラーのみを意味するため、
  // その場合はその場で一言知らせる（@reviewer指摘: 無言だと「スキップしたのに鳴った」で信頼を損なう）
  const handleSkipReminder = useCallback(
    async (reminderId: number) => {
      try {
        const { notificationSuppressed } = await skipReminderOccurrence(reminderId, toDateKey(selectedDate));
        if (!notificationSuppressed) {
          Alert.alert(
            '予定をスキップしました',
            // タイトル(成功)と本文(注意喚起)が混在すると結局成功したのか不安になるとの指摘への
            // 対応として、本文冒頭で「表示のスキップ自体は完了している」ことを明示する(@reviewer指摘)。
            // PR10-6cにより、この分岐に入るのはトリガー方式による既知の制約ではなく通知API側の
            // 想定外エラーのみになったため、原因もそれに合わせた文言にする
            // 「通知の停止処理」という表現は不正確——ネイティブ方式の実体はcancelReminderOsNotifications
            // (個別に.catch(()=>{})で握りつぶすため実質失敗しない)ではなく、その後の一時キュー化で
            // 新しい通知を登録するscheduleQueueNotification側が失敗している可能性が高い(@reviewer指摘)
            'スキップ自体は完了しています。ただし新しい通知の登録処理に失敗した可能性があるため、念のため指定時刻に通知が届いていないかご確認ください。',
          );
        }
      } catch (e) {
        console.error('[skip reminder occurrence]', e);
        Alert.alert('エラー', '予定をスキップできませんでした。');
      }
    },
    [selectedDate],
  );
  // スキップ済みゴーストカードの「元に戻す」用。unskipReminderOccurrence自体は
  // (skipReminderOccurrenceと違い)TOCTOU対策を持たないため、連打すると
  // cancelExistingNotificationsForDate→scheduleQueueNotificationの区間が競合し
  // 通知が二重登録されうる(@reviewer/@tester指摘)。schedule-time-picker.tsxのisSubmittingRefと
  // 同じ「同期refで多重起動を防ぐ」パターンをここでも使う。reminderIdごとに独立して連打防止する
  // 必要があるため(複数のゴーストカードを別々に操作しうる)、単一boolean refではなくSetで管理する
  const undoInFlightRef = useRef<Set<number>>(new Set());
  const handleUndoSkipReminder = useCallback(
    async (reminderId: number) => {
      if (undoInFlightRef.current.has(reminderId)) return;
      undoInFlightRef.current.add(reminderId);
      try {
        await unskipReminderOccurrence(reminderId, toDateKey(selectedDate));
      } catch (e) {
        console.error('[unskip reminder occurrence]', e);
        Alert.alert('エラー', 'スキップを元に戻せませんでした。');
      } finally {
        undoInFlightRef.current.delete(reminderId);
      }
    },
    [selectedDate],
  );
  // リマインダー予定の⋮メニュー「今回だけ差し替え」用（PR10-6b）。ここではまだ何もDBを
  // 変更せず、既存の「予定を追加」フロー（schedule-routine-picker→schedule-time-picker）を
  // 差し替えパラメータ付きで再利用するだけ。実際のスキップ+手動予定追加はschedule-time-picker.tsxの
  // 確定操作まで遅延させる（途中で戻る操作をした場合に元のリマインダー予定が無言で消えたままに
  // ならないようにするため）
  const handlePressReplace = useCallback(
    (reminderId: number, routineName: string, hour: number, minute: number) =>
      pushDebounced({
        pathname: '/calendar/schedule-routine-picker',
        params: {
          dateKey: toDateKey(selectedDate),
          replaceReminderId: String(reminderId),
          replaceRoutineName: routineName,
          replaceHour: String(hour),
          replaceMinute: String(minute),
        },
      }),
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
              {todayDisplayEntries.length === 0 ? (
                !activeSession && (
                  <DayEmptyState buttonIcon="play.fill" actionLabel="トレーニングを開始" onPressAction={handleStartToday} />
                )
              ) : (
                <>
                  {todayDisplayEntries.map((item) => {
                    if (item.kind === 'skipped') {
                      return (
                        <SkippedReminderCard
                          key={item.key}
                          routineName={item.skipped.routineName}
                          timeLabel={`今日 ${formatHourMinuteParts(item.skipped.hour, item.skipped.minute)}`}
                          onUndo={() => handleUndoSkipReminder(item.skipped.reminderId)}
                        />
                      );
                    }
                    const entry = item.entry;
                    if (entry.kind === 'session') {
                      return (
                        <View key={item.key} style={styles.dayGroup}>
                          {todayTimeline.length > 1 && <SessionTimeGroupHeader sessionStartedAt={entry.group.sessionStartedAt} />}
                          <DayCardList cards={entry.group.cards} onPressExercise={handlePressExercise} />
                        </View>
                      );
                    }
                    // 予定エントリは常にentry1件=カード1枚（グルーピングされない）で、
                    // RoutineScheduleCard自身が時刻バッジを持つため、SessionTimeGroupHeaderを
                    // 重ねると同じ時刻が2回表示されてしまっていた（@designer指摘、PR10-4で削除）
                    return (
                      <View key={item.key} style={styles.dayGroup}>
                        <ScheduleEntryCard
                          card={entry.card}
                          timeLabel={`今日 ${formatHourMinute(new Date(entry.sortAt))}`}
                          onPress={() => handlePressRoutine(entry.card.routineId)}
                          onPressStart={() => handleStartRoutine(entry.card.routineId, entry.card.routineName)}
                          onDelete={handleDeleteSchedule}
                          onSkip={handleSkipReminder}
                          onReplace={handlePressReplace}
                        />
                      </View>
                    );
                  })}
                  <AddExerciseButton
                    onPress={handlePressAddSchedule}
                    label="予定を追加"
                    accessibilityLabel="予定を追加"
                  />
                </>
              )}
            </View>
          ) : isFutureDay ? (
            futureDisplayEntries.length === 0 ? (
              <DayEmptyState
                buttonIcon="plus"
                actionLabel="予定を追加"
                text="予定がありません"
                onPressAction={handlePressAddSchedule}
              />
            ) : (
              <View style={styles.dayCardList}>
                {futureDisplayEntries.map((item) =>
                  item.kind === 'skipped' ? (
                    <SkippedReminderCard
                      key={item.key}
                      routineName={item.skipped.routineName}
                      timeLabel={formatHourMinuteParts(item.skipped.hour, item.skipped.minute)}
                      onUndo={() => handleUndoSkipReminder(item.skipped.reminderId)}
                    />
                  ) : (
                    <ScheduleEntryCard
                      key={item.key}
                      card={item.card}
                      timeLabel={
                        item.card.source === 'reminder'
                          ? formatKindSummary(item.card.reminder)
                          : formatHourMinuteParts(item.card.hour, item.card.minute)
                      }
                      onPress={() => handlePressRoutine(item.card.routineId)}
                      onDelete={handleDeleteSchedule}
                      onSkip={handleSkipReminder}
                      onReplace={handlePressReplace}
                    />
                  ),
                )}
                <AddExerciseButton
                  onPress={handlePressAddSchedule}
                  label="予定を追加"
                  accessibilityLabel="予定を追加"
                />
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
});
