import { CalendarExerciseCard } from '@/components/calendar/calendar-exercise-card';
import { CategoryColorLegend } from '@/components/calendar/category-color-legend';
import { DayEmptyState } from '@/components/calendar/day-empty-state';
import { DirectScheduleExerciseGroup } from '@/components/calendar/direct-schedule-exercise-group';
import { RoutineScheduleCard } from '@/components/calendar/routine-schedule-card';
import { SessionTimeGroupHeader } from '@/components/calendar/session-time-group-header';
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
import { useStartWithConfirm } from '@/hooks/use-start-with-confirm';
import { useTickingNow } from '@/hooks/use-ticking-now';
import { useResumeWorkoutSummary, useWorkoutSessions } from '@/hooks/use-workout-session';
import { addMonths, isSameDay, toDateKey } from '@/lib/calendar/date-grid';
import { CATEGORY_ALL, EXERCISE_CATEGORIES } from '@/lib/exercises/constants';
import { buildTodayTimeline, groupCardsBySession } from '@/lib/calendar/session-groups';
import { mergeScheduleCards, type UnifiedScheduleCard } from '@/lib/calendar/schedule';
import { formatHourMinute, formatHourMinuteParts } from '@/lib/calendar/time-of-day';
import { formatKindSummary } from '@/lib/notifications/format';
import { skipReminderOccurrence } from '@/lib/notifications/reminder-skip-scheduler';
import { removeScheduledWorkout } from '@/lib/notifications/scheduled-workout-scheduler';
import { startWorkoutFromRoutine, startWorkoutFromScheduledWorkout } from '@/lib/workout/session';
import { formatElapsedClock, formatMonthGroup, formatSessionDateGroup } from '@/lib/workout/summary';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// カレンダーのカテゴリフィルターは「全て」+全カテゴリのみ（★お気に入りは種目単位の概念で
// 日別の実施記録には意味を持たないため、種目一覧等と共通のCATEGORY_FILTER_LISTは使わない）
const CALENDAR_FILTER_CATEGORIES = [CATEGORY_ALL, ...EXERCISE_CATEGORIES] as const;

// 過去日選択時に予定を握りつぶす際の固定参照（毎レンダー新しい配列を作らないことで
// 依存するuseMemoの不要な再計算を避ける）
const EMPTY_SCHEDULE: DaySchedule = { cards: [] };
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
  onDeleteManual,
  onDeleteReminder,
  onReplace,
}: {
  card: MergedScheduleCard;
  timeLabel: string;
  // 直接予定（routineId===null、2026-07-20）はDirectScheduleExerciseGroupで別途描画するため、
  // このコンポーネントに到達する時点でcard.routineIdは必ずnumber（呼び出し側で分岐済み）
  onPress: () => void;
  onPressStart?: () => void;
  onDeleteManual: (scheduledWorkoutId: number, title: string) => void;
  // リマインダー予定の⋮メニュー「削除」用（2026-07-19: 「今回だけスキップ」から変更、
  // 呼び出し先は確認ダイアログを挟む）。リマインダーは常にルーティン紐付きのためtitleは常に
  // ルーティン名になる
  onDeleteReminder: (reminderId: number, routineName: string) => void;
  // リマインダー予定の⋮メニュー「今回だけ差し替え」用（PR10-6b、リマインダー予定専用のため
  // 常にルーティン名）
  onReplace: (reminderId: number, routineName: string, hour: number, minute: number) => void;
}) {
  return (
    <RoutineScheduleCard
      title={card.title}
      categories={card.categories}
      exerciseCount={card.exerciseCount}
      timeLabel={timeLabel}
      onPress={onPress}
      onPressStart={onPressStart}
      oneTime={card.source === 'manual'}
      // 手動予定・リマインダー予定どちらも「削除」——出所ごとに呼び出す先の関数だけが異なる
      // （RoutineScheduleCard側は出所を意識せず共通のonDeleteとして受け取る）
      onDelete={
        card.source === 'manual'
          ? () => onDeleteManual(card.scheduledWorkoutId, card.title)
          : () => onDeleteReminder(card.reminder.id, card.title)
      }
      onReplace={
        card.source === 'reminder'
          ? () => onReplace(card.reminder.id, card.title, card.hour, card.minute)
          : undefined
      }
    />
  );
}

