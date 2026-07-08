import { ExerciseFormScreen } from '@/components/exercises/exercise-form-screen';
import { Colors, Typography } from '@/constants/theme';
import { useExercise, useExercises } from '@/hooks/use-exercises';
import { parseFormPoints } from '@/lib/exercises/form-points';
import type { ExerciseFormValues } from '@/lib/exercises/validation';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>種目が見つかりません</Text>
        </View>
      </SafeAreaView>
    );
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  notFoundText: { ...Typography.body, color: Colors.textMuted },
});
