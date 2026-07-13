import { RoutineFormScreen } from '@/components/routines/routine-form-screen';
import { useRoutines } from '@/hooks/use-routines';
import { useRoutineDraftStore } from '@/lib/routines/draft-store';
import { showRoutineFeatureComingSoon } from '@/lib/routines/placeholders';
import { toRoutineInput, type RoutineFormValues } from '@/lib/routines/validation';
import { useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { Alert } from 'react-native';

export default function RoutineNewScreen() {
  const router = useRouter();
  const { createRoutine } = useRoutines();
  const resetDraft = useRoutineDraftStore((state) => state.reset);

  // この画面に新規に遷移してきたとき（=真のマウント時）だけ下書きを空にする。
  // 種目追加ピッカーがpushされて戻ってきただけではこの画面は再マウントされないため、
  // 追加した種目が消えることはない。呼び出し元(app/routine/index.tsxのhandleCreate)でも
  // push前に念のためresetしているため、この画面が初めて描画される瞬間に古い下書きが
  // 一瞬だけ見える余地は無い
  useEffect(() => {
    resetDraft();
  }, [resetDraft]);

  const handleSubmit = useCallback(
    async (values: RoutineFormValues) => {
      try {
        await createRoutine(toRoutineInput(values));
        resetDraft();
        router.back();
      } catch (e) {
        console.error('[routine create]', e);
        Alert.alert('エラー', 'ルーティンの保存に失敗しました。');
      }
    },
    [createRoutine, resetDraft, router],
  );

  const handleAddExercise = useCallback(() => {
    router.push('/routine/exercise-picker');
  }, [router]);

  return (
    <RoutineFormScreen
      onSubmit={handleSubmit}
      onAddExercise={handleAddExercise}
      onPressExercise={showRoutineFeatureComingSoon}
    />
  );
}
