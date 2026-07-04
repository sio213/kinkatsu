import { chipStyles } from '@/components/exercises/chip-styles';
import { FormLabel } from '@/components/ui/form-label';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SectionHeading } from '@/components/ui/section-heading';
import { Colors } from '@/constants/theme';
import {
  EXERCISE_CATEGORIES,
  getCategoryLabel,
  type ExerciseCategory,
} from '@/lib/exercises/constants';
import {
  exerciseSchema,
  type ExerciseFormValues,
} from '@/lib/exercises/validation';
import { zodResolver } from '@hookform/resolvers/zod';
import { forwardRef, useEffect, useImperativeHandle } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

function toExerciseCategory(value: string | undefined): ExerciseCategory | undefined {
  return (EXERCISE_CATEGORIES as readonly string[]).includes(value ?? '')
    ? (value as ExerciseCategory)
    : undefined;
}

export type ExerciseFormHandle = { submit: () => void };

type Props = {
  initial?: { name?: string; category?: string; note?: string | null; favorite?: boolean };
  onSubmit: (values: ExerciseFormValues) => void;
  onCancel: () => void;
  submitLabel?: string;
  autoFocus?: boolean;
  showCancel?: boolean;
  // 呼び出し側が下部固定ボタンを自前で描画する場合はfalseにする（onSubmitDisabledChangeで無効状態を受け取る）
  showFooter?: boolean;
  onSubmitDisabledChange?: (disabled: boolean) => void;
};

export const ExerciseForm = forwardRef<ExerciseFormHandle, Props>(function ExerciseForm(
  {
    initial,
    onSubmit,
    onCancel,
    submitLabel = '追加',
    autoFocus = true,
    showCancel = true,
    showFooter = true,
    onSubmitDisabledChange,
  },
  ref,
) {
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitted, isSubmitting },
  } = useForm<ExerciseFormValues>({
    resolver: zodResolver(exerciseSchema),
    defaultValues: {
      name: initial?.name ?? '',
      category: toExerciseCategory(initial?.category),
      note: initial?.note ?? '',
      favorite: initial?.favorite ?? false,
    },
  });
  const hasErrors = Object.keys(errors).length > 0;
  const submitDisabled = isSubmitting || (isSubmitted && hasErrors);

  useImperativeHandle(ref, () => ({ submit: () => handleSubmit(onSubmit)() }), [
    handleSubmit,
    onSubmit,
  ]);

  useEffect(() => {
    onSubmitDisabledChange?.(submitDisabled);
  }, [submitDisabled, onSubmitDisabledChange]);

  return (
    <View style={styles.container}>
      <FormLabel required>種目名</FormLabel>
      <Controller
        control={control}
        name="name"
        render={({ field: { value, onChange } }) => (
          <TextInput
            style={[styles.input, styles.nameInput]}
            value={value}
            onChangeText={onChange}
            placeholder="例: ベンチプレス"
            returnKeyType="done"
            autoFocus={autoFocus}
            accessibilityLabel="種目名"
          />
        )}
      />
      {errors.name ? (
        <Text style={styles.errorText}>{errors.name.message}</Text>
      ) : null}

      <FormLabel required>カテゴリ</FormLabel>
      <Controller
        control={control}
        name="category"
        render={({ field: { value, onChange } }) => (
          <View style={styles.chipRow}>
            {EXERCISE_CATEGORIES.map((cat) => {
              const isActive = value === cat;
              const label = getCategoryLabel(cat);
              return (
                <TouchableOpacity
                  key={cat}
                  style={[chipStyles.chip, isActive && chipStyles.chipActive]}
                  onPress={() => onChange(cat)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isActive }}
                  accessibilityLabel={label}
                >
                  <Text style={[chipStyles.chipText, isActive && chipStyles.chipTextActive]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      />
      {errors.category ? (
        <Text style={styles.errorText}>{errors.category.message}</Text>
      ) : null}

      <FormLabel>メモ</FormLabel>
      <Controller
        control={control}
        name="note"
        render={({ field: { value, onChange } }) => (
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={value ?? ''}
            onChangeText={onChange}
            placeholder="フォームのコツなど"
            multiline
            numberOfLines={2}
            accessibilityLabel="メモ"
          />
        )}
      />

      <View style={styles.favoriteRow}>
        <SectionHeading>お気に入りに追加</SectionHeading>
        <Controller
          control={control}
          name="favorite"
          render={({ field: { value, onChange } }) => (
            <Switch
              value={value}
              onValueChange={onChange}
              trackColor={{ true: Colors.accent, false: Colors.borderStrong }}
              thumbColor={Colors.surface}
              accessibilityLabel="お気に入りに追加"
            />
          )}
        />
      </View>

      {showFooter && (
        <View style={styles.buttons}>
          {showCancel && (
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onCancel}
              accessibilityLabel="キャンセル"
            >
              <Text style={styles.cancelBtnText}>キャンセル</Text>
            </TouchableOpacity>
          )}
          <PrimaryButton
            label={submitLabel}
            onPress={handleSubmit(onSubmit)}
            disabled={submitDisabled}
            style={styles.submitBtn}
          />
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: 8 },

  input: {
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 14,
    color: Colors.textPrimary,
    backgroundColor: Colors.surface,
  },
  nameInput: { fontSize: 15, fontWeight: '600' },
  inputMultiline: { minHeight: 56, textAlignVertical: 'top' },

  errorText: { fontSize: 12, color: Colors.danger, marginTop: -4 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },

  favoriteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },

  buttons: { flexDirection: 'row', gap: 8, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    backgroundColor: Colors.border,
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  submitBtn: { flex: 2 },
});
