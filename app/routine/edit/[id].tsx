import { RoutineFormScreen } from '@/components/routines/routine-form-screen';
import { NotFoundState } from '@/components/ui/not-found-state';
import { Colors } from '@/constants/theme';
import { useRoutines } from '@/hooks/use-routines';
import { getRoutineDetail } from '@/lib/routines/db';
import { useRoutineDraftStore } from '@/lib/routines/draft-store';
import { toDraftExercises, toRoutineInput, type RoutineFormValues } from '@/lib/routines/validation';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Status = 'loading' | 'error' | 'not-found' | 'ready';

export default function RoutineEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const routineId = Number(id);
  const router = useRouter();
  const { updateRoutine } = useRoutines();
  const hydrateDraft = useRoutineDraftStore((state) => state.hydrate);

  // getRoutineDetailはlive queryではなく一度きりの取得。以降の編集内容はドラフトストアが
  // 唯一の情報源になり、保存時にupdateRoutineへまとめて書き戻す
  const [status, setStatus] = useState<Status>('loading');
  const [name, setName] = useState('');

  useEffect(() => {
    if (!Number.isFinite(routineId)) {
      setStatus('not-found');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    getRoutineDetail(routineId)
      .then((detail) => {
        if (cancelled) return;
        if (!detail) {
          setStatus('not-found');
          return;
        }
        setName(detail.routine.name);
        hydrateDraft(toDraftExercises(detail));
        setStatus('ready');
      })
      .catch((e) => {
        if (cancelled) return;
        console.error('[routine detail fetch]', e);
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [routineId, hydrateDraft]);

  const handleSubmit = useCallback(
    async (values: RoutineFormValues) => {
      try {
        await updateRoutine(routineId, toRoutineInput(values));
        router.back();
      } catch (e) {
        console.error('[routine update]', e);
        Alert.alert('エラー', 'ルーティンの保存に失敗しました。');
      }
    },
    [routineId, updateRoutine, router],
  );

  const handleAddExercise = useCallback(() => {
    router.push('/routine/exercise-picker');
  }, [router]);

  const handlePressExercise = useCallback(() => {
    router.push('/routine/exercise-edit');
  }, [router]);

  if (status === 'loading') {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={Colors.accent} accessibilityLabel="読み込み中" />
        </View>
      </SafeAreaView>
    );
  }

  if (status === 'not-found' || status === 'error') {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <NotFoundState
          message={status === 'error' ? 'ルーティンの読み込みに失敗しました' : 'ルーティンが見つかりません'}
          actionLabel="戻る"
          onPressAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  return (
    <RoutineFormScreen
      key={routineId}
      initialName={name}
      onSubmit={handleSubmit}
      onAddExercise={handleAddExercise}
      onPressExercise={handlePressExercise}
    />
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
