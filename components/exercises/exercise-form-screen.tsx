import { ExerciseForm, type ExerciseFormHandle } from '@/components/exercises/exercise-form';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors } from '@/constants/theme';
import type { ExerciseFormValues } from '@/lib/exercises/validation';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = {
  initial?: React.ComponentProps<typeof ExerciseForm>['initial'];
  onSubmit: (values: ExerciseFormValues) => void;
};

// 保存ボタンはこのシェル内部で完結するため、外部に公開するのはfocusNameのみ
// （newスクリーンが遷移完了後にフォーカスするために使う）
export type ExerciseFormScreenHandle = { focusName: () => void };

// 種目の新規作成(app/exercise/new.tsx)・編集(app/exercise/edit/[id].tsx)で共通の
// 「フォーム＋下部固定の保存ボタン」の画面シェル。データ取得・not-found判定は呼び出し側の責務。
export const ExerciseFormScreen = forwardRef<ExerciseFormScreenHandle, Props>(function ExerciseFormScreen(
  { initial, onSubmit },
  ref,
) {
  const formRef = useRef<ExerciseFormHandle>(null);
  const [submitDisabled, setSubmitDisabled] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      focusName: () => formRef.current?.focusName(),
    }),
    [],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ExerciseForm
            ref={formRef}
            initial={initial}
            onSubmit={onSubmit}
            onSubmitDisabledChange={setSubmitDisabled}
          />
        </ScrollView>
        <View style={styles.footer}>
          <PrimaryButton
            label="保存"
            onPress={() => formRef.current?.submit()}
            disabled={submitDisabled}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
});

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
