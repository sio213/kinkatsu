import { RoutineAddExerciseButton } from '@/components/routines/routine-add-exercise-button';
import { RoutineExerciseRow } from '@/components/routines/routine-exercise-row';
import { BoxedTextInput } from '@/components/ui/boxed-text-input';
import { FormField } from '@/components/ui/form-field';
import { FormFieldStack } from '@/components/ui/form-field-stack';
import { Typography } from '@/constants/theme';
import { useRoutineDraftStore } from '@/lib/routines/draft-store';
import { routineFormSchema, type RoutineFormValues } from '@/lib/routines/validation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFocusEffect } from 'expo-router';
import { forwardRef, useCallback, useEffect, useImperativeHandle } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Keyboard, StyleSheet, View } from 'react-native';

export type RoutineFormHandle = { submit: () => void };

type Props = {
  initialName?: string;
  onSubmit: (values: RoutineFormValues) => void;
  onSubmitDisabledChange?: (disabled: boolean) => void;
  onAddExercise: () => void;
  onPressExercise: () => void;
};

// ルーティンの新規作成(app/routine/new.tsx)・編集(app/routine/edit/[id].tsx)で共通のフォーム本体。
// 名前はこのフォーム内のreact-hook-form状態としてのみ持つが、種目一覧は種目追加ピッカー・
// テンプレートセット編集画面を行き来しても消えないよう useRoutineDraftStore（zustand）を
// 唯一の情報源にし、画面がフォーカスを取り戻すたびにフォーム値へ同期する
export const RoutineForm = forwardRef<RoutineFormHandle, Props>(function RoutineForm(
  { initialName = '', onSubmit, onSubmitDisabledChange, onAddExercise, onPressExercise },
  ref,
) {
  const draftExercises = useRoutineDraftStore((state) => state.exercises);

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitted, isSubmitting },
  } = useForm<RoutineFormValues>({
    resolver: zodResolver(routineFormSchema),
    defaultValues: { name: initialName, exercises: draftExercises },
  });

  const exercises = watch('exercises');
  const hasErrors = Object.keys(errors).length > 0;
  const submitDisabled = isSubmitting || (isSubmitted && hasErrors);

  useImperativeHandle(ref, () => ({ submit: () => handleSubmit(onSubmit)() }), [handleSubmit, onSubmit]);

  useEffect(() => {
    onSubmitDisabledChange?.(submitDisabled);
  }, [submitDisabled, onSubmitDisabledChange]);

  // 名前欄にフォーカスが残ったまま種目追加ピッカー等へ遷移してこの画面がフォーカスを失うと、
  // 戻ってきたときにキーボードが開いたままになる（exercises.tsxと同じ既知の問題への対応）
  useFocusEffect(
    useCallback(() => {
      return () => Keyboard.dismiss();
    }, []),
  );

  // draftExercises(zustandストアの現在値)はストアが更新されるたびに新しい配列参照になるため、
  // 通常のuseEffectで十分同期できる。種目追加ピッカーがpushされて戻ってきた場合（この画面は
  // アンマウントされず裏で待機している）も、ストア自体はどのマウント状態からでも購読が効くため
  // 「フォーカスを取り戻したら同期」というuseFocusEffectは不要で、この画面にいながら種目行を
  // 削除する場合（同一画面内でのストア更新）も同じ仕組みで自然にフォームへ反映される
  useEffect(() => {
    setValue('exercises', draftExercises, { shouldValidate: isSubmitted });
    // isSubmitted/setValueは毎回同じ関数参照ではないため依存に入れると無限ループになる。
    // 同期したいのはdraftExercisesが変わったときだけでよい
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftExercises]);

  return (
    <FormFieldStack>
      <FormField label="名前" required error={errors.name?.message}>
        <Controller
          control={control}
          name="name"
          render={({ field: { value, onChange } }) => (
            <BoxedTextInput
              height={40}
              boxStyle={styles.inputBox}
              style={styles.inputText}
              value={value}
              onChangeText={onChange}
              placeholder="例：胸の日"
              accessibilityLabel="名前"
            />
          )}
        />
      </FormField>

      <FormField label="種目" required error={errors.exercises?.message}>
        {exercises.length === 0 ? (
          <RoutineAddExerciseButton variant="empty" onPress={onAddExercise} />
        ) : (
          <View style={styles.exerciseList}>
            {exercises.map((exercise, index) => (
              <RoutineExerciseRow
                key={`${exercise.exerciseId}-${index}`}
                exercise={exercise}
                onPress={onPressExercise}
              />
            ))}
            <RoutineAddExerciseButton variant="ghost" onPress={onAddExercise} />
          </View>
        )}
      </FormField>
    </FormFieldStack>
  );
});

const styles = StyleSheet.create({
  inputBox: { paddingHorizontal: 12 },
  inputText: Typography.body,
  exerciseList: { gap: 10 },
});
