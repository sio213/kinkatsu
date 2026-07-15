import { DurationInput, type DurationInputHandle } from '@/components/workout/duration-input';
import { BoxedTextInput } from '@/components/ui/boxed-text-input';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Typography } from '@/constants/theme';
import type { MeasurementType } from '@/lib/exercises/constants';
import type { DraftExercise } from '@/lib/routines/validation';
import { MEASUREMENT_COLUMNS, parseColumnsWithFallback, toDisplayValues } from '@/lib/workout/set-format';
import { forwardRef, memo, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type SetValues = DraftExercise['sets'][number];

type Props = {
  setNumber: number;
  values: SetValues;
  measurementType: MeasurementType;
  exerciseName: string;
  onChange: (values: SetValues) => void;
  onDelete: () => void;
};

export type RoutineTemplateSetRowHandle = { focus: () => void };

// ルーティンのテンプレートセット編集画面での1行。トレーニング中画面のSetRowと違い、
// ✓確定の概念（completedAt）が無いテンプレート値をそのまま編集するため、自動保存の
// デバウンスやゴースト表示・完了チェックボックスは持たず、代わりに行ごとの削除✕アイコンを持つ
export const RoutineTemplateSetRow = memo(
  forwardRef<RoutineTemplateSetRowHandle, Props>(function RoutineTemplateSetRow(
    { setNumber, values, measurementType, exerciseName, onChange, onDelete }: Props,
    ref,
  ) {
  const columns = MEASUREMENT_COLUMNS[measurementType];
  const firstTextInputRef = useRef<TextInput>(null);
  const firstDurationInputRef = useRef<DurationInputHandle>(null);

  // 種目追加/過去の記録から読み込む直後、この行が先頭セットならフォーカスして欲しい親からの
  // 指示を受けて実際にフォーカスする(set-row.tsxのSetRowと同じ考え方)。計測タイプによって
  // 1列目がTextInput/DurationInputのどちらになるかが変わるため、両方のrefを持っておき
  // 実際に描画されている方へ委譲する
  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        if (columns[0]?.key === 'durationSeconds') {
          firstDurationInputRef.current?.focus();
        } else {
          firstTextInputRef.current?.focus();
        }
      },
    }),
    [columns],
  );

  const [display, setDisplay] = useState<Record<string, string>>(() => toDisplayValues(columns, values));
  // 同一レンダーサイクル内での連続onChangeText呼び出しでも常に最新値を基準にするための鏡
  // （set-row.tsxのvaluesRefと同じ対策）
  const displayRef = useRef(display);
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const handleFieldChange = (key: string, text: string) => {
    const next = { ...displayRef.current, [key]: text };
    displayRef.current = next;
    setDisplay(next);
    // 保存ボタンの概念が無いため、パースできた時点で即ドラフトストアへ反映する。"82."のような
    // 一瞬パース不能な状態では、直前の値にフォールバックしてnullで上書きしないようにする
    onChange({ ...valuesRef.current, ...parseColumnsWithFallback(columns, next, valuesRef.current) } as SetValues);
  };

  return (
    <View style={styles.row}>
      <Text style={styles.number}>{setNumber}</Text>
      {columns.map((c, index) => {
        const isDuration = c.key === 'durationSeconds';
        const isFirstColumn = index === 0;
        return (
          <View key={c.key} style={styles.cellWrapper}>
            {isDuration ? (
              <DurationInput
                ref={isFirstColumn ? firstDurationInputRef : undefined}
                initialValue={display[c.key] ?? ''}
                onChange={(text) => handleFieldChange(c.key, text)}
                exerciseName={exerciseName}
                setNumber={setNumber}
              />
            ) : (
              <BoxedTextInput
                ref={isFirstColumn ? firstTextInputRef : undefined}
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
  }),
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 5 },
  number: { width: 52, textAlign: 'center', ...Typography.caption, fontWeight: '600', color: Colors.textPlaceholder },
  cellWrapper: { flex: 1 },
  cellBox: { borderRadius: 7, paddingHorizontal: 10 },
  cellText: Typography.metric,
  deleteBtn: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
});
