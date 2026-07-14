import { ExerciseSwapPicker } from '@/components/exercises/exercise-swap-picker';
import { NotFoundState } from '@/components/ui/not-found-state';
import { Colors } from '@/constants/theme';
import type { Exercise } from '@/db/schema';
import { notifyPrefilled } from '@/lib/workout/prefill-feedback';
import { replaceSessionExercise } from '@/lib/workout/session';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ExerciseSwapScreen() {
  const {
    sessionId: sessionIdParam,
    sessionExerciseId: sessionExerciseIdParam,
    currentExerciseId: currentExerciseIdParam,
    currentExerciseName,
    hasRecordedData: hasRecordedDataParam,
  } = useLocalSearchParams<{
    sessionId: string;
    sessionExerciseId: string;
    currentExerciseId: string;
    currentExerciseName: string;
    hasRecordedData: string;
  }>();
  const sessionId = Number(sessionIdParam);
  const sessionExerciseId = Number(sessionExerciseIdParam);
  const currentExerciseId = Number(currentExerciseIdParam);
  const hasRecordedData = hasRecordedDataParam === 'true';
  const router = useRouter();

  const handleSubmit = useCallback(
    async (exercise: Exercise) => {
      const prefilled = await replaceSessionExercise(sessionExerciseId, exercise.id);
      if (prefilled) notifyPrefilled([prefilled]);
      router.back();
    },
    [sessionExerciseId, router],
  );

  if (!Number.isFinite(sessionExerciseId)) {
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
    <ExerciseSwapPicker
      currentExerciseId={currentExerciseId}
      currentExerciseName={currentExerciseName}
      hasRecordedData={hasRecordedData}
      // 今まさに入れ替え対象になっている進行中セッションを実績集計から除外する
      // （exercise-picker.tsxと同じ理由。詳細はhookのコメントを参照）
      usageStatsExcludeSessionId={Number.isFinite(sessionId) ? sessionId : undefined}
      confirmMessage="入力済みの記録は失われます。"
      onSubmit={handleSubmit}
    />
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
});
