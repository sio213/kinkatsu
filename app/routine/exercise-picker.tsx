import { ExercisePickerView } from '@/components/workout/exercise-picker-view';
import { ScreenStyles } from '@/constants/theme';
import type { Exercise } from '@/db/schema';
import { useExercises } from '@/hooks/use-exercises';
import { buildInitialRoutineSets } from '@/lib/routines/db';
import { useRoutineDraftStore } from '@/lib/routines/draft-store';
import type { DraftExercise } from '@/lib/routines/validation';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RoutineExercisePickerScreen() {
  const router = useRouter();
  const { exercises } = useExercises();
  const addExercises = useRoutineDraftStore((state) => state.addExercises);
  // ルーティンフォーム画面から開いた場合(returnTo無し)は、テンプレートセット編集画面が
  // まだスタックに無いためreplaceで置き換える。テンプレートセット編集画面自身の
  // 「種目を追加」から開いた場合(returnTo==='exercise-edit')は、その画面が既にスタックに
  // あるので単に戻るだけでよい(replaceすると同じ画面がスタックに二重に積まれてしまう)
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();

  // 連打防止・失敗時のAlertはExercisePickerViewが持つため、ここは確定処理と遷移だけを書く
  const handleConfirm = useCallback(
    async (selectedIds: number[]) => {
      // 種目追加ピッカーの確定までの短い間にDBから種目が消えることは通常起きないが、
      // 万一selectedIdsの一部がexercises一覧に見つからない場合はその種目だけを静かに
      // スキップする（app/workout/exercise-swap.tsxのfind失敗時と同じ方針）。複数選択の
      // ため、選択順を保ったまま見つかった種目だけで残りを正常に追加する
      const found = selectedIds
        .map((id) => exercises.find((e) => e.id === id))
        .filter((e): e is Exercise => e != null);

      const setsList = await Promise.all(found.map((e) => buildInitialRoutineSets(e.id)));
      const draftExercises: DraftExercise[] = found.map((exercise, i) => ({
        exerciseId: exercise.id,
        name: exercise.name,
        category: exercise.category,
        measurementType: exercise.measurementType,
        source: exercise.source,
        slug: exercise.slug,
        sets: setsList[i],
      }));

      addExercises(draftExercises);
      if (returnTo === 'exercise-edit') {
        router.back();
      } else {
        // ルーティンフォームへ戻さず、追加した種目のセット数・重量をその場で編集できるよう
        // テンプレートセット編集画面へ遷移する(replaceでこの種目追加ピッカー自体を履歴から
        // 置き換えることで、編集画面から戻ったときにフォーム画面へ正しく戻る)
        router.replace('/routine/exercise-edit');
      }
    },
    [exercises, addExercises, router, returnTo],
  );

  return (
    <SafeAreaView style={ScreenStyles.safeArea} edges={['bottom']}>
      <ExercisePickerView onConfirm={handleConfirm} />
    </SafeAreaView>
  );
}
