import { ExerciseForm, type ExerciseFormHandle } from '@/components/exercises/exercise-form';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useExercise, useExercises } from '@/hooks/use-exercises';
import type { ExerciseFormValues } from '@/lib/exercises/validation';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ExerciseEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { exercise, loaded } = useExercise(Number(id));
  const { updateExercise } = useExercises();
  const formRef = useRef<ExerciseFormHandle>(null);
  const [submitDisabled, setSubmitDisabled] = useState(false);

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
          <View style={styles.headerRow}>
            <TouchableOpacity
              style={styles.iconBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="戻る"
              onPress={() => router.back()}
            >
              <IconSymbol name="chevron.left" size={22} color={Colors.textPlaceholder} />
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>
              種目を編集
            </Text>
            <View style={styles.iconBtn} />
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ExerciseForm
            ref={formRef}
            initial={{
              name: exercise.name,
              category: exercise.category,
              note: exercise.note,
              favorite: exercise.favorite,
            }}
            onSubmit={handleSubmit}
            onCancel={() => router.back()}
            autoFocus={false}
            showFooter={false}
            onSubmitDisabledChange={setSubmitDisabled}
          />
        </ScrollView>
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.submitBtn, submitDisabled && styles.submitBtnDisabled]}
            onPress={() => formRef.current?.submit()}
            disabled={submitDisabled}
            accessibilityLabel="保存"
          >
            <Text style={styles.submitBtnText}>保存</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },

  header: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  submitBtn: {
    borderRadius: 8,
    paddingVertical: 13,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: { backgroundColor: Colors.textPlaceholder },
  submitBtnText: { fontSize: 15, fontWeight: '600', color: Colors.onAccent },

  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  notFoundText: { fontSize: 15, color: Colors.textMuted },
});
