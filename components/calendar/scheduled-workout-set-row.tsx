import { DurationInput } from '@/components/workout/duration-input';
import { BoxedTextInput } from '@/components/ui/boxed-text-input';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Typography } from '@/constants/theme';
import type { ScheduledWorkoutExerciseSet } from '@/hooks/use-scheduled-workout-exercises';
import type { MeasurementType } from '@/lib/exercises/constants';
import { updateScheduledWorkoutSetValues } from '@/lib/calendar/scheduled-workout-detail';
import { MEASUREMENT_COLUMNS, parseColumnsWithFallback, toDisplayValues } from '@/lib/workout/set-format';
import { memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// 自動保存のデバウンス間隔。components/workout/set-row.tsxと同じ理由（1文字ごとの即保存だと
// この予定全体を購読しているuseScheduledWorkoutExercisesが打鍵のたびに再発火してしまう）
const AUTO_SAVE_DEBOUNCE_MS = 400;

type Props = {
  set: ScheduledWorkoutExerciseSet;
  setNumber: number;
  measurementType: MeasurementType;
  exerciseName: string;
  onDelete: () => void;
};

// 直接予定の目標セット編集行(app/calendar/schedule-workout-edit.tsx)。routine-template-set-row.tsxと
// 同じく✓確定の概念を持たないが、こちらは下書きストアではなく実DBへの書き込みのため、
// set-row.tsxと同じ400msデバウンスの自動保存にする（routine-template-set-row.tsxは
// メモリ上の下書き配列を即座に書き換えるだけなのでデバウンス不要、DB書き込みかどうかの違い）
export const ScheduledWorkoutSetRow = memo(function ScheduledWorkoutSetRow({
  set,
  setNumber,
  measurementType,
  exerciseName,
  onDelete,
}: Props) {
  const columns = MEASUREMENT_COLUMNS[measurementType];

  const [display, setDisplay] = useState<Record<string, string>>(() => toDisplayValues(columns, set));
  const displayRef = useRef(display);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1文字入力するたびのバックグラウンド保存。session-exercise-card.tsxのhandleAutoSaveDraftと
  // 同じ方針で、失敗してもAlertは出さずログのみに留める（毎打鍵でAlertが出るのを避けるため）。
  // ✓確定のような最終確定ステップがこの画面には無いため唯一の保存経路だが、ローカルSQLiteの
  // 書き込み失敗は通常起こらない前提（set-row.tsxのhandleAutoSaveDraftと同じ割り切り）
  const flushAutoSave = () => {
    const parsed = parseColumnsWithFallback(columns, displayRef.current, set);
    updateScheduledWorkoutSetValues(set.id, {
      weight: parsed.weight ?? null,
      reps: parsed.reps ?? null,
      durationSeconds: parsed.durationSeconds ?? null,
      distanceMeters: parsed.distanceMeters ?? null,
    }).catch((e) => console.error('[scheduled workout set auto save]', e));
  };

  useEffect(() => {
    return () => {
      // アンマウント直前に保留中のデバウンスがあれば、取りこぼさず即保存する（set-row.tsxと同じ）
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        flushAutoSave();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFieldChange = (key: string, text: string) => {
    const next = { ...displayRef.current, [key]: text };
    displayRef.current = next;
    setDisplay(next);

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      flushAutoSave();
    }, AUTO_SAVE_DEBOUNCE_MS);
  };

  return (
    <View style={styles.row}>
      <Text style={styles.number}>{setNumber}</Text>
      {columns.map((c) => {
        const isDuration = c.key === 'durationSeconds';
        return (
          <View key={c.key} style={styles.cellWrapper}>
            {isDuration ? (
              <DurationInput
                initialValue={display[c.key] ?? ''}
                onChange={(text) => handleFieldChange(c.key, text)}
                exerciseName={exerciseName}
                setNumber={setNumber}
              />
            ) : (
              <BoxedTextInput
                height={32}
                boxStyle={styles.cellBox}
                style={styles.cellText}
                value={display[c.key]}
                onChangeText={(text) => handleFieldChange(c.key, text)}
                keyboardType={c.keyboardType}
                textAlign="center"
                placeholder="-"
                placeholderTextColor={Colors.textPlaceholder}
                accessibilityLabel={`${exerciseName} セット${setNumber} ${c.label}`}
              />
            )}
          </View>
        );
      })}
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={onDelete}
        accessibilityRole="button"
        accessibilityLabel={`${exerciseName} セット${setNumber}を削除`}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <IconSymbol name="xmark" size={14} color={Colors.textPlaceholder} />
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 5 },
  number: { width: 52, textAlign: 'center', ...Typography.caption, fontWeight: '600', color: Colors.textPlaceholder },
  cellWrapper: { flex: 1 },
  cellBox: { borderRadius: 7, paddingHorizontal: 10 },
  cellText: Typography.metric,
  deleteBtn: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
});
