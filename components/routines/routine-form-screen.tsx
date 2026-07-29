import { RoutineForm, type RoutineFormHandle } from '@/components/routines/routine-form';
import { FocusedInputScrollProvider } from '@/components/ui/focused-input-scroll-context';
import { FormScrollProvider } from '@/components/ui/form-scroll-context';
import { KeyboardAvoidingScreen } from '@/components/ui/keyboard-avoiding-screen';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ScreenFooter } from '@/components/ui/screen-footer';
import { ScreenStyles } from '@/constants/theme';
import type { RoutineFormValues } from '@/lib/routines/validation';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = {
  initialName?: string;
  autoFocusName?: boolean;
  onSubmit: (values: RoutineFormValues) => void;
  onAddExercise: () => void;
  onPressExercise: (index: number) => void;
  onPressReminder: () => void;
};

// ルーティンの新規作成・編集で共通の「フォーム＋下部固定の保存ボタン」の画面シェル。
// components/exercises/exercise-form-screen.tsxと同じ構造。保存ボタンはこの中で完結するため
// （呼び出し側から外部トリガーで保存する必要が無いため）forwardRefは持たない
export function RoutineFormScreen({
  initialName,
  autoFocusName,
  onSubmit,
  onAddExercise,
  onPressExercise,
  onPressReminder,
}: Props) {
  const formRef = useRef<RoutineFormHandle>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [submitDisabled, setSubmitDisabled] = useState(false);

  return (
    <SafeAreaView style={ScreenStyles.safeArea} edges={['bottom']}>
      <KeyboardAvoidingScreen>
        <FormScrollProvider scrollRef={scrollRef}>
          <FocusedInputScrollProvider scrollRef={scrollRef}>
            <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <RoutineForm
                ref={formRef}
                initialName={initialName}
                autoFocusName={autoFocusName}
                onSubmit={onSubmit}
                onSubmitDisabledChange={setSubmitDisabled}
                onAddExercise={onAddExercise}
                onPressExercise={onPressExercise}
                onPressReminder={onPressReminder}
              />
            </ScrollView>
          </FocusedInputScrollProvider>
        </FormScrollProvider>
        <ScreenFooter>
          <PrimaryButton label="保存" onPress={() => formRef.current?.submit()} disabled={submitDisabled} />
        </ScreenFooter>
      </KeyboardAvoidingScreen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
});
