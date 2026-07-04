import { ExerciseForm } from '@/components/exercises/exercise-form';
import { Colors } from '@/constants/theme';
import { useExercise, useExercises } from '@/hooks/use-exercises';
import type { ExerciseFormValues } from '@/lib/exercises/validation';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
      <SafeAreaView style={styles.safe}>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>種目が見つかりません</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.title}>種目を編集</Text>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ExerciseForm
            initial={{ name: exercise.name, category: exercise.category, note: exercise.note }}
            onSubmit={handleSubmit}
            onCancel={() => router.back()}
            submitLabel="保存"
            autoFocus={false}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },

  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
  title: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },

  content: { paddingHorizontal: 20, paddingBottom: 40 },

  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  notFoundText: { fontSize: 15, color: Colors.textMuted },
});
