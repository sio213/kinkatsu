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
  // newSessionは、start-chooser「自分で選ぶ」から作成直後のセッションで直接この画面へ
  // 遷移してきた場合にのみ付く（2026-07-20）。この経路では/workout/{id}を一度もpushして
  // いないため、確定後はrouter.back()ではなくreplaceで/workout/{id}へ差し込む必要がある
  // （通常経路＝[id].tsxのAddExerciseButton/⋮メニュー経由では既に/workout/{id}がスタックに
  // 積まれているため、従来通りbackで戻る）
  const { sessionId: sessionIdParam, newSession } = useLocalSearchParams<{
    sessionId: string;
    newSession?: string;
  }>();
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
        // newSession経路は/workout/{id}が未マウントのため、ここでのnotifyPrefilledは
        // 購読者不在で無視される（ゴースト表示・新規カードへの自動フォーカスは効かないが、
        // 種目・セット自体はDBに保存済みで、/workout/{id}側のlive queryには通常通り反映される）
        notifyPrefilled(prefilled);
        if (newSession === '1') {
          router.replace(`/workout/${sessionId}`);
        } else {
          router.back();
        }
      } catch (e) {
        console.error('[add exercises to session]', e);
        Alert.alert('エラー', '種目を追加できませんでした。');
      } finally {
        isAddingRef.current = false;
      }
    },
    [sessionId, router, newSession],
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
