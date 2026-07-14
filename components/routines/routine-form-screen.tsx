import { RoutineForm, type RoutineFormHandle } from '@/components/routines/routine-form';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors } from '@/constants/theme';
import type { RoutineFormValues } from '@/lib/routines/validation';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = {
  initialName?: string;
  onSubmit: (values: RoutineFormValues) => void;
  onAddExercise: () => void;
  onPressExercise: (index: number) => void;
  onPressReminder: () => void;
};

// ルーティンの新規作成・編集で共通の「フォーム＋下部固定の保存ボタン」の画面シェル。
// components/exercises/exercise-form-screen.tsxと同じ構造。保存ボタンはこの中で完結するため
// （呼び出し側から外部トリガーで保存する必要が無いため）forwardRefは持たない
export function RoutineFormScreen({ initialName, onSubmit, onAddExercise, onPressExercise, onPressReminder }: Props) {
  const formRef = useRef<RoutineFormHandle>(null);
  const [submitDisabled, setSubmitDisabled] = useState(false);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <RoutineForm
            ref={formRef}
            initialName={initialName}
            onSubmit={onSubmit}
            onSubmitDisabledChange={setSubmitDisabled}
            onAddExercise={onAddExercise}
            onPressExercise={onPressExercise}
            onPressReminder={onPressReminder}
          />
        </ScrollView>
        <View style={styles.footer}>
          <PrimaryButton label="保存" onPress={() => formRef.current?.submit()} disabled={submitDisabled} />
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
});
