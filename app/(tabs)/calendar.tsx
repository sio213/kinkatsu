import { CalendarExerciseCard } from '@/components/calendar/calendar-exercise-card';
import { CategoryColorLegend } from '@/components/calendar/category-color-legend';
import { DayEmptyState } from '@/components/calendar/day-empty-state';
import { ReminderScheduleExerciseGroup } from '@/components/calendar/reminder-schedule-exercise-group';
import { ScheduledWorkoutExerciseGroup } from '@/components/calendar/scheduled-workout-exercise-group';
import { SessionTimeGroupHeader } from '@/components/calendar/session-time-group-header';
import { SwipeableMonthView } from '@/components/calendar/swipeable-month-view';
import { CategoryFilterChips } from '@/components/exercises/category-filter-chips';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { PrimaryButton } from '@/components/ui/primary-button';
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
import { useStartWithConfirm } from '@/hooks/use-start-with-confirm';
import { useTickingNow } from '@/hooks/use-ticking-now';
import { useResumeWorkoutSummary, useWorkoutSessions } from '@/hooks/use-workout-session';
import { addMonths, isSameDay, toDateKey } from '@/lib/calendar/date-grid';
import { CATEGORY_ALL, EXERCISE_CATEGORIES } from '@/lib/exercises/constants';
import { buildTodayTimeline, groupCardsBySession } from '@/lib/calendar/session-groups';
import { excludeActiveScheduledCard, mergeScheduleCards, type UnifiedScheduleCard } from '@/lib/calendar/schedule';
import { materializeReminderOccurrence } from '@/lib/notifications/scheduled-workout-scheduler';
import { startWorkoutFromScheduledWorkout } from '@/lib/workout/session';
import { formatElapsedClock, formatMonthGroup, formatSessionDateGroup } from '@/lib/workout/summary';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// カレンダーのカテゴリフィルターは「全て」+全カテゴリのみ（★お気に入りは種目単位の概念で
// 日別の実施記録には意味を持たないため、種目一覧等と共通のCATEGORY_FILTER_LISTは使わない）
const CALENDAR_FILTER_CATEGORIES = [CATEGORY_ALL, ...EXERCISE_CATEGORIES] as const;

// 過去日選択時に予定を握りつぶす際の固定参照（毎レンダー新しい配列を作らないことで
// 依存するuseMemoの不要な再計算を避ける）
const EMPTY_SCHEDULE: DaySchedule = { cards: [] };
const EMPTY_MANUAL_SCHEDULE: ManualScheduleCard[] = [];

// 今日パネル・過去日パネル（単一/複数セッションどちらも）で共通のDayCardList呼び出しに使う。
// 3箇所とも同じ文言のため、コピペでの食い違いを避けて1箇所に集約する（@reviewer指摘）
const EDIT_RECORD_HINT = 'タップして記録を編集します';

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

// 時間帯グループ表示・フラット表示のどちらでもカード列の描画は同一のため共有する
// （CalendarExerciseCardへ渡すpropsを2箇所に重複させない）。onPressExerciseはカード全体を
// 受け取る形にしている（呼び出し元によって遷移先の判断材料(sessionId)が異なるため）。
// 今日・過去日パネルとも記録編集画面へ遷移する（2026-07-21、@ユーザー指摘で統一）
function DayCardList({
  cards,
  onPressExercise,
  accessibilityHint,
}: {
  cards: CalendarDayCard[];
  onPressExercise: (card: CalendarDayCard) => void;
  // 遷移先の説明。呼び出し元は現状すべてEDIT_RECORD_HINTを渡すが、将来パネルごとに
  // 文言を変える余地を残すため引数のままにしている（@designer指摘）
  accessibilityHint: string;
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
          onPress={() => onPressExercise(card)}
          accessibilityHint={accessibilityHint}
        />
      ))}
    </View>
  );
}

