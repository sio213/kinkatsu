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
};

export function ExerciseForm({ initial, onSubmit, onCancel, submitLabel = '追加' }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [note, setNote] = useState(initial?.note ?? '');

  const isValid = name.trim().length > 0 && category.length > 0;

  function handleSubmit() {
    if (!isValid) return;
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
        autoFocus
      />

      <Text style={styles.label}>カテゴリ（必須）</Text>
      <View style={styles.chipRow}>
        {EXERCISE_CATEGORIES.map((cat) => {
          const isActive = category === cat;
          return (
            <TouchableOpacity
              key={cat}
              style={[styles.chip, isActive && styles.chipActive]}
              onPress={() => setCategory(cat)}
            >
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{cat}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

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
          style={[styles.submitBtn, !isValid && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!isValid}
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

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  chipText: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  chipTextActive: { color: '#fff' },

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
