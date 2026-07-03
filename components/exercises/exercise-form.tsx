import { chipStyles } from '@/components/exercises/chip-styles';
import { FormLabel } from '@/components/ui/form-label';
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
import { Controller, useForm } from 'react-hook-form';
import {
  StyleSheet,
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

type Props = {
  initial?: { name?: string; category?: string; note?: string | null };
  onSubmit: (values: ExerciseFormValues) => void;
  onCancel: () => void;
  submitLabel?: string;
  autoFocus?: boolean;
};

export function ExerciseForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel = '追加',
  autoFocus = true,
}: Props) {
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
    },
  });
  const hasErrors = Object.keys(errors).length > 0;
  const submitDisabled = isSubmitting || (isSubmitted && hasErrors);

  return (
    <View style={styles.container}>
      <FormLabel required>種目名</FormLabel>
      <Controller
        control={control}
        name="name"
        render={({ field: { value, onChange } }) => (
          <TextInput
            style={styles.input}
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

      <View style={styles.buttons}>
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={onCancel}
          accessibilityLabel="キャンセル"
        >
          <Text style={styles.cancelBtnText}>キャンセル</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.submitBtn, submitDisabled && styles.submitBtnDisabled]}
          onPress={handleSubmit(onSubmit)}
          disabled={submitDisabled}
          accessibilityLabel={submitLabel}
        >
          <Text style={styles.submitBtnText}>{submitLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },

  input: {
    borderWidth: 1,
    borderColor: Colors.light.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    color: Colors.light.textPrimary,
    backgroundColor: Colors.light.surface,
  },
  inputMultiline: { minHeight: 56, textAlignVertical: 'top' },

  errorText: { fontSize: 12, color: Colors.light.danger, marginTop: -4 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },

  buttons: { flexDirection: 'row', gap: 8, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    backgroundColor: Colors.light.border,
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: Colors.light.textSecondary },
  submitBtn: {
    flex: 2,
    borderRadius: 8,
    paddingVertical: 10,
    backgroundColor: Colors.light.accent,
    alignItems: 'center',
  },
  submitBtnDisabled: { backgroundColor: Colors.light.textPlaceholder },
  submitBtnText: { fontSize: 14, fontWeight: '600', color: Colors.light.onAccent },
});
