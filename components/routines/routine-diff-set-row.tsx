import { Checkbox } from '@/components/ui/checkbox';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Typography } from '@/constants/theme';
import type { MeasurementType } from '@/lib/exercises/constants';
import type { DiffSet } from '@/lib/routines/diff';
import { formatHistorySetSummary, MEASUREMENT_COLUMNS } from '@/lib/workout/set-format';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  diff: DiffSet;
  measurementType: MeasurementType;
  checked: boolean;
  onToggle: (setNumber: number) => void;
};

/**
 * 差分確認画面の、アコーディオンを開いたときに出るセット1行。
 *
 * セット単位のチェックは**この画面の中だけで完結**する。外すと親の要約行がその場で
 * 元の値に戻るので、影響が見える（lib/routines/diff.tsのresolveExerciseSetsが
 * 親の表示とDB書き込みの両方を同じ計算で賄っている）。
 *
 * 追加・削除されたセットは値の比較ができないため、値の代わりにチップで種別を示す。
 *
 * 左パディング24は親行の16に8のインデントを足したぶん。この8が階層の手がかりになるので、
 * それ以上深くしない（デザイン仕様）。セットラベルの幅を68で固定するのは、可変にすると
 * 「1セット目」「10セット目」で矢印の位置がずれて、縦に並んだときに読みにくくなるため。
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
      <Checkbox checked={checked} size={19} />
      <View style={styles.content}>
        <Text style={styles.label}>{label}</Text>
        {diff.kind === 'removed' ? (
          <>
            <Text style={[styles.before, styles.struck]}>{before}</Text>
            <View style={styles.removedChip}>
              <Text style={styles.removedChipText}>削除</Text>
            </View>
          </>
        ) : diff.kind === 'added' ? (
          <>
            <Text style={styles.after}>{after}</Text>
            <View style={styles.addedChip}>
              <Text style={styles.addedChipText}>追加</Text>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.before}>{before}</Text>
            <IconSymbol name="arrow.right" size={12} color={Colors.textPlaceholder} style={styles.arrow} />
            <Text style={styles.after}>{after}</Text>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // 上下10で行の高さは約40。行全体がタップ領域（チェックボックス単体を狙わせない）
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingLeft: 24, paddingRight: 16, gap: 12 },
  content: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  // 幅固定で矢印の位置を縦に揃える
  label: { ...Typography.footnote, color: Colors.textSecondary, width: 68 },
  before: { ...Typography.footnote, color: Colors.textPlaceholder },
  arrow: { marginHorizontal: 8 },
  after: { ...Typography.footnote, fontWeight: '500', color: Colors.textPrimary },
  struck: { textDecorationLine: 'line-through' },
  removedChip: {
    marginLeft: 8,
    backgroundColor: Colors.dangerSurface,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  removedChipText: { ...Typography.captionCompact, fontWeight: '600', color: Colors.danger },
  addedChip: {
    marginLeft: 8,
    backgroundColor: Colors.accentSurface,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  addedChipText: { ...Typography.captionCompact, fontWeight: '600', color: Colors.accent },
});
