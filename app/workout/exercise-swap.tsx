import { ExerciseSwapPicker } from '@/components/exercises/exercise-swap-picker';
import { NotFoundScreen } from '@/components/ui/not-found-screen';
import type { Exercise } from '@/db/schema';
import { notifyPrefilled } from '@/lib/workout/prefill-feedback';
import { replaceSessionExercise } from '@/lib/workout/session';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';

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
      <NotFoundScreen message="トレーニングが見つかりません" onPressBack={() => router.back()} />
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
