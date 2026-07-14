import { RoutineAddExerciseButton } from '@/components/routines/routine-add-exercise-button';
import { RoutineExerciseRow } from '@/components/routines/routine-exercise-row';
import { RoutineReminderField } from '@/components/routines/routine-reminder-field';
import { BoxedTextInput } from '@/components/ui/boxed-text-input';
import { FormField } from '@/components/ui/form-field';
import { FormFieldStack } from '@/components/ui/form-field-stack';
import { Typography } from '@/constants/theme';
import { useRoutineDraftStore } from '@/lib/routines/draft-store';
import { ensurePermission, getPermissionState, type PermissionState } from '@/lib/notifications/permissions';
import { routineFormSchema, type RoutineFormValues } from '@/lib/routines/validation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFocusEffect } from 'expo-router';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Keyboard, StyleSheet, View } from 'react-native';

export type RoutineFormHandle = { submit: () => void };

type Props = {
  initialName?: string;
  onSubmit: (values: RoutineFormValues) => void;
  onSubmitDisabledChange?: (disabled: boolean) => void;
  onAddExercise: () => void;
  onPressExercise: () => void;
  onPressReminder: () => void;
};

// ルーティンの新規作成(app/routine/new.tsx)・編集(app/routine/edit/[id].tsx)で共通のフォーム本体。
// 名前はこのフォーム内のreact-hook-form状態としてのみ持つが、種目一覧は種目追加ピッカー・
// テンプレートセット編集画面を行き来しても消えないよう useRoutineDraftStore（zustand）を
// 唯一の情報源にし、画面がフォーカスを取り戻すたびにフォーム値へ同期する
export const RoutineForm = forwardRef<RoutineFormHandle, Props>(function RoutineForm(
  { initialName = '', onSubmit, onSubmitDisabledChange, onAddExercise, onPressExercise, onPressReminder },
  ref,
) {
  const draftExercises = useRoutineDraftStore((state) => state.exercises);
  const reminderEnabled = useRoutineDraftStore((state) => state.reminderEnabled);
  const reminder = useRoutineDraftStore((state) => state.reminder);
  const setReminderEnabled = useRoutineDraftStore((state) => state.setReminderEnabled);
  const [permState, setPermState] = useState<PermissionState | null>(null);

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    trigger,
    formState: { errors, isSubmitted, isSubmitting },
  } = useForm<RoutineFormValues>({
    resolver: zodResolver(routineFormSchema),
    defaultValues: { name: initialName, exercises: draftExercises, reminderEnabled, reminder },
  });

  const exercises = watch('exercises');
  const hasErrors = Object.keys(errors).length > 0;
  const submitDisabled = isSubmitting || (isSubmitted && hasErrors);

  useEffect(() => {
    getPermissionState().then(setPermState);
  }, []);

  const handleRequestPermission = useCallback(async () => {
    const r = await ensurePermission();
    setPermState(r);
  }, []);

  const handleToggleReminderEnabled = useCallback(
    (next: boolean) => {
      setReminderEnabled(next);
    },
    [setReminderEnabled],
  );

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

  // リマインダー設定画面(app/routine/reminder.tsx)を行き来しても消えないよう、exercisesと
  // 同じくドラフトストアを唯一の情報源にしてフォーム値へ同期する。
  // reminderEnabled自体はz.boolean()なだけでエラーを持たないが、その値次第でreminderフィールドの
  // refineエラー(「通知タイミングを設定してください」)が有効かどうかが変わる。setValueの
  // shouldValidateはreminderEnabled自身しか再検証しないため、トグルOFFにしてもreminder側の
  // 古いエラーが残り保存ボタンが押せなくなる(reminder-form.tsxのkind切替と同じ不具合パターン)。
  // フォーム全体を再検証してエラーを最新の状態に総入れ替えする
  useEffect(() => {
    setValue('reminderEnabled', reminderEnabled);
    if (isSubmitted) trigger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminderEnabled]);

  useEffect(() => {
    setValue('reminder', reminder, { shouldValidate: isSubmitted });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminder]);

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

      <FormField label="リマインダー" error={errors.reminder?.message}>
        <RoutineReminderField
          enabled={reminderEnabled}
          onToggleEnabled={handleToggleReminderEnabled}
          reminder={reminder}
          onPressConfigure={onPressReminder}
          permState={permState}
          onRequestPermission={handleRequestPermission}
          now={new Date()}
          hasError={!!errors.reminder}
        />
      </FormField>
    </FormFieldStack>
  );
});

const styles = StyleSheet.create({
  inputBox: { paddingHorizontal: 12 },
  inputText: Typography.body,
  exerciseList: { gap: 10 },
});
