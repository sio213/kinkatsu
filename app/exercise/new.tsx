import {
  ExerciseFormScreen,
  type ExerciseFormScreenHandle,
} from '@/components/exercises/exercise-form-screen';
import { useExercises } from '@/hooks/use-exercises';
import type { ExerciseFormValues } from '@/lib/exercises/validation';
import type { ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { Alert } from 'react-native';

export default function ExerciseNewScreen() {
  const { name: initialName } = useLocalSearchParams<{ name?: string }>();
  const router = useRouter();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const { addExercise } = useExercises();
  const formRef = useRef<ExerciseFormScreenHandle>(null);

  const handleSubmit = useCallback(
    async (values: ExerciseFormValues) => {
      try {
        await addExercise(values);
        router.back();
      } catch (e) {
        console.error('[exercise create]', e);
        Alert.alert('エラー', '種目の保存に失敗しました。');
      }
    },
    [addExercise, router],
  );

  // 遷移アニメーション中にキーボードが被さらないよう、pushのスライドインアニメーションが
  // 完了してから（=ネイティブの'transitionEnd'イベント）種目名欄にフォーカスする。
  // useFocusEffectのfocus/blurは画面遷移の開始時点で発火するため、この用途には使えない
  useEffect(() => {
    return navigation.addListener('transitionEnd', (e) => {
      if (!e.data.closing) {
        formRef.current?.focusName();
      }
    });
  }, [navigation]);

  return (
    <ExerciseFormScreen ref={formRef} initial={{ name: initialName ?? '' }} onSubmit={handleSubmit} />
  );
}
