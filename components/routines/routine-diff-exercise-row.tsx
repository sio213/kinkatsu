import { SelectableExerciseRow } from '@/components/exercises/selectable-exercise-row';
import { RoutineDiffSetRow } from '@/components/routines/routine-diff-set-row';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Typography } from '@/constants/theme';
import { getCategoryLabel, resolveMeasurementType } from '@/lib/exercises/constants';
import { isSetAccepted, resolveExerciseSets, type DiffExercise, type DiffSelection } from '@/lib/routines/diff';
import { formatHistorySetSummary, MEASUREMENT_COLUMNS, summarizeExerciseSets } from '@/lib/workout/set-format';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  exercise: DiffExercise;
  selection: DiffSelection;
  expanded: boolean;
  onToggleExercise: (key: string) => void;
  onToggleSet: (key: string, setNumber: number) => void;
  onToggleExpanded: (key: string) => void;
};

/**
 * 差分確認画面の1行（デザイン案V14c）。
 *
 * 見た目の土台は「過去の記録から読み込む」等と同じ種目カード（SelectableExerciseRow）で、
 * 違いは**「値の変更」だけがアコーディオンを持つ**こと。追加・未実施は要約1行で、
 * セット列ごと丸ごと採否を決めるので内訳を開く意味が無い。
 *
 * 「今日」の行は resolveExerciseSets を通した結果を出す。子のチェックを外すと
 * その場で元の値に戻り、確定したらどうなるかが常に見えている状態になる。
 */
export function RoutineDiffExerciseRow({
  exercise,
  selection,
  expanded,
  onToggleExercise,
  onToggleSet,
  onToggleExpanded,
}: Props) {
  const selected = selection.exercises.has(exercise.key);
  const measurementType = resolveMeasurementType(exercise.measurementType);
  const expandable = exercise.kind === 'changed' && exercise.setDiffs.length > 0;

  if (exercise.kind !== 'changed') {
    // 追加した種目＝今日やった内容、未実施の種目＝ルーティンから消える内容（取り消し線）
    const sets = exercise.kind === 'added' ? exercise.todaySets : exercise.routineSets;
    return (
      <SelectableExerciseRow
        id={0}
        name={exercise.name}
        category={exercise.category}
        measurementType={exercise.measurementType}
        source={exercise.source}
        slug={exercise.slug}
        sets={sets}
        selected={selected}
        onToggle={() => onToggleExercise(exercise.key)}
        horizontalPadding={16}
        strikeSummary={exercise.kind === 'removed'}
        // 行に出ている要約と同じ文字列で読ませる（自重種目のように代表セットが決まらない
        // ケースでsummarizeExerciseSetsが件数だけになるため、行と同じformatHistorySetSummaryを使う）
        accessibilityLabelOverride={`${exercise.name}、${getCategoryLabel(exercise.category)}、${formatHistorySetSummary(
          MEASUREMENT_COLUMNS[measurementType],
          sets,
        )}を${exercise.kind === 'added' ? '追加' : '削除'}`}
      />
    );
  }

  const resolved = resolveExerciseSets(exercise, selection);
  const routineSummary = summarizeExerciseSets(measurementType, exercise.routineSets);
  const todaySummary = summarizeExerciseSets(measurementType, resolved);

  return (
    <View style={styles.block}>
      <SelectableExerciseRow
        id={0}
        name={exercise.name}
        category={exercise.category}
        measurementType={exercise.measurementType}
        source={exercise.source}
        slug={exercise.slug}
        sets={exercise.todaySets}
        selected={selected}
        onToggle={() => onToggleExercise(exercise.key)}
        horizontalPadding={16}
        // 展開部を含めて1つの塊にするため、境界線はblock側が引く
        hideBorder
        accessibilityLabelOverride={`${exercise.name}、${getCategoryLabel(exercise.category)}、ルーティン ${routineSummary} から 今日 ${todaySummary} へ`}
        trailing={
          expandable ? (
            <TouchableOpacity
              style={styles.chevron}
              onPress={() => onToggleExpanded(exercise.key)}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={expanded ? 'セットの内訳を閉じる' : 'セットの内訳を開く'}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <IconSymbol
                name="chevron.down"
                size={20}
                color={Colors.textPlaceholder}
                style={expanded ? styles.chevronOpen : undefined}
              />
            </TouchableOpacity>
          ) : undefined
        }
        body={
          <View style={styles.compare}>
            <View style={styles.compareLine}>
              <Text style={styles.compareLabel}>ルーティン</Text>
              <Text style={[styles.compareBefore, styles.struck]} numberOfLines={1}>
                {routineSummary}
              </Text>
            </View>
            <View style={styles.compareLine}>
              <Text style={styles.compareLabel}>今日</Text>
              <Text style={styles.compareAfter} numberOfLines={1}>
                {todaySummary}
              </Text>
            </View>
          </View>
        }
      />
      {expanded && (
        <View style={styles.setDetail}>
          {exercise.setDiffs.map((diff) => (
            <RoutineDiffSetRow
              key={diff.setNumber}
              diff={diff}
              measurementType={measurementType}
              checked={isSetAccepted(selection, exercise.key, diff.setNumber)}
              onToggle={(setNumber) => onToggleSet(exercise.key, setNumber)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // 展開部を含めて1つの塊にするため、境界線は行ではなくこちらが引く
  block: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  chevron: { marginLeft: 'auto' },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  compare: { gap: 2 },
  compareLine: { flexDirection: 'row', gap: 6 },
  // ラベル幅を揃えると値が縦に並び、視線が上下に流れて比較しやすい
  compareLabel: { ...Typography.captionCompact, fontWeight: '600', color: Colors.textPlaceholder, width: 58 },
  compareBefore: { ...Typography.captionCompact, color: Colors.textPlaceholder, flex: 1 },
  compareAfter: { ...Typography.captionCompact, fontWeight: '600', color: Colors.textPrimary, flex: 1 },
  struck: { textDecorationLine: 'line-through' },
  // 左46pxはチェックボックス+サムネの分だけ内訳を字下げする（デザイン案の.setdetail2）
  setDetail: { paddingLeft: 46, paddingRight: 16, paddingBottom: 10, gap: 3, backgroundColor: Colors.surfaceMuted },
});
