import { ExerciseForm, type ExerciseFormHandle } from '@/components/exercises/exercise-form';
import { FocusedInputScrollProvider } from '@/components/ui/focused-input-scroll-context';
import { FormScrollProvider } from '@/components/ui/form-scroll-context';
import { KeyboardAvoidingScreen } from '@/components/ui/keyboard-avoiding-screen';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ScreenFooter } from '@/components/ui/screen-footer';
import { ScreenStyles } from '@/constants/theme';
import type { ExerciseFormValues } from '@/lib/exercises/validation';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
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
  const scrollRef = useRef<ScrollView>(null);
  const [submitDisabled, setSubmitDisabled] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      focusName: () => formRef.current?.focusName(),
    }),
    [],
  );

  return (
    <SafeAreaView style={ScreenStyles.safeArea} edges={['bottom']}>
      <KeyboardAvoidingScreen>
        <FormScrollProvider scrollRef={scrollRef}>
          <FocusedInputScrollProvider scrollRef={scrollRef}>
            <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <ExerciseForm
                ref={formRef}
                initial={initial}
                onSubmit={onSubmit}
                onSubmitDisabledChange={setSubmitDisabled}
              />
            </ScrollView>
          </FocusedInputScrollProvider>
        </FormScrollProvider>
        <ScreenFooter>
          <PrimaryButton
            label="保存"
            onPress={() => formRef.current?.submit()}
            disabled={submitDisabled}
          />
        </ScreenFooter>
      </KeyboardAvoidingScreen>
    </SafeAreaView>
  );
});

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
});