// 時間帯グループ表示・フラット表示のどちらでもカード列の描画は同一のため共有する
// （CalendarExerciseCardへ渡すpropsを2箇所に重複させない）。onPressExerciseはカード全体を
// 受け取る形にしている（今日パネル=種目詳細へ、過去日パネル=記録編集画面へ、と呼び出し元
// によって遷移先の判断材料（exerciseId/sessionId）が異なるため、@ユーザー指摘2026-07-20）
function DayCardList({
  cards,
  onPressExercise,
  accessibilityHint,
}: {
  cards: CalendarDayCard[];
  onPressExercise: (card: CalendarDayCard) => void;
  // 遷移先の説明（今日パネル/過去日パネルで文言が変わる、@designer指摘）。カード自体は
  // 見た目が同じままなのでVoiceOverだけでも文脈の違いが伝わるようにする
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
  // 2026-07-19確定。「胸→背中に差し替え」のような別ルーティンへの打ち消しはdedupeの対象外）。
  // 今日・未来日どちらも同じ統合結果を使う（PR10-4で今日パネルにも適用範囲を拡張）。
  // daySchedule/manualScheduleが既にEMPTY_*に握りつぶされているため、ここでshowsScheduleを
  // 再度見る必要は無い（過去日はmergeScheduleCards(EMPTY, EMPTY)が[]を返すので自然に空になる）
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

  const pushDebounced = useDebouncedPush();
  // 今日パネルの種目カードは種目詳細（フォーム・注意点等の閲覧用ページ）へ遷移する
  const handlePressExercise = useCallback(
    (card: CalendarDayCard) => pushDebounced(`/exercise/${card.exerciseId}`),
    [pushDebounced],
  );
  // 過去日パネルの種目カードは、その日の記録そのものを見返す/直す用途のため、種目詳細では
  // なくそのセッションの記録編集画面へ遷移する（2026-07-20、要件確認済み）。今日パネルの
  // 種目カード（handlePressExercise）は変更対象外のため種目詳細のまま維持している
  const handlePressPastRecord = useCallback(
    (card: CalendarDayCard) => pushDebounced(`/workout/${card.sessionId}`),
    [pushDebounced],
  );
  const handlePressRoutine = useCallback(
    (routineId: number) => pushDebounced(`/routine/edit/${routineId}`),
    [pushDebounced],
  );
  // 未来日パネルの「予定を追加」ボタン用（PR10、2026-07-20に開始方法選択画面(schedule-chooser)を
  // 経由するよう変更）。日付は選択日で確定済みのためdateKeyだけ渡す
  const handlePressAddSchedule = useCallback(
    () => pushDebounced({ pathname: '/calendar/schedule-chooser', params: { dateKey: toDateKey(selectedDate) } }),
    [pushDebounced, selectedDate],
  );
  // 直接予定（routineId===null、2026-07-20）の種目一覧カードタップ用。過去の記録の種目カードが
  // 記録編集画面(/workout/[sessionId])へ飛ぶのと同じ考え方で、この予定の種目一覧・目標セットを
  // まとめて編集する画面（schedule-workout-edit.tsx）へ遷移する（@ユーザー指摘）。この画面は
  // scheduledWorkoutIdのlive queryで自前にDBを引くため、種目idの受け渡しは不要
  const handleEditDirectScheduleExercises = useCallback(
    (scheduledWorkoutId: number) =>
      pushDebounced({
        pathname: '/calendar/schedule-workout-edit',
        params: { scheduledWorkoutId: String(scheduledWorkoutId) },
      }),
    [pushDebounced],
  );
  // 手動予定カードの⋮メニュー「削除」用（PR10-3、PR10-5で通知キャンセルも合わせて行うよう変更）。
  // app/routine/index.tsxのhandleDeleteやsession-exercise-card.tsxのhandleDeleteExerciseと同じ
  // Alert確認→try/catch+Alert.alertパターン。削除後はuseCalendarDayManualSchedule/
  // useCalendarMonthScheduleがuseLiveQueryで自動再購読するため、追加の状態更新は不要
  // （LayoutAnimationは非同期のDB書き込み・再購読を挟むと配置タイミングがずれ効かないため、
  // 他の非同期削除処理と同じくここでは使わない）
  const handleDeleteSchedule = useCallback((scheduledWorkoutId: number, title: string) => {
    Alert.alert(
      'この予定を削除しますか？',
      `「${title}」の予定を削除します。ルーティン自体や記録には影響しませんが、設定していた通知も届かなくなります。`,
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

  // リマインダー予定の⋮メニュー「削除」用（2026-07-19: 「今回だけスキップ」(取り消し可能・
  // ゴーストカードで元に戻せた)から、手動予定と同じ「削除」(取り消し不可)へ変更）。
  // 内部的にはreminderScheduleSkips/skipReminderOccurrenceの仕組みをそのまま流用する
  // （「今回だけ差し替え」機能がschedule-time-picker.tsx経由でこの同じテーブル・関数に依存して
  // いるため。テーブル名・関数名が「スキップ」のままなのはその名残で、役割自体は「その日の
  // この発火は無かったことにする」マーカーで変わらない）。取り消し不可になったため、
  // 手動予定の削除(handleDeleteSchedule)と同じAlert確認を挟む
  const handleDeleteReminderOccurrence = useCallback(
    (reminderId: number, routineName: string) => {
      Alert.alert(
        'この回の予定を削除しますか？',
        `「${routineName}」の今回の予定を削除します。次回以降の予定やリマインダー自体には影響しません。今回分の通知も届かなくなります。`,
        [
          { text: 'キャンセル', style: 'cancel' },
          {
            text: '削除',
            style: 'destructive',
            onPress: async () => {
              try {
                const { notificationSuppressed } = await skipReminderOccurrence(reminderId, toDateKey(selectedDate));
                if (!notificationSuppressed) {
                  // PR10-6cにより、毎日/毎週/単純な毎月の「ネイティブ方式」リマインダーも一時的に
                  // キュー方式へ切り替えることで該当日の通知を止められるようになった。
                  // notificationSuppressed=falseはトリガー方式による既知の制約ではなく通知API側の
                  // 想定外エラーのみを意味するため、その場合はその場で一言知らせる
                  // （@reviewer指摘: 無言だと「削除したのに鳴った」で信頼を損なう）
                  Alert.alert(
                    '予定を削除しました',
                    '削除自体は完了しています。ただし新しい通知の登録処理に失敗した可能性があるため、念のため指定時刻に通知が届いていないかご確認ください。',
                  );
                }
              } catch (e) {
                console.error('[delete reminder occurrence]', e);
                Alert.alert('エラー', '予定を削除できませんでした。');
              }
            },
          },
        ],
      );
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
  // 過去日パネルの「記録を追加」用（2026-07-20）。今日と同じ開始方法選択画面
  // (start-chooser)を経由させ、選んだ方法で作るセッションだけをpastDateKey付きで
  // 過去日の完了済みセッション（記録の編集モード）に切り替える（要件確認済み）
  const handleAddPastRecord = useCallback(() => {
    pushDebounced({ pathname: '/workout/start-chooser', params: { pastDateKey: toDateKey(selectedDate) } });
  }, [pushDebounced, selectedDate]);

  // 今日の予定カードの「開始」ボタン用。進行中セッションがある場合の確認ダイアログを含む
  // ロジックはuseStartWithConfirmに共通化してある（ルーティン一覧のカード
  // 「開始」ボタンと挙動が同一のため）
  const handleStartRoutine = useStartWithConfirm(
    activeSession,
    (sessionId) => pushDebounced(`/workout/${sessionId}`),
    startWorkoutFromRoutine,
  );
  // 今日の「直接追加」予定カードの「開始」ボタン用（2026-07-20）。handleStartRoutineと同じ
  // useStartWithConfirmだが、startWorkoutFromScheduledWorkoutで開始する
  const handleStartDirectSchedule = useStartWithConfirm(
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
                        <View key={entry.key} style={styles.dayGroup}>
                          {todayTimeline.length > 1 && <SessionTimeGroupHeader sessionStartedAt={entry.group.sessionStartedAt} />}
                          <DayCardList
                            cards={entry.group.cards}
                            onPressExercise={handlePressExercise}
                            accessibilityHint="タップして種目の詳細を見ます"
                          />
                        </View>
                      );
                    }
                    // 予定エントリは常にentry1件=カード1枚（グルーピングされない）で、
                    // RoutineScheduleCard自身が時刻バッジを持つため、SessionTimeGroupHeaderを
                    // 重ねると同じ時刻が2回表示されてしまっていた（@designer指摘、PR10-4で削除）
                    const { card } = entry;
                    // 直接予定（routineId===null、2026-07-20）は種目一覧カード表示に切り替える
                    // （@ユーザー指摘）。reminderは常にルーティン紐付きのためroutineIdがnullに
                    // なることは無く、card.source==='manual'で必ずscheduledWorkoutIdが取れる
                    if (card.routineId == null && card.source === 'manual') {
                      const exerciseIds = card.exerciseIds ?? [];
                      return (
                        <View key={entry.key} style={styles.dayGroup}>
                          <DirectScheduleExerciseGroup
                            exerciseIds={exerciseIds}
                            sessionStartedAt={entry.sortAt}
                            title={card.title}
                            onPressStart={() => handleStartDirectSchedule(card.scheduledWorkoutId, card.title)}
                            onDelete={() => handleDeleteSchedule(card.scheduledWorkoutId, card.title)}
                            onPress={() => handleEditDirectScheduleExercises(card.scheduledWorkoutId)}
                          />
                        </View>
                      );
                    }
                    // 直接予定は上のif分岐で処理済みのため、ここに来る時点でcard.routineIdは
                    // 必ずnumber（reminderは常にルーティン紐付き、manualも上でnullを弾いている）
                    const routineId = card.routineId!;
                    return (
                      <View key={entry.key} style={styles.dayGroup}>
                        <ScheduleEntryCard
                          card={card}
                          timeLabel={`今日 ${formatHourMinute(new Date(entry.sortAt))}`}
                          onPress={() => handlePressRoutine(routineId)}
                          onPressStart={() => handleStartRoutine(routineId, card.title)}
                          onDeleteManual={handleDeleteSchedule}
                          onDeleteReminder={handleDeleteReminderOccurrence}
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
            mergedSchedule.length === 0 ? (
              <DayEmptyState
                buttonIcon="plus"
                actionLabel="予定を追加"
                text="予定がありません"
                onPressAction={handlePressAddSchedule}
              />
            ) : (
              <View style={styles.dayCardList}>
                {mergedSchedule.map((card) => {
                  // 直接予定（routineId===null、2026-07-20）は種目一覧カード表示に切り替える
                  // （今日パネルと同じ、@ユーザー指摘）
                  if (card.routineId == null && card.source === 'manual') {
                    const sessionStartedAt = new Date(
                      selectedDate.getFullYear(),
                      selectedDate.getMonth(),
                      selectedDate.getDate(),
                      card.hour,
                      card.minute,
                    ).getTime();
                    const exerciseIds = card.exerciseIds ?? [];
                    return (
                      <DirectScheduleExerciseGroup
                        key={card.key}
                        exerciseIds={exerciseIds}
                        sessionStartedAt={sessionStartedAt}
                        title={card.title}
                        onDelete={() => handleDeleteSchedule(card.scheduledWorkoutId, card.title)}
                        onPress={() => handleEditDirectScheduleExercises(card.scheduledWorkoutId)}
                      />
                    );
                  }
                  // 直接予定は上のif分岐で処理済みのため、ここに来る時点でcard.routineIdは
                  // 必ずnumber（reminderは常にルーティン紐付き、manualも上でnullを弾いている）
                  const routineId = card.routineId!;
                  return (
                    <ScheduleEntryCard
                      key={card.key}
                      card={card}
                      timeLabel={
                        card.source === 'reminder'
                          ? formatKindSummary(card.reminder)
                          : formatHourMinuteParts(card.hour, card.minute)
                      }
                      onPress={() => handlePressRoutine(routineId)}
                      onDeleteManual={handleDeleteSchedule}
                      onDeleteReminder={handleDeleteReminderOccurrence}
                      onReplace={handlePressReplace}
                    />
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
          ) : dayCardGroups.length > 1 ? (
            <View style={styles.dayGroupList}>
              {dayCardGroups.map((group) => (
                <View key={group.sessionId} style={styles.dayGroup}>
                  <SessionTimeGroupHeader sessionStartedAt={group.sessionStartedAt} />
                  <DayCardList
                    cards={group.cards}
                    onPressExercise={handlePressPastRecord}
                    accessibilityHint="タップして記録を編集します"
                  />
                </View>
              ))}
            </View>
          ) : (
            <DayCardList
              cards={dayCards}
              onPressExercise={handlePressPastRecord}
              accessibilityHint="タップして記録を編集します"
            />
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
});
