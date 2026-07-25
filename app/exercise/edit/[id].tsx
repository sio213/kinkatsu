import { ExerciseFormScreen } from '@/components/exercises/exercise-form-screen';
import { NotFoundScreen } from '@/components/ui/not-found-screen';
import { useExercise, useExercises } from '@/hooks/use-exercises';
import { parseFormPoints } from '@/lib/exercises/form-points';
import type { ExerciseFormValues } from '@/lib/exercises/validation';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert } from 'react-native';

export default function ExerciseEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { exercise, loaded } = useExercise(Number(id));
  const { updateExercise } = useExercises();

  const handleSubmit = useCallback(
    async (values: ExerciseFormValues) => {
      try {
        await updateExercise(Number(id), values);
        router.back();
      } catch (e) {
        console.error('[exercise update]', e);
        Alert.alert('エラー', '種目の保存に失敗しました。');
      }
    },
    [id, updateExercise, router],
  );

  if (!loaded) return null;

  if (!exercise) {
    // 以前はNotFoundStateも使わず手書きで、他24画面と違い戻る導線が無かった
    // （@reviewer指摘）。ヘッダーのタイトルはapp/_layout.tsxの静的title「種目を編集」に任せる
    return <NotFoundScreen message="種目が見つかりません" onPressBack={() => router.back()} />;
  }

  return (
    <ExerciseFormScreen
      initial={{
        name: exercise.name,
        category: exercise.category,
        note: exercise.note,
        favorite: exercise.favorite,
        formPoints: parseFormPoints(exercise.formPoints),
        source: exercise.source,
      }}
      onSubmit={handleSubmit}
    />
  );
}
