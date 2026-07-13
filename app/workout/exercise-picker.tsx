import { NotFoundState } from '@/components/ui/not-found-state';
import { ExercisePickerView } from '@/components/workout/exercise-picker-view';
import { Colors } from '@/constants/theme';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { notifyPrefilled } from '@/lib/workout/prefill-feedback';
import { addExercisesToSession } from '@/lib/workout/session';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ExercisePickerScreen() {
  const { sessionId: sessionIdParam } = useLocalSearchParams<{ sessionId: string }>();
  const sessionId = Number(sessionIdParam);
  const router = useRouter();
  const pushDebounced = useDebouncedPush();
  const isAddingRef = useRef(false);

  const handlePressInfo = useCallback(
    (id: number) => {
      pushDebounced(`/exercise/${id}`);
    },
    [pushDebounced],
  );

  const handleConfirm = useCallback(
    async (selectedIds: number[]) => {
      // sessionIdが不正(NaN)ならNotFoundState分岐で早期returnしておりExercisePickerView自体が
      // 描画されないため、この関数がonConfirmとして呼ばれる時点でsessionIdは必ず有限
      if (isAddingRef.current) return;
      isAddingRef.current = true;
      try {
        const prefilled = await addExercisesToSession(sessionId, selectedIds);
        notifyPrefilled(prefilled);
        router.back();
      } catch (e) {
        console.error('[add exercises to session]', e);
        Alert.alert('エラー', '種目を追加できませんでした。');
      } finally {
        isAddingRef.current = false;
      }
    },
    [sessionId, router],
  );

  if (!Number.isFinite(sessionId)) {
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
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ExercisePickerView
        excludeSessionId={sessionId}
        onPressInfo={handlePressInfo}
        onConfirm={handleConfirm}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
});
