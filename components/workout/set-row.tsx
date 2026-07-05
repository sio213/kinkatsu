import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import type { Set } from '@/db/schema';
import type { MeasurementType } from '@/lib/exercises/constants';
import { MEASUREMENT_COLUMNS, type SetColumn } from '@/lib/workout/set-format';
import type { SetValues } from '@/lib/workout/sets';
import { memo, useRef, useState } from 'react';
import { Alert, Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type Props = {
  set: Set;
  exerciseName: string;
  measurementType: MeasurementType;
  onSave: (setId: number, values: SetValues) => Promise<void>;
  onReopen: (setId: number) => Promise<void>;
};

function toDisplayValues(columns: SetColumn[], set: Set): Record<string, string> {
  return Object.fromEntries(columns.map((c) => [c.key, c.toDisplay(set[c.key])]));
}

export const SetRow = memo(function SetRow({
  set,
  exerciseName,
  measurementType,
  onSave,
  onReopen,
}: Props) {
  const columns = MEASUREMENT_COLUMNS[measurementType];
  const done = set.completedAt != null;
  const isBusyRef = useRef(false);

  const [values, setValues] = useState<Record<string, string>>(() => toDisplayValues(columns, set));

  const handleTogglePress = async () => {
    if (isBusyRef.current) return;
    isBusyRef.current = true;
    Keyboard.dismiss();
    try {
      if (done) {
        await onReopen(set.id);
        setValues(toDisplayValues(columns, set));
      } else {
        // 空欄はnull保存でよいが、非空の入力がパースに失敗した場合（不正な貼り付け等）は
        // 気づかれずに値が消えたまま完了扱いにならないよう、保存せず気づかせる
        const invalidColumn = columns.find((c) => {
          const text = (values[c.key] ?? '').trim();
          return text !== '' && c.fromDisplay(text) == null;
        });
        if (invalidColumn) {
          Alert.alert('入力エラー', `${invalidColumn.label}の値を確認してください。`);
          return;
        }
        const parsed = Object.fromEntries(
          columns.map((c) => [c.key, c.fromDisplay(values[c.key] ?? '')]),
        );
        await onSave(set.id, parsed);
      }
    } catch (e) {
      console.error('[set toggle]', e);
      Alert.alert('エラー', 'セットを保存できませんでした。');
    } finally {
      isBusyRef.current = false;
    }
  };

  return (
    <View style={styles.row}>
      <Text style={styles.number}>{set.setNumber}</Text>
      {columns.map((c) => {
        const input = (
          <TextInput
            style={[styles.cell, done && styles.cellDone]}
            value={done ? c.toDisplay(set[c.key]) : values[c.key]}
            onChangeText={(text) => setValues((prev) => ({ ...prev, [c.key]: text }))}
            editable={!done}
            pointerEvents={done ? 'none' : 'auto'}
            keyboardType={c.keyboardType}
            textAlign="center"
            placeholder="-"
            placeholderTextColor={Colors.textPlaceholder}
            accessibilityLabel={`${exerciseName} セット${set.setNumber} ${c.label}`}
          />
        );
        // 完了済みセルはロックされ見た目だけでは編集し直せることが伝わりにくいため、
        // タップでも✓と同じ「編集に戻す」操作を呼べるようにする
        if (!done) return <View key={c.key} style={styles.cellWrapper}>{input}</View>;
        return (
          <TouchableOpacity
            key={c.key}
            style={styles.cellWrapper}
            onPress={handleTogglePress}
            accessibilityRole="button"
            accessibilityLabel={`${exerciseName} セット${set.setNumber}を編集`}
          >
            {input}
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity
        style={[styles.check, done && styles.checkDone]}
        onPress={handleTogglePress}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={`${exerciseName} セット${set.setNumber}`}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        {done && <IconSymbol name="checkmark" size={14} color={Colors.onAccent} />}
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 5 },
  number: { width: 32, textAlign: 'center', fontSize: 12, fontWeight: '600', color: Colors.textPlaceholder },
  cellWrapper: { flex: 1 },
  cell: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: 7,
    paddingVertical: 11,
    paddingHorizontal: 10,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  cellDone: {
    backgroundColor: Colors.surfaceSubtle,
    borderColor: Colors.border,
    color: Colors.textMuted,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDone: { backgroundColor: Colors.accent, borderColor: Colors.accent },
});