// 1セッション分の時間帯見出し+カード列。今日パネル・過去日パネルの両方で同じ
// 「SessionTimeGroupHeader + DayCardList」の組が完全一致するようになったため
// （2026-07-22、常時見出し表示化で条件分岐が消えた際に重複が発生。@reviewer指摘）共通化する
function SessionRecordGroup({
  group,
  onPressExercise,
}: {
  group: { sessionId: number; sessionStartedAt: number; cards: CalendarDayCard[] };
  onPressExercise: (card: CalendarDayCard) => void;
}) {
  return (
    <View style={styles.dayGroup}>
      <SessionTimeGroupHeader sessionStartedAt={group.sessionStartedAt} />
      <DayCardList cards={group.cards} onPressExercise={onPressExercise} accessibilityHint={EDIT_RECORD_HINT} />
    </View>
  );
}

// mergeScheduleCards（lib/calendar/schedule.ts）出力をUnifiedScheduleCard<Reminder>で具体化して
// 参照する（旧ScheduleEntryCardのコメントと同じ理由: ReturnType<typeof mergeScheduleCards>だと
// 型パラメータ制約でcard.reminderへのアクセスが効かなくなる）
type MergedScheduleCard = UnifiedScheduleCard<Reminder>;

// 未実体化のリマインダー予定を「開始」する際、id/title（routineId/routineName）だけでは
// materializeReminderOccurrenceの呼び出しに必要な情報が揃わないため、useStartWithConfirmの
// 追加パラメータ(TExtra)として渡す
type ReminderStartExtra = { reminderId: number; routineName: string; hour: number; minute: number };

