import { ExerciseForm, type ExerciseFormHandle } from '@/components/exercises/exercise-form';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors } from '@/constants/theme';
import { useExercises } from '@/hooks/use-exercises';
import type { ExerciseFormValues } from '@/lib/exercises/validation';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
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

export default function ExerciseNewScreen() {
  const { name: initialName } = useLocalSearchParams<{ name?: string }>();
  const router = useRouter();
  const { addExercise } = useExercises();
  const formRef = useRef<ExerciseFormHandle>(null);
  const [submitDisabled, setSubmitDisabled] = useState(false);

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

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen
        options={{
          // モーダル表示なのでネイティブの戻るチェブロンは出ない。スワイプダウンで閉じられるのと
          // 同じ意味の明示的な閉じる手段として、キャンセルボタンを独自に描画する
          headerTitleAlign: 'left',
          headerLeft: () => null,
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="キャンセル"
            >
              <Text style={styles.cancelText}>キャンセル</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ExerciseForm
            ref={formRef}
            initial={{ name: initialName ?? '' }}
            onSubmit={handleSubmit}
            onCancel={() => router.back()}
            showFooter={false}
            onSubmitDisabledChange={setSubmitDisabled}
          />
        </ScrollView>
        <View style={styles.footer}>
          <PrimaryButton
            label="保存する"
            onPress={() => formRef.current?.submit()}
            disabled={submitDisabled}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },

  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },

  cancelText: { fontSize: 15, color: Colors.accent },
});
