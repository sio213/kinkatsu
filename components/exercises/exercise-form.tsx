import { chipStyles } from '@/components/exercises/chip-styles';
import { EXERCISE_CATEGORIES } from '@/lib/exercises/constants';
import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export type ExerciseFormValues = {
  name: string;
  category: string;
  note: string | null;
};

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
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const nameValid = name.trim().length > 0;
  const categoryValid = category.length > 0;

  function handleSubmit() {
    if (!nameValid || !categoryValid) {
      setAttemptedSubmit(true);
      return;
    }
    onSubmit({ name: name.trim(), category, note: note.trim() || null });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>種目名（必須）</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="例: ベンチプレス"
        returnKeyType="done"
        autoFocus={autoFocus}
      />
      {attemptedSubmit && !nameValid ? (
        <Text style={styles.errorText}>種目名を入力してください</Text>
      ) : null}

      <Text style={styles.label}>カテゴリ（必須）</Text>
      <View style={styles.chipRow}>
        {EXERCISE_CATEGORIES.map((cat) => {
          const isActive = category === cat;
          return (
            <TouchableOpacity
              key={cat}
              style={[chipStyles.chip, isActive && chipStyles.chipActive]}
              onPress={() => setCategory(cat)}
            >
              <Text style={[chipStyles.chipText, isActive && chipStyles.chipTextActive]}>{cat}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {attemptedSubmit && !categoryValid ? (
        <Text style={styles.errorText}>カテゴリを選択してください</Text>
      ) : null}

      <Text style={styles.label}>メモ（任意）</Text>
      <TextInput
        style={[styles.input, styles.inputMultiline]}
        value={note}
        onChangeText={setNote}
        placeholder="フォームのコツなど"
        multiline
        numberOfLines={2}
      />

      <View style={styles.buttons}>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelBtnText}>キャンセル</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.submitBtn, attemptedSubmit && (!nameValid || !categoryValid) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
        >
          <Text style={styles.submitBtnText}>{submitLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },

  label: { fontSize: 13, fontWeight: '600', color: '#475569' },

  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    color: '#1E293B',
    backgroundColor: '#fff',
  },
  inputMultiline: { minHeight: 56, textAlignVertical: 'top' },

  errorText: { fontSize: 12, color: '#DC2626', marginTop: -4 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },

  buttons: { flexDirection: 'row', gap: 8, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  submitBtn: {
    flex: 2,
    borderRadius: 8,
    paddingVertical: 10,
    backgroundColor: '#2563EB',
    alignItems: 'center',
  },
  submitBtnDisabled: { backgroundColor: '#94A3B8' },
  submitBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
