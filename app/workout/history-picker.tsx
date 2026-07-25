import { NotFoundState } from '@/components/ui/not-found-state';
import { ExerciseHistoryPickerView } from '@/components/workout/exercise-history-picker-view';
import { Colors } from '@/constants/theme';
import type { HistoryEntry } from '@/lib/workout/history';
import { notifyPrefilled } from '@/lib/workout/prefill-feedback';
import { loadHistoryIntoSessionExercise } from '@/lib/workout/session';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// トレーニング中の種目カード⋮「過去の記録から読み込み」から開く画面。一覧・自己ベスト判定・
// 確認ダイアログの実体はcomponents/workout/exercise-history-picker-view.tsx
// （app/routine/history-picker.tsxと共通）にあり、ここでは選択結果をDB
// (workoutSessionExercises)へ実際に書き込む処理だけを担う
export default function HistoryPickerScreen() {
  const {
    sessionId: sessionIdParam,
    sessionExerciseId: sessionExerciseIdParam,
    exerciseId: exerciseIdParam,
    exerciseName,
    hasRecordedData: hasRecordedDataParam,
  } = useLocalSearchParams<{
    sessionId: string;
    sessionExerciseId: string;
    exerciseId: string;
    exerciseName: string;
    hasRecordedData: string;
  }>();
  const sessionId = Number(sessionIdParam);
  const sessionExerciseId = Number(sessionExerciseIdParam);
  const exerciseId = Number(exerciseIdParam);
  const hasRecordedData = hasRecordedDataParam === 'true';
  const router = useRouter();

  const handleLoad = useCallback(
    async (entry: HistoryEntry) => {
      const { prefilledSetIds } = await loadHistoryIntoSessionExercise(
        sessionExerciseId,
        entry.workoutSessionExerciseId,
      );
      notifyPrefilled([{ sessionId, exerciseId, sessionExerciseId, kind: 'history', prefilledSetIds }]);
      router.back();
    },
    [sessionId, sessionExerciseId, exerciseId, router],
  );

  if (!Number.isFinite(sessionId) || !Number.isFinite(sessionExerciseId) || !Number.isFinite(exerciseId)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <NotFoundState
          message="トレーニングが見つかりません"
          actionLabel="戻る"
          onPressAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  return (
    <ExerciseHistoryPickerView
      exerciseId={exerciseId}
      exerciseName={exerciseName}
      // 今まさに読み込もうとしている進行中セッションを実績集計から除外する
      // （自分自身を「過去の実績」として参照しないため）
      excludeSessionId={sessionId}
      hasRecordedData={hasRecordedData}
      confirmMessage="入力済みの記録は失われます。"
      onPressBack={() => router.back()}
      onLoad={handleLoad}
    />
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
});
