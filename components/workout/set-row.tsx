import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import type { Set } from '@/db/schema';
import type { MeasurementType } from '@/lib/exercises/constants';
import { MEASUREMENT_COLUMNS, parseColumns, parseColumnsWithFallback, toDisplayValues } from '@/lib/workout/set-format';
import type { SetValues } from '@/lib/workout/sets';
import { memo, useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

// 自動保存のデバウンス間隔。1文字ごとに即保存すると、セッション全体を1本のlive queryで
// 購読しているuseSessionSets（hooks/use-workout-session.ts）が打鍵のたびに再発火し、
// 他の全SessionExerciseCardのmemoが無効化されて余計な再レンダーを招くため間引く
const AUTO_SAVE_DEBOUNCE_MS = 400;

type Props = {
  set: Set;
  exerciseName: string;
  measurementType: MeasurementType;
  onSave: (setId: number, values: SetValues) => Promise<void>;
  onReopen: (setId: number) => Promise<void>;
  // ✓未タップのまま入力中の値を親に伝える。DBの保存とは別に、
  // 「セット追加」時にこの入力途中の値もコピー対象にできるようにするためのもの
  onDraftChange?: (setId: number, values: Record<string, string>) => void;
  // ✓未タップのまま画面を離れても入力が消えないよう、completedAtを変えずにDBへ保存する
  onAutoSaveDraft?: (setId: number, values: SetValues) => Promise<void>;
};

export const SetRow = memo(function SetRow({
  set,
  exerciseName,
  measurementType,
  onSave,
  onReopen,
  onDraftChange,
  onAutoSaveDraft,
}: Props) {
  const columns = MEASUREMENT_COLUMNS[measurementType];
  const done = set.completedAt != null;
  const isBusyRef = useRef(false);

  const [values, setValues] = useState<Record<string, string>>(() => toDisplayValues(columns, set));
  // 連続したonChangeText呼び出し（同一レンダーサイクル内でバッチ処理される場合）でも
  // 常に最新の値を基準にマージするための鏡。setValuesの外で同期的に更新する
  const valuesRef = useRef(values);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // デバウンス済みの自動保存本体。parseColumnsWithFallbackを使い、"82.5"を打つ途中の
  // "82."のような一瞬パース不能な状態でも、DB上の既存値(set)にフォールバックしてnullで
  // 上書きしないようにする（parseColumnsだと確定済みの値を一瞬の不正状態で消してしまう）
  const flushAutoSave = () => {
    onAutoSaveDraft?.(set.id, parseColumnsWithFallback(columns, valuesRef.current, set));
  };

  useEffect(() => {
    return () => {
      // アンマウント直前に保留中のデバウンスがあれば、取りこぼさず即保存する
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        flushAutoSave();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFieldChange = (key: string, text: string) => {
    const next = { ...valuesRef.current, [key]: text };
    valuesRef.current = next;
    setValues(next);
    onDraftChange?.(set.id, next);

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      flushAutoSave();
    }, AUTO_SAVE_DEBOUNCE_MS);
  };

  const handleTogglePress = async () => {
    if (isBusyRef.current) return;
    isBusyRef.current = true;
    Keyboard.dismiss();
    try {
      if (done) {
        await onReopen(set.id);
        const reopened = toDisplayValues(columns, set);
        valuesRef.current = reopened;
        setValues(reopened);
        // ここで渡す値はDB上の確定値そのものなので、addSet側のoverrideValues省略時の
        // 既定コピー（DB直前値）と実質同じ結果になる。それでも呼ぶのは、reopen直後に
        // ユーザーが値を編集した場合にdraftValuesRefが追従できるようにするため
        onDraftChange?.(set.id, reopened);
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
        await onSave(set.id, parseColumns(columns, values));
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
            onChangeText={(text) => handleFieldChange(c.key, text)}
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
