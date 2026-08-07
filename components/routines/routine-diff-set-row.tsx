import { IconSymbol } from '@/components/ui/icon-symbol';
import { Checkbox } from '@/components/ui/checkbox';
import { Colors, Typography } from '@/constants/theme';
import type { DiffSet } from '@/lib/routines/diff';
import { formatHistorySetSummary, MEASUREMENT_COLUMNS } from '@/lib/workout/set-format';
import type { MeasurementType } from '@/lib/exercises/constants';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  diff: DiffSet;
  measurementType: MeasurementType;
  checked: boolean;
  onToggle: (setNumber: number) => void;
};

/**
 * 差分確認画面の、アコーディオンを開いたときに出るセット1行（デザイン案の`.setln2`）。
 *
 * セット単位のチェックは**この画面の中だけで完結**する。外すと親の要約行がその場で
 * 元の値に戻るので、影響が見える（lib/routines/diff.tsのresolveExerciseSetsが
 * 親の表示とDB書き込みの両方を同じ計算で賄っている）。
 *
 * 追加・削除されたセットは値の比較ができないため、値の代わりにチップで種別を示す。
 */
export function RoutineDiffSetRow({ diff, measurementType, checked, onToggle }: Props) {
  const columns = MEASUREMENT_COLUMNS[measurementType];
  const before = diff.before ? formatHistorySetSummary(columns, [diff.before]) : '';
  const after = diff.after ? formatHistorySetSummary(columns, [diff.after]) : '';
  const label = `${diff.setNumber}セット目`;

  const accessibilityLabel =
    diff.kind === 'added'
      ? `${label} ${after} を追加`
      : diff.kind === 'removed'
        ? `${label} ${before} を削除`
        : `${label} ${before} から ${after} へ変更`;

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onToggle(diff.setNumber)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
    >
      <Checkbox checked={checked} size={18} />
      {diff.kind === 'removed' ? (
        <>
          <Text style={[styles.label, styles.struck]}>{`${label}　${before}`}</Text>
          <View style={styles.removedChip}>
            <Text style={styles.removedChipText}>削除</Text>
          </View>
        </>
      ) : diff.kind === 'added' ? (
        <>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.after}>{after}</Text>
          <View style={styles.addedChip}>
            <Text style={styles.addedChipText}>追加</Text>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.before}>{before}</Text>
          <IconSymbol name="arrow.right" size={12} color={Colors.textPlaceholder} />
          <Text style={styles.after}>{after}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // minHeight 44 はデザイン案の指定。チェックボックス単体ではなく行全体がヒット領域
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  label: { ...Typography.captionCompact, color: Colors.textMuted },
  before: { ...Typography.captionCompact, color: Colors.textMuted },
  after: { ...Typography.captionCompact, fontWeight: '600', color: Colors.textPrimary },
  struck: { textDecorationLine: 'line-through' },
  removedChip: { backgroundColor: Colors.dangerSurface, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  removedChipText: { ...Typography.captionCompact, fontWeight: '600', color: Colors.danger },
  addedChip: { backgroundColor: Colors.accentSurface, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  addedChipText: { ...Typography.captionCompact, fontWeight: '600', color: Colors.accent },
});
