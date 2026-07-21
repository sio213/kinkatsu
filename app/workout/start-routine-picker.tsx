import { RoutinePickerList } from '@/components/routines/routine-picker-list';
import { HeaderTitle } from '@/components/ui/header-title';
import { NotFoundState } from '@/components/ui/not-found-state';
import { Colors } from '@/constants/theme';
import type { Routine } from '@/db/schema';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { useRoutineExerciseSummaries, useRoutines } from '@/hooks/use-routines';
import { useWorkoutStarter } from '@/hooks/use-workout-starter';
import { dateKeyToNoonMs, isValidDateKey } from '@/lib/calendar/date-grid';
import { startPastWorkoutFromRoutine, startWorkoutFromRoutine } from '@/lib/workout/session';
import { formatSessionDateGroup } from '@/lib/workout/summary';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// この画面はstart-chooserからのみpushされる（app/workout/exercise-picker.tsxの
// START_CHOOSER_DISMISS_COUNTと同じ根拠）。スタックは常にcalendar/記録タブ(0)→
// start-chooser(+1)→この画面自身(+1)の2段で固定できる
const START_CHOOSER_DISMISS_COUNT = 2;

// start-chooserの「ルーティン」カード専用の画面（2026-07-20。当初は過去日の事後記録専用
// だったが、今日のライブ開始でも同じ「選ぶだけ」の専用ピッカーを使うよう統一した
// （要件確認済み）: app/routine/index.tsx（フルCRUD一覧）を選択操作に使うと編集・複製・
// 削除・並び替えが同居し誤操作リスクがあるため、今日・過去日どちらもこの専用ピッカーへ寄せる。
// pastDateKeyが付いていれば過去日の事後記録（startedAt=endedAt=pastDateKeyの完了済み
// セッションを直接作成、時刻選択画面は挟まない）、無ければ今日のライブセッションを
// startWorkoutFromRoutineで開始する
export default function StartRoutinePickerScreen() {
  const { pastDateKey } = useLocalSearchParams<{ pastDateKey?: string }>();
  const isPastMode = isValidDateKey(pastDateKey);
  const router = useRouter();
  const pushDebounced = useDebouncedPush();
  const { routines } = useRoutines();
  const summaries = useRoutineExerciseSummaries();
  // この画面はstart-chooser経由でのみ到達し、start-chooser自体が「進行中セッションが無い」
  // ことを呼び出し元で保証した上で開かれる前提のため、useStartWithConfirmの
  // 進行中セッション確認ダイアログは不要（start-chooser.tsxの「自分で選ぶ」と同じ理由）。
  // navigate関数はuseCallbackで安定させ、依存するhandleSelect/RoutinePickerListの
  // メモ化を保つ（@reviewer指摘）。
  // dismiss(2)でこの画面自身+start-chooserをまとめて閉じてからpushする
  // （app/workout/exercise-picker.tsxの「自分で選ぶ」経路と同じ修正、@ユーザー指摘:
  // 単純にpushするだけだとstart-chooser/この画面がスタックに残り、/workout/{id}側の
  // 「戻る」を押しても呼び出し元(カレンダー/記録タブ)まで一気に戻れなかった）
  const navigate = useCallback(
    (sessionId: number) => {
      router.dismiss(START_CHOOSER_DISMISS_COUNT);
      pushDebounced(`/workout/${sessionId}`);
    },
    [router, pushDebounced],
  );
  const startWorkout = useWorkoutStarter(navigate);

  const handleSelect = useCallback(
    (routine: Routine) => {
      if (isPastMode) {
        startWorkout(
          async () => (await startPastWorkoutFromRoutine(routine.id, dateKeyToNoonMs(pastDateKey!)))?.sessionId ?? null,
        );
        return;
      }
      startWorkout(async () => (await startWorkoutFromRoutine(routine.id))?.sessionId ?? null);
    },
    [isPastMode, pastDateKey, startWorkout],
  );

  // start-chooser経由の限り不正なpastDateKeyは渡らないが、不正な直リンク等への防御として
  // 明示的にガードする（schedule-routine-picker.tsxと同じ方針）
  if (pastDateKey !== undefined && !isPastMode) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <Stack.Screen options={{ title: 'ルーティンを選択' }} />
        <NotFoundState message="日付が見つかりません" actionLabel="戻る" onPressAction={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      {isPastMode && (
        <Stack.Screen
          options={{
            headerTitle: () => (
              <HeaderTitle title="ルーティンを選択" subtitle={formatSessionDateGroup(dateKeyToNoonMs(pastDateKey!))} />
            ),
          }}
        />
      )}
      <RoutinePickerList
        routines={routines}
        summaries={summaries}
        onSelect={handleSelect}
        onPressBack={() => router.back()}
        // タップした瞬間に確認無くセッションが作られるため、他の一覧行（編集画面等の可逆な
        // 遷移）と違いVoiceOverでも事前に結果が伝わるようhintで明示する（@designer指摘）
        hint={
          isPastMode
            ? `${formatSessionDateGroup(dateKeyToNoonMs(pastDateKey!))}の記録として開始します`
            : 'タップして開始します'
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
});
