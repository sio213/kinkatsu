import { RoutineExerciseRow } from '@/components/routines/routine-exercise-row';
import { BoxedTextInput } from '@/components/ui/boxed-text-input';
import { DesignIcon } from '@/components/ui/design-icon';
import { FormField } from '@/components/ui/form-field';
import { FormFieldStack } from '@/components/ui/form-field-stack';
import { Colors, Typography } from '@/constants/theme';
import { useRoutineDraftStore } from '@/lib/routines/draft-store';
import { routineFormSchema, type RoutineFormValues } from '@/lib/routines/validation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFocusEffect } from 'expo-router';
import { forwardRef, useCallback, useEffect, useImperativeHandle } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Keyboard, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type RoutineFormHandle = { submit: () => void };

type Props = {
  initialName?: string;
  onSubmit: (values: RoutineFormValues) => void;
  onSubmitDisabledChange?: (disabled: boolean) => void;
  onAddExercise: () => void;
  onPressExercise: (index: number) => void;
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
  const removeExerciseAt = useRoutineDraftStore((state) => state.removeExerciseAt);

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
          <TouchableOpacity
            style={styles.addBtnEmpty}
            onPress={onAddExercise}
            accessibilityRole="button"
            accessibilityLabel="種目を追加"
          >
            <DesignIcon name="add-circle" size={26} color={Colors.accent} />
            <Text style={styles.addBtnEmptyTitle}>種目を追加</Text>
            <Text style={styles.addBtnEmptyNote}>胸・肩・脚など自由に組み合わせ</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.exerciseList}>
            {exercises.map((exercise, index) => (
              <RoutineExerciseRow
                key={`${exercise.exerciseId}-${index}`}
                exercise={exercise}
                onPress={() => onPressExercise(index)}
                onRemove={() => removeExerciseAt(index)}
              />
            ))}
            <TouchableOpacity
              style={styles.addBtnGhost}
              onPress={onAddExercise}
              accessibilityRole="button"
              accessibilityLabel="種目を追加"
            >
              <DesignIcon name="add-circle" size={18} color={Colors.accent} />
              <Text style={styles.addBtnGhostText}>種目を追加</Text>
            </TouchableOpacity>
          </View>
        )}
      </FormField>
    </FormFieldStack>
  );
});

const styles = StyleSheet.create({
  inputBox: { paddingHorizontal: 12 },
  inputText: Typography.body,

  addBtnEmpty: {
    width: '100%',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 20,
    alignItems: 'center',
    gap: 6,
  },
  addBtnEmptyTitle: { ...Typography.bodyStrong, color: Colors.textPrimary },
  addBtnEmptyNote: { ...Typography.caption, color: Colors.textMuted },

  exerciseList: { gap: 10 },
  addBtnGhost: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    width: '100%',
    backgroundColor: Colors.accentSurface,
    borderRadius: 8,
    paddingVertical: 11,
  },
  addBtnGhostText: { ...Typography.footnote, fontWeight: '600', color: Colors.accent },
});
