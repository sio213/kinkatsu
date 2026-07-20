import { RoutinePickerList } from '@/components/routines/routine-picker-list';
import { HeaderTitle } from '@/components/ui/header-title';
import { NotFoundState } from '@/components/ui/not-found-state';
import { Colors } from '@/constants/theme';
import type { Routine } from '@/db/schema';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { useRoutineExerciseSummaries, useRoutines } from '@/hooks/use-routines';
import { useWorkoutStarter } from '@/hooks/use-workout-starter';
import { dateKeyToNoonMs, isValidDateKey } from '@/lib/calendar/date-grid';
import { startPastWorkoutFromRoutine } from '@/lib/workout/session';
import { formatSessionDateGroup } from '@/lib/workout/summary';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// カレンダー過去日パネル「記録を追加」→start-chooserの「ルーティン」経由専用の画面
// （2026-07-20）。「一覧から1件選ぶだけ」の読み取り専用ピッカーという構成は
// app/calendar/schedule-routine-picker.tsx（未来日の「予定を追加」フロー）と同じで、
// 描画部分は共通のcomponents/routines/routine-picker-list.tsxを流用する（@reviewer指摘、
// このピッカー画面が3本目に到達したため描画のみ共通化した）。
// 当初はapp/routine/index.tsx（フルCRUD一覧）にpastDateKey分岐を後付けしていたが、
// 「選ぶだけ」の操作に編集・複製・削除・並び替えが同居し誤操作リスクがあるとの指摘で、
// 専用ピッカー画面へ置き換えた（要件確認済み）。選んだ結果は生きたトレーニングではなく、
// startedAt=endedAt=pastDateKeyの完了済みセッション（app/workout/[id].tsxの「記録の編集」
// モードで開く）を直接作成する。時刻選択画面は挟まない（事後記録に時刻入力UIは無い方針）
export default function PastRoutinePickerScreen() {
  const { pastDateKey } = useLocalSearchParams<{ pastDateKey: string }>();
  const router = useRouter();
  const pushDebounced = useDebouncedPush();
  const { routines } = useRoutines();
  const summaries = useRoutineExerciseSummaries();
  // 進行中セッションとの競合確認（useStartRoutineWithConfirm）は過去日の事後記録には
  // 意味を持たない（作成するセッションは最初からendedAt済みで、現在進行中のセッションと
  // 入れ替わったり合流したりしないため）ので、確認なしで直接作成する。navigate関数は
  // useCallbackで安定させ、依存するhandleSelect/RoutinePickerListのメモ化を保つ（@reviewer指摘）
  const navigate = useCallback((sessionId: number) => pushDebounced(`/workout/${sessionId}`), [pushDebounced]);
  const startWorkout = useWorkoutStarter(navigate);

  const handleSelect = useCallback(
    (routine: Routine) => {
      startWorkout(async () => (await startPastWorkoutFromRoutine(routine.id, dateKeyToNoonMs(pastDateKey)))?.sessionId ?? null);
    },
    [startWorkout, pastDateKey],
  );

  // start-chooser経由の限り不正なpastDateKeyは渡らないが、不正な直リンク等への防御として
  // 明示的にガードする（schedule-routine-picker.tsxと同じ方針）
  if (!isValidDateKey(pastDateKey)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <Stack.Screen options={{ title: 'ルーティンを選択' }} />
        <NotFoundState message="日付が見つかりません" actionLabel="戻る" onPressAction={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <HeaderTitle title="ルーティンを選択" subtitle={formatSessionDateGroup(dateKeyToNoonMs(pastDateKey))} />
          ),
        }}
      />
      <RoutinePickerList
        routines={routines}
        summaries={summaries}
        onSelect={handleSelect}
        onPressBack={() => router.back()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
});
