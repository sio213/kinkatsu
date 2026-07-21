import { RoutineAddExerciseButton } from '@/components/routines/routine-add-exercise-button';
import { ScheduledWorkoutExerciseCard } from '@/components/calendar/scheduled-workout-exercise-card';
import { HeaderMenu, type DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { HeaderTitle } from '@/components/ui/header-title';
import { NotFoundState } from '@/components/ui/not-found-state';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors } from '@/constants/theme';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { useKeyboardInset } from '@/hooks/use-keyboard-inset';
import { useRoutines } from '@/hooks/use-routines';
import { useScheduledWorkoutTime } from '@/hooks/use-scheduled-workout';
import { useScheduledWorkoutExercises } from '@/hooks/use-scheduled-workout-exercises';
import { parseDateKey } from '@/lib/calendar/date-grid';
import { buildScheduledWorkoutDeleteMessage } from '@/lib/calendar/schedule';
import { formatHourMinuteParts } from '@/lib/calendar/time-of-day';
import { moveScheduledWorkoutExercise, removeScheduledWorkoutExercise } from '@/lib/calendar/scheduled-workout-detail';
import { removeScheduledWorkout } from '@/lib/notifications/scheduled-workout-scheduler';
import { hasAnyValue } from '@/lib/workout/set-values';
import { formatSessionDateGroup } from '@/lib/workout/summary';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// カレンダーの「直接追加」予定の種目一覧をまとめて編集する画面（2026-07-20新設）。過去の記録の
// 種目カードが記録編集画面(/workout/[sessionId])へ飛ぶのと同じ体験を、まだ実施していない
// 予定にも用意する（@ユーザー指摘）。app/routine/exercise-edit.tsxを参考にしているが、
// ルーティンの下書きストアと違いこの予定は既にDBに永続化済みの実体のため、編集操作は
// すべて即座にDBへ書き込む。まだ実施していない記録のため完了ボタンは持たず、
// app/workout/[id].tsxの過去記録編集モード（isActive===false、フッターにボタンを出さない）
// と同じ考え方で、フッターは「戻る」のみ
export default function ScheduleWorkoutEditScreen() {
  const { scheduledWorkoutId: scheduledWorkoutIdParam } = useLocalSearchParams<{ scheduledWorkoutId: string }>();
  const scheduledWorkoutId = Number(scheduledWorkoutIdParam);
  const router = useRouter();
  const pushDebounced = useDebouncedPush();
  const keyboardInset = useKeyboardInset();
  const { exercises, loaded: exercisesLoaded } = useScheduledWorkoutExercises(scheduledWorkoutId);
  const { time: scheduledTime, loaded: scheduledTimeLoaded } = useScheduledWorkoutTime(scheduledWorkoutId);
  const { routines } = useRoutines();
  const scrollRef = useRef<ScrollView>(null);

  // 「種目を追加」「ルーティンから読み込み」「過去の記録から読み込み」はいずれも子画面へ
  // 遷移してDBに書き込んでから戻ってくる形（種目は必ずorderIndex末尾に追加される）のため、
  // ここではexercisesの件数が増えたタイミングを検知して末尾までスクロールするだけでよい
  // （app/workout/[id].tsxの種目追加時の自動スクロールと同じ体験、@ユーザー指摘）。
  // useLiveQueryは「未解決(exercises=[]相当)→解決後のN件」という2段階を経るため、単に
  // 「エフェクトを一度でも実行したか」だけを見るセンチネルだと、開いた直後の初回データ到着
  // （0件→N件）そのものを「追加された」と誤検知してしまう（@reviewer指摘: 既存の複数種目
  // 予定を開くたびに末尾へスクロールしてしまうバグを実際に含んでいた）。exercisesLoadedが
  // trueになる前は比較・記録どちらも行わないことで、prevExerciseCountRefには必ず
  // 「読み込み完了後の実件数」が最初に入るようにする
  const prevExerciseCountRef = useRef<number | null>(null);
  useEffect(() => {
    if (!exercisesLoaded) return;
    if (prevExerciseCountRef.current !== null && exercises.length > prevExerciseCountRef.current) {
      scrollRef.current?.scrollToEnd({ animated: true });
    }
    prevExerciseCountRef.current = exercises.length;
  }, [exercises.length, exercisesLoaded]);

  // 選択日パネルでは見えていた対象日・時刻を、この画面のヘッダーにも表示する。同日に複数の
  // 直接予定があるとき、どの予定を編集しているか見失わないようにする（@designer指摘）
  const dateLabel = scheduledTime
    ? `${formatSessionDateGroup(parseDateKey(scheduledTime.scheduledDate).getTime())} ${formatHourMinuteParts(scheduledTime.hour, scheduledTime.minute)}`
    : undefined;
  // ルーティン紐付き予定（実体化済み）のときだけ意味を持つ。直接予定はundefinedのまま
  // （routineId===nullのため、routines一覧から一致するものが見つからない）
  const routineName = routines.find((r) => r.id === scheduledTime?.routineId)?.name;
  // ルーティン名をヘッダーに表示する（2026-07-21、@designer指摘: この画面は日パネルで見えていた
  // ルーティン名がどこにも表示されず、選択日パネルとの文脈が途切れる。また⋮「ルーティンを編集」
  // が「今見ているこの予定ではなく、その元になっているルーティン本体」を指すことも、ルーティン名が
  // 画面上に見えていて初めて自然に伝わる）。dateLabelと同じ控えめなsubtitle行に含める
  const headerSubtitle = [routineName, dateLabel].filter(Boolean).join(' ・ ');

  const handleAddExercise = useCallback(() => {
    pushDebounced({
      pathname: '/calendar/schedule-workout-add-exercise',
      params: { scheduledWorkoutId: String(scheduledWorkoutId) },
    });
  }, [pushDebounced, scheduledWorkoutId]);

  const handleLoadFromRoutine = useCallback(() => {
    pushDebounced({
      pathname: '/calendar/schedule-workout-routine-picker',
      params: { scheduledWorkoutId: String(scheduledWorkoutId) },
    });
  }, [pushDebounced, scheduledWorkoutId]);

  const handleLoadFromHistory = useCallback(() => {
    pushDebounced({
      pathname: '/calendar/schedule-workout-history-picker',
      params: { scheduledWorkoutId: String(scheduledWorkoutId) },
    });
  }, [pushDebounced, scheduledWorkoutId]);

  const handleSwap = useCallback(
    (scheduledWorkoutExerciseId: number, currentExerciseId: number, currentExerciseName: string, hasRecordedData: boolean) => {
      pushDebounced({
        pathname: '/calendar/schedule-workout-exercise-swap',
        params: {
          scheduledWorkoutExerciseId: String(scheduledWorkoutExerciseId),
          currentExerciseId: String(currentExerciseId),
          currentExerciseName,
          hasRecordedData: hasRecordedData ? 'true' : 'false',
        },
      });
    },
    [pushDebounced],
  );

  const handleDelete = useCallback((scheduledWorkoutExerciseId: number) => {
    Alert.alert('この種目を予定から削除しますか？', '設定した目標セットの内容も削除されます。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeScheduledWorkoutExercise(scheduledWorkoutExerciseId);
          } catch (e) {
            console.error('[scheduled workout exercise delete]', e);
            Alert.alert('エラー', 'この予定には最低1種目が必要なため削除できませんでした。');
          }
        },
      },
    ]);
  }, []);

  const handleMove = useCallback(
    async (scheduledWorkoutExerciseId: number, direction: 'up' | 'down') => {
      try {
        await moveScheduledWorkoutExercise(scheduledWorkoutId, scheduledWorkoutExerciseId, direction);
      } catch (e) {
        console.error('[scheduled workout exercise move]', e);
        Alert.alert('エラー', '並び順を変更できませんでした。');
      }
    },
    [scheduledWorkoutId],
  );

  // 実体化済み予定（直接予定・手動ルーティン予定）の削除は、この画面のヘッダー⋮が唯一の入口
  // （2026-07-22、@ユーザー指摘: 選択日パネル側のグルーピング解除に伴い⋮メニューを撤去し、
  // 削除はこの画面に一本化した）。この画面自体を編集し終えてから「この予定自体をやめる」と
  // 判断するケースのため、都度カレンダーへ戻らなくて済むようにする。文言はlib/calendar/schedule.ts
  // のbuildScheduledWorkoutDeleteMessageに集約する。2026-07-21よりルーティン予定（実体化済み）も
  // この画面に来るため、routineIdの有無で文言を出し分ける必要がある
  const handleDeleteWorkout = useCallback(() => {
    Alert.alert(
      'この予定を削除しますか？',
      buildScheduledWorkoutDeleteMessage(scheduledTime?.routineId ?? null, routineName),
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeScheduledWorkout(scheduledWorkoutId);
              router.back();
            } catch (e) {
              console.error('[scheduled workout delete]', e);
              Alert.alert('エラー', '予定を削除できませんでした。');
            }
          },
        },
      ],
    );
  }, [scheduledWorkoutId, router, scheduledTime?.routineId, routineName]);

  // ルーティン紐付き予定（実体化済み）の種目カード一覧はこの予定インスタンス専用のコピーで
  // あり、ルーティン本体はこの画面から編集できない。ルーティン本体を編集したい場合の明示的な
  // 導線として、ヘッダー⋮に用意する（2026-07-21、PR5でカレンダー日パネルの予定カードタップが
  // ルーティン本体編集(/routine/edit/{routineId})からこの画面へ切り替わったことに伴う代替導線）
  const handleEditRoutine = useCallback(() => {
    if (scheduledTime?.routineId == null) return;
    pushDebounced(`/routine/edit/${scheduledTime.routineId}`);
  }, [pushDebounced, scheduledTime?.routineId]);

  // app/routine/exercise-edit.tsxのhandleReorder/menuItemsと同じ方針
  // （並び替え画面は種目2件以上でしか意味を持たないため、1件以下では無効化する）
  const handleReorder = useCallback(() => {
    pushDebounced({
      pathname: '/calendar/schedule-workout-exercise-reorder',
      params: { scheduledWorkoutId: String(scheduledWorkoutId) },
    });
  }, [pushDebounced, scheduledWorkoutId]);

  const menuItems: DropdownMenuItem[] = [
    { key: 'add', label: '種目を追加', icon: 'add', onPress: handleAddExercise },
    {
      key: 'routine',
      label: 'ルーティンから読み込み',
      icon: 'fitness-center',
      disabled: routines.length === 0,
      hint:
        routines.length === 0
          ? '保存済みのルーティンがありません'
          : '保存済みのルーティンを選んで種目と目標セット値をまとめて追加します',
      onPress: handleLoadFromRoutine,
    },
    {
      key: 'history',
      label: '過去の記録から読み込み',
      icon: 'history',
      // 「ルーティンから読み込み」のhintが「種目と目標セット値をまとめて追加します」と
      // 数値も一緒に入ることを明言しているのに対し、こちらが種目名の追加としか読めない
      // 文言だと同種の操作なのに説明の粒度が揃わない（@designer指摘）。実際には
      // addHistoryCardsToScheduledWorkoutが実施した重量・回数をそのまま目標セット値として
      // コピーするため、粒度を揃えて明記する
      hint: '過去のトレーニングを選んで、種目と実施したセット値を目標としてまとめて追加します',
      onPress: handleLoadFromHistory,
    },
    {
      key: 'reorder',
      label: '種目を並び替え',
      icon: 'swap-vert',
      disabled: exercises.length <= 1,
      hint: exercises.length <= 1 ? '2種目以上あるときに使えます' : undefined,
      onPress: handleReorder,
    },
    // app/workout/[id].tsxのヘッダー⋮「削除」とラベルを揃える（@ユーザー指摘）。種目カード個別の
    // 「削除」とはメニューの開く場所（ヘッダー固定 vs カード内）が離れており、workout/[id].tsx側でも
    // 同じ「削除」ラベルで両者が共存しているため、取り違えリスクの実害は無いと判断
    { key: 'delete', label: '削除', icon: 'delete-outline', danger: true, onPress: handleDeleteWorkout },
  ];

  // ルーティン紐付き予定（実体化済み）のときだけ表示する。種目編集アクション群・削除とは
  // 性質が異なる「ルーティン本体への移動」のため、区切り線で分けた別グループにする
  // （components/calendar/schedule-exercise-card-group.tsxのreplaceMenuItemsと同じ方針）
  const menuGroups: DropdownMenuItem[][] =
    scheduledTime?.routineId != null
      ? [
          [
            {
              key: 'edit-routine',
              label: 'ルーティンを編集',
              icon: 'edit',
              // ここで編集した内容はルーティン本体（今後の全予定）に反映され、今見ているこの
              // 予定インスタンスの目標セットには反映されないことを補足する（@designer指摘）
              hint: 'この予定ではなくルーティン本体を編集します。今見ている目標セットには反映されません',
              onPress: handleEditRoutine,
            },
          ],
          menuItems,
        ]
      : [menuItems];

  // 「この予定を削除」実行後、DBの削除完了からrouter.back()による画面遷移までの間にlive query
  // が再購読され、この画面が一瞬「種目0件の空リスト」としてフラッシュ表示されてしまう
  // （@designer指摘）。app/workout/[id].tsxが自分自身のセッション削除後に同じ構図でNotFoundState
  // へ切り替えるのと同じガードをここにも入れ、空リストではなく空状態を出す
  if (scheduledTimeLoaded && scheduledTime == null) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <Stack.Screen options={{ title: '予定' }} />
        <NotFoundState message="予定が見つかりません" actionLabel="戻る" onPressAction={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerTitle: () => <HeaderTitle title="種目を編集" subtitle={headerSubtitle} />,
          headerRight: () => <HeaderMenu groups={menuGroups} accessibilityLabel="種目編集のメニューを開く" />,
        }}
      />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        contentInset={{ bottom: keyboardInset }}
        scrollIndicatorInsets={{ bottom: keyboardInset }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.list}>
          {exercises.map((exercise, index) => (
            <ScheduledWorkoutExerciseCard
              key={exercise.scheduledWorkoutExerciseId}
              exercise={exercise}
              isFirst={index === 0}
              isLast={index === exercises.length - 1}
              isOnlyExercise={exercises.length === 1}
              onSwap={() =>
                handleSwap(
                  exercise.scheduledWorkoutExerciseId,
                  exercise.exerciseId,
                  exercise.name,
                  exercise.sets.some(hasAnyValue),
                )
              }
              onDelete={() => handleDelete(exercise.scheduledWorkoutExerciseId)}
              onMoveUp={() => handleMove(exercise.scheduledWorkoutExerciseId, 'up')}
              onMoveDown={() => handleMove(exercise.scheduledWorkoutExerciseId, 'down')}
            />
          ))}
          <RoutineAddExerciseButton variant="ghost" onPress={handleAddExercise} />
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButton label="戻る" onPress={() => router.back()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
  list: { gap: 10 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