// 直接予定/実体化済みルーティン予定/未実体化リマインダー予定の3分岐ディスパッチを、今日パネル・
// 未来日パネルの2箇所で重複させないよう共通化する（2026-07-21、@reviewer指摘: 分岐ロジックが
// 丸ごと複製されており、将来4種類目の予定が増えた場合や分岐条件を変えた場合に片側だけ
// 直すと表示が割れるリスクがあった）。今日パネルだけ開始ボタンを持つ(showStart)ため、
// それ以外の差分（Viewでのラップ有無・keyの付け方・sessionStartedAtの算出方法）は
// 呼び出し側に委ねる
function ScheduleTimelineEntry({
  card,
  sessionStartedAt,
  showStart,
  onEditScheduledWorkoutExercises,
  onStartScheduledWorkout,
  onStartRoutine,
  onMaterializeAndEdit,
}: {
  card: MergedScheduleCard;
  sessionStartedAt: number;
  showStart: boolean;
  onEditScheduledWorkoutExercises: (scheduledWorkoutId: number) => void;
  onStartScheduledWorkout: (scheduledWorkoutId: number, title: string) => void;
  onStartRoutine: (routineId: number, title: string, extra: ReminderStartExtra) => void;
  onMaterializeAndEdit: (reminderId: number, routineId: number, routineName: string, hour: number, minute: number) => void;
}) {
  // 直接予定（routineId===null、2026-07-20）は種目一覧カード表示に切り替える（@ユーザー指摘）。
  // reminderは常にルーティン紐付きのためroutineIdがnullになることは無く、
  // card.source==='manual'で必ずscheduledWorkoutIdが取れる
  if (card.routineId == null && card.source === 'manual') {
    return (
      <ScheduledWorkoutExerciseGroup
        scheduledWorkoutId={card.scheduledWorkoutId}
        sessionStartedAt={sessionStartedAt}
        title={card.title}
        onPressStart={showStart ? () => onStartScheduledWorkout(card.scheduledWorkoutId, card.title) : undefined}
        onPress={() => onEditScheduledWorkoutExercises(card.scheduledWorkoutId)}
      />
    );
  }
  // 直接予定は上のif分岐で処理済みのため、ここに来る時点でcard.routineIdは必ずnumber
  // （reminderは常にルーティン紐付き、manualも上でnullを弾いている）
  const routineId = card.routineId!;
  // 手動で追加したルーティン予定（実体化済み、scheduledWorkoutIdを持つ）。この予定インスタンス
  // 専用にコピーされた種目・目標セットを編集・表示する（2026-07-21、ルーティン予定を直接予定と
  // 同じアーキテクチャに統一）
  if (card.source === 'manual') {
    return (
      <ScheduledWorkoutExerciseGroup
        scheduledWorkoutId={card.scheduledWorkoutId}
        routineName={card.title}
        sessionStartedAt={sessionStartedAt}
        title={card.title}
        onPressStart={showStart ? () => onStartScheduledWorkout(card.scheduledWorkoutId, card.title) : undefined}
        onPress={() => onEditScheduledWorkoutExercises(card.scheduledWorkoutId)}
      />
    );
  }
  // リマインダー由来の未実体化予定。ルーティン本体の現在の中身をプレビュー表示し、種目カード
  // タップ時に初めてscheduledWorkoutsとして実体化してから編集画面へ遷移する
  return (
    <ReminderScheduleExerciseGroup
      routineId={routineId}
      routineName={card.title}
      sessionStartedAt={sessionStartedAt}
      onPressStart={
        showStart
          ? () =>
              onStartRoutine(routineId, card.title, {
                reminderId: card.reminder.id,
                routineName: card.title,
                hour: card.hour,
                minute: card.minute,
              })
          : undefined
      }
      onPress={() => onMaterializeAndEdit(card.reminder.id, routineId, card.title, card.hour, card.minute)}
    />
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
  // 無駄な再購読が増えるため）。この「必要な範囲」自体は毎回viewedに合わせて再センタリングするが、
  // 実際にクエリへ渡すrangeStart/rangeEndは下のcachedRange（バッファ込みで広めに確保し、
  // 範囲内のスワイプでは動かさない）を使う
  const neededRange = useMemo(() => {
    const start = addMonths(viewed.year, viewed.month, -1);
    const endExclusive = addMonths(viewed.year, viewed.month, 2);
    return {
      start: new Date(start.year, start.month, 1).getTime(),
      end: new Date(endExclusive.year, endExclusive.month, 1).getTime(),
    };
  }, [viewed.year, viewed.month]);
  // 月送りのたびにrangeStart/rangeEndを再センタリングしていると、useLiveQueryのdepsが毎回変わり
  // 新しい範囲のフェッチが完了するまでの間、着地した月のprimaryCategoryByDayが空(または前の範囲の
  // まま)になる。実績が多い月ほど「塗りつぶしが一瞬消えてから遅れて浮き出る」形で日付の見た目が
  // ちらついて見えていた（実機の画面録画で確認済み）。バッファ分だけ広く取ったcachedRangeを
  // 「必要な範囲がはみ出た時だけ」拡張することで、そのバッファ内のスワイプ往復ではdeps自体が
  // 変わらず再フェッチが起きないようにする
  const RANGE_BUFFER_MONTHS = 3;
  const [cachedRange, setCachedRange] = useState(() => {
    const start = addMonths(viewed.year, viewed.month, -1 - RANGE_BUFFER_MONTHS);
    const endExclusive = addMonths(viewed.year, viewed.month, 2 + RANGE_BUFFER_MONTHS);
    return {
      start: new Date(start.year, start.month, 1).getTime(),
      end: new Date(endExclusive.year, endExclusive.month, 1).getTime(),
    };
  });
  useEffect(() => {
    if (neededRange.start >= cachedRange.start && neededRange.end <= cachedRange.end) return;
    const start = addMonths(viewed.year, viewed.month, -1 - RANGE_BUFFER_MONTHS);
    const endExclusive = addMonths(viewed.year, viewed.month, 2 + RANGE_BUFFER_MONTHS);
    setCachedRange({
      start: new Date(start.year, start.month, 1).getTime(),
      end: new Date(endExclusive.year, endExclusive.month, 1).getTime(),
    });
  }, [neededRange, cachedRange, viewed.year, viewed.month]);
  const rangeStart = cachedRange.start;
  const rangeEnd = cachedRange.end;
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
  // セッション単位（時刻の早い順）でグルーピングし、時間帯見出しを表示する（デザイン案
  // 「複数18」）。1セッションのみの日でも時刻が分かるよう、常に見出しを出して一貫性を保つ
  // （2026-07-22、複数セッション時とだけ見出しを出し分けていたのをやめた。@ユーザー指摘）
  const dayCardGroups = useMemo(
    () => (Array.isArray(dayCards) ? groupCardsBySession(dayCards) : []),
    [dayCards],
  );

  // todayTimelineのフィルタ（下記）で使うため、resumeバナー関連のuseWorkoutSessions呼び出しより
  // 前にactiveSessionだけ先出しする（2026-07-23、@ユーザー指摘: 予定を開始すると再開バナーに
  // 加えてその予定のカード自体も今日パネルに残ってしまうバグの修正）
  const { activeSession } = useWorkoutSessions();

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
  // 2026-07-19確定。「胸→背中に差し替え」のような別ルーティンへの打ち消しはdedupeの対象外）。
  // 今日・未来日どちらも同じ統合結果を使う（PR10-4で今日パネルにも適用範囲を拡張）。
  // daySchedule/manualScheduleが既にEMPTY_*に握りつぶされているため、ここでshowsScheduleを
  // 再度見る必要は無い（過去日はmergeScheduleCards(EMPTY, EMPTY)が[]を返すので自然に空になる）
  const mergedSchedule = useMemo(
    () => mergeScheduleCards(daySchedule.cards, manualSchedule),
    [daySchedule, manualSchedule],
  );
  // 今日パネル専用。開始済みの予定カードが再開バナーと重複表示されるバグの修正
  // （excludeActiveScheduledCard、lib/calendar/schedule.ts参照）。mergedSchedule自体は
  // 未来日パネルでもそのまま使うため素の状態を保つ
  const todayScheduleCards = useMemo(
    () => excludeActiveScheduledCard(mergedSchedule, activeSession?.scheduledWorkoutId ?? null),
    [mergedSchedule, activeSession],
  );
  const todayTimeline = useMemo(
    () =>
      isSelectedToday
        ? buildTodayTimeline(dayCardGroups, todayScheduleCards, selectedDayStart)
        : [],
    [isSelectedToday, dayCardGroups, todayScheduleCards, selectedDayStart],
  );

  const pushDebounced = useDebouncedPush();
  // 今日・過去日パネルの種目カードは、その日の記録そのものを見返す/直す用途のため、
  // そのセッションの記録編集画面へ遷移する（2026-07-20、要件確認済み。当初は今日パネルを
  // 種目詳細のまま維持していたが、未来予定の種目カードも記録編集画面に統一したため
  // 一貫性のため今日パネルも合わせた）
  const handlePressPastRecord = useCallback(
    (card: CalendarDayCard) => pushDebounced(`/workout/${card.sessionId}`),
    [pushDebounced],
  );
  // 未来日パネルの「予定を追加」ボタン用（PR10、2026-07-20に開始方法選択画面(schedule-chooser)を
  // 経由するよう変更）。日付は選択日で確定済みのためdateKeyだけ渡す
  const handlePressAddSchedule = useCallback(
    () => pushDebounced({ pathname: '/calendar/schedule-chooser', params: { dateKey: toDateKey(selectedDate) } }),
    [pushDebounced, selectedDate],
  );
  // scheduledWorkoutId実体を持つ予定（直接予定、および実体化済みルーティン予定、2026-07-21に
  // 対象を拡大）の種目一覧カードタップ用。過去の記録の種目カードが記録編集画面
  // (/workout/[sessionId])へ飛ぶのと同じ考え方で、この予定の種目一覧・目標セットをまとめて
  // 編集する画面（schedule-workout-edit.tsx）へ遷移する（@ユーザー指摘）。この画面は
  // scheduledWorkoutIdのlive queryで自前にDBを引くため、種目idの受け渡しは不要
  const handleEditScheduledWorkoutExercises = useCallback(
    (scheduledWorkoutId: number) =>
      pushDebounced({
        pathname: '/calendar/schedule-workout-edit',
        params: { scheduledWorkoutId: String(scheduledWorkoutId) },
      }),
    [pushDebounced],
  );
  // リマインダー由来の未実体化予定（ReminderScheduleExerciseGroup）の種目カードタップ用
  // （2026-07-21）。まだscheduledWorkouts行が存在しないため、初めてこの日付・時刻の実体を
  // 作ってから種目編集画面へ遷移する。reminderId単位のガードで、非同期処理中の連打による
  // 二重実体化（materializeReminderOccurrence自体はcreate側に冪等性が無い、PR2で確認済み）を防ぐ
  const materializingReminderIdsRef = useRef<Set<number>>(new Set());
  const handleMaterializeAndEditRoutineSchedule = useCallback(
    async (reminderId: number, routineId: number, routineName: string, hour: number, minute: number) => {
      if (materializingReminderIdsRef.current.has(reminderId)) return;
      materializingReminderIdsRef.current.add(reminderId);
      try {
        const { scheduledWorkoutId, notificationSuppressed } = await materializeReminderOccurrence(
          reminderId,
          routineId,
          routineName,
          toDateKey(selectedDate),
          hour,
          minute,
        );
        const goToEditScreen = () =>
          pushDebounced({
            pathname: '/calendar/schedule-workout-edit',
            params: { scheduledWorkoutId: String(scheduledWorkoutId) },
          });
        // 通知登録の失敗を無言で握りつぶさない（@reviewer指摘: 無言だと「消えたはずの通知が
        // 鳴った」で信頼を損なう）。編集画面へ着地する前に一言伝える
        if (!notificationSuppressed) {
          Alert.alert(
            '予定を開きました',
            '元の予定の新しい通知の登録処理に失敗した可能性があるため、念のため指定時刻に通知が届いていないかご確認ください。',
            [{ text: 'OK', onPress: goToEditScreen }],
            { cancelable: false },
          );
        } else {
          goToEditScreen();
        }
      } catch (e) {
        console.error('[materialize reminder occurrence]', e);
        Alert.alert('エラー', '予定を開けませんでした。');
      } finally {
        materializingReminderIdsRef.current.delete(reminderId);
      }
    },
    [pushDebounced, selectedDate],
  );

  const resumeSummary = useResumeWorkoutSummary(activeSession);
  const resumeNow = useTickingNow(activeSession != null);
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
  // 今日パネル末尾の出し分け用（@ユーザー指摘）。今日すでに完了済みの記録が1件でもあれば
  // 「予定を追加」より「トレーニングを開始（もう1本）」を優先表示する。dayCardGroupsは
  // selectedDateの完了済みセッション群（進行中セッション自身は含まれない）で、今日以外の
  // 選択日でも算出され続けているため、isSelectedTodayを明示的に含めて名前と実態を一致させる
  // （@reviewer指摘: 無いと「今日」以外のブランチでこの変数を誤って参照したときに壊れる余地が
  // あった）。これが1件以上あれば「今日の過去記録がある」と判定できる。進行中セッション中は
  // ResumeWorkoutBannerが唯一の開始/再開CTAであるべきため、activeSession中はこのボタンを
  // 出さず、従来通り「予定を追加」のみ据え置く。また、今日にまだ実施していない予定
  // （todayTimelineのkind!=='session'エントリ）が残っている場合も出さない。予定カード自体が
  // 既に個別の「開始」ボタンを持っており、末尾にも似た見た目の開始ボタンが並ぶと役割の違いが
  // 一目で伝わらないため（@designer指摘: 朝に1本完了済み・夜にリマインダー予定が残っている、
  // というよくある混在ケースで実際に開始系CTAが2つ並んでしまうバグがあった）
  const hasCompletedSessionToday =
    isSelectedToday && dayCardGroups.length > 0 && !activeSession && !todayTimeline.some((entry) => entry.kind !== 'session');
  // 過去日パネルの「記録を追加」用（2026-07-20）。今日と同じ開始方法選択画面
  // (start-chooser)を経由させ、選んだ方法で作るセッションだけをpastDateKey付きで
  // 過去日の完了済みセッション（記録の編集モード）に切り替える（要件確認済み）
  const handleAddPastRecord = useCallback(() => {
    pushDebounced({ pathname: '/workout/start-chooser', params: { pastDateKey: toDateKey(selectedDate) } });
  }, [pushDebounced, selectedDate]);

  // 今日の予定カードの「開始」ボタン用。まだ実体化していないリマインダー予定
  // （card.source==='reminder'）専用。開始する前にmaterializeReminderOccurrenceで
  // scheduledWorkouts実体を作ってからstartWorkoutFromScheduledWorkoutで開始することで、
  // 直接予定・実体化済みルーティン予定と同じscheduledWorkoutId経由の後始末
  // （endWorkoutSession終了時にこの予定を削除する、lib/workout/session.ts）に統一する
  // （2026-07-21、@ユーザー指摘「開始→終了しても予定が消えない」バグの修正）。
  // 実体化時の通知登録失敗はmaterializeReminderOccurrence内部でconsole.errorに留め、
  // ここでは開始の成否のみをuseWorkoutStarterのAlertに委ねる（handleMaterializeAndEditRoutineSchedule
  // のような追加確認は「今すぐ開始する」フローでは冗長なため行わない）
  const startWorkoutFromReminderOccurrence = useCallback(
    async (routineId: number, extra?: ReminderStartExtra) => {
      if (!extra) return null;
      const { scheduledWorkoutId } = await materializeReminderOccurrence(
        extra.reminderId,
        routineId,
        extra.routineName,
        toDateKey(selectedDate),
        extra.hour,
        extra.minute,
      );
      return startWorkoutFromScheduledWorkout(scheduledWorkoutId);
    },
    [selectedDate],
  );
  const handleStartRoutine = useStartWithConfirm(
    activeSession,
    (sessionId) => pushDebounced(`/workout/${sessionId}`),
    startWorkoutFromReminderOccurrence,
  );
  // scheduledWorkoutId実体を持つ予定（直接予定、および実体化済みルーティン予定）共通の
  // 「開始」ボタン用（2026-07-20、2026-07-21に対象を拡大）。handleStartRoutineと同じ
  // useStartWithConfirmだが、startWorkoutFromScheduledWorkoutで開始する。実体化済みルーティン
  // 予定は、schedule-workout-edit.tsxでこの予定インスタンス専用に編集した目標セット
  // （scheduledWorkoutSets）を持つため、開始時もルーティン本体(startWorkoutFromRoutine)ではなく
  // 必ずこちらを使う（@ユーザー指摘: routineId!=nullでもhandleStartRoutineを使うと、編集画面で
  // 変更した目標セットが「開始」に反映されない。旧ScheduleEntryCardの分岐をそのまま踏襲すると
  // このバグを引き継ぐため、計画時点の想定から意図的に変更した）
  const handleStartScheduledWorkout = useStartWithConfirm(
    activeSession,
    (sessionId) => pushDebounced(`/workout/${sessionId}`),
    startWorkoutFromScheduledWorkout,
  );

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
              {activeSession && (
                <ResumeWorkoutBanner
                  routineName={resumeSummary.routineName}
                  elapsedLabel={formatElapsedClock(resumeNow - activeSession.startedAt)}
                  completedExerciseCount={resumeSummary.completedExerciseCount}
                  totalExerciseCount={resumeSummary.totalExerciseCount}
                  completedSetCount={resumeSummary.completedSetCount}
                  onPress={handleResumeToday}
                />
              )}
              {todayTimeline.length === 0 ? (
                !activeSession && (
                  <DayEmptyState buttonIcon="play.fill" actionLabel="トレーニングを開始" onPressAction={handleStartToday} />
                )
              ) : (
                <>
                  {todayTimeline.map((entry) => {
                    if (entry.kind === 'session') {
                      return (
                        <SessionRecordGroup key={entry.key} group={entry.group} onPressExercise={handlePressPastRecord} />
                      );
                    }
                    // 予定エントリは常にentry1件=カード1枚（グルーピングされない）で、
                    // ScheduleExerciseCardGroup自身がSessionTimeGroupHeaderを内包するため、
                    // ここで重ねて出す必要はない（2026-07-21、旧RoutineScheduleCardの
                    // 「自身が時刻バッジを持つため重ねない」制約を全予定種別で統一）
                    return (
                      <View key={entry.key} style={styles.dayGroup}>
                        <ScheduleTimelineEntry
                          card={entry.card}
                          sessionStartedAt={entry.sortAt}
                          showStart
                          onEditScheduledWorkoutExercises={handleEditScheduledWorkoutExercises}
                          onStartScheduledWorkout={handleStartScheduledWorkout}
                          onStartRoutine={handleStartRoutine}
                          onMaterializeAndEdit={handleMaterializeAndEditRoutineSchedule}
                        />
                      </View>
                    );
                  })}
                  {hasCompletedSessionToday && (
                    <PrimaryButton
                      label="トレーニングを開始"
                      onPress={handleStartToday}
                      // すぐ下に並ぶAddExerciseButton（paddingVertical:11）と縦幅を揃える
                      // （@designer指摘: 全幅ボタン2つが直接隣接するのは今回が初めてで、
                      // PrimaryButton既定のpaddingVertical:13のままだと4pt分の高さのズレが
                      // 視認できる）
                      style={styles.startTodayButton}
                      // routine-card.tsxの「開始」ボタンと同じアイコンサイズ(16)に揃える
                      icon={<IconSymbol name="play.fill" size={16} color={Colors.onAccent} />}
                    />
                  )}
                  <AddExerciseButton
                    onPress={handlePressAddSchedule}
                    label="予定を追加"
                    accessibilityLabel="予定を追加"
                  />
                </>
              )}
            </View>
          ) : isFutureDay ? (
            mergedSchedule.length === 0 ? (
              <DayEmptyState
                buttonIcon="plus"
                actionLabel="予定を追加"
                text="予定がありません"
                onPressAction={handlePressAddSchedule}
              />
            ) : (
              <View style={styles.dayGroupList}>
                {mergedSchedule.map((card) => {
                  // 予定エントリはSessionTimeGroupHeaderをsessionStartedAt(選択日+予定のhour/minute
                  // で合成)から自前で組み立てる（今日パネルと同じ、2026-07-21に全予定種別で統一）
                  const sessionStartedAt = new Date(
                    selectedDate.getFullYear(),
                    selectedDate.getMonth(),
                    selectedDate.getDate(),
                    card.hour,
                    card.minute,
                  ).getTime();
                  // 未来日パネルは開始ボタンを持たない（デザイン案「未来日は開始ボタンなし」）
                  // ためshowStart=falseで渡す
                  return (
                    <View key={card.key} style={styles.dayGroup}>
                      <ScheduleTimelineEntry
                        card={card}
                        sessionStartedAt={sessionStartedAt}
                        showStart={false}
                        onEditScheduledWorkoutExercises={handleEditScheduledWorkoutExercises}
                        onStartScheduledWorkout={handleStartScheduledWorkout}
                        onStartRoutine={handleStartRoutine}
                        onMaterializeAndEdit={handleMaterializeAndEditRoutineSchedule}
                      />
                    </View>
                  );
                })}
                <AddExerciseButton
                  onPress={handlePressAddSchedule}
                  label="予定を追加"
                  accessibilityLabel="予定を追加"
                />
              </View>
            )
          ) : dayCards.length === 0 ? (
            <DayEmptyState buttonIcon="plus" actionLabel="記録を追加" onPressAction={handleAddPastRecord} />
          ) : (
            // 既に記録がある日でも「記録を追加」（2件目のセッションを追加する等）ができるよう、
            // 一覧末尾にボタンを添える（@ユーザー指摘。予定側のAddExerciseButton「予定を追加」と
            // 同じ「既に1件ある日でも末尾から追加できる」パターンに揃える）
            <View style={styles.dayGroupList}>
              {dayCardGroups.map((group) => (
                <SessionRecordGroup key={group.sessionId} group={group} onPressExercise={handlePressPastRecord} />
              ))}
              <AddExerciseButton onPress={handleAddPastRecord} label="記録を追加" accessibilityLabel="記録を追加" />
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
  // 記録タブ(app/(tabs)/index.tsx)の日付グループ見出しはformatSessionDateGroupを使う点は
  // 同じだが、そちらは長いリストの中で繰り返される控えめなeyebrowラベル(12px/muted/700)。
  // 一方こちらは選択日パネルに1つだけ出る、その画面が「何の日を見ているか」を示す見出しのため、
  // デザイン案（スケジュール（カレンダー）機能 デザイン案.html、font-size:14px/font-weight:800/
  // color:var(--ink)）の指定通りもう一段強く表示する。役割が異なるためあえて別トークン扱いにし、
  // fontSizeを直書きしている（14px/weight800に一致する既存Typographyトークンが無いため）
  dayHeading: { fontSize: 14, lineHeight: 20, fontWeight: '800', color: Colors.textPrimary, marginBottom: 10 },
  dayLoading: { marginTop: 12 },
  dayErrorWrapper: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  dayErrorText: { ...Typography.body, color: Colors.danger },
  dayRetryText: { ...Typography.bodyStrong, color: Colors.accent },
  dayCardList: { gap: 8 },
  // 時間帯グループ間の余白はデザイン案「複数18」のheight:12px相当
  dayGroupList: { gap: 12 },
  dayGroup: { gap: 8 },
  startTodayButton: { width: '100%', paddingVertical: 11 },
});
