import { ExerciseRowFrame } from '@/components/exercises/exercise-row-frame';
import { RoutineDiffSetRow } from '@/components/routines/routine-diff-set-row';
import { Checkbox } from '@/components/ui/checkbox';
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
 * 見た目の土台は「過去の記録から読み込む」等と同じ行（ExerciseRowFrame）だが、
 * **タップの割り当てが違う**。読み込み系は行全体がチェックだが、この画面は
 * **行全体がアコーディオンの開閉・チェックボックスだけがチェック**。
 * 反映内容を変える操作（チェック）より、開くだけで取り消せる操作（展開）に大きいターゲットを
 * 割り当てる——取り消せない書き込みの前段なので、誤タップで内容が静かに変わる方を避ける
 * （2026-08-07 ユーザー判断。デザイン案の「チェックボックスは行全体がヒット領域」から変更）。
 *
 * 3種類すべてが開ける。「値の変更」はセット単位のチェック、「追加した種目」「未実施の種目」は
 * セット列の読み取り専用表示。同じ見た目の行に押せる行と押せない行が混ざるのを避けるため。
 *
 * 「今日」の行は resolveExerciseSets を通した結果を出す。セットのチェックを外すと
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
  const columns = MEASUREMENT_COLUMNS[measurementType];

  const isChanged = exercise.kind === 'changed';
  const resolved = isChanged ? resolveExerciseSets(exercise, selection) : [];
  const routineSummary = summarizeExerciseSets(measurementType, exercise.routineSets);
  const todaySummary = summarizeExerciseSets(measurementType, isChanged ? resolved : exercise.todaySets);
  // 追加＝今日やった内容、未実施＝ルーティンから消える内容
  const singleSummary = exercise.kind === 'added' ? todaySummary : routineSummary;
  const detailSets = exercise.kind === 'added' ? exercise.todaySets : exercise.routineSets;

  const valueLabel = isChanged
    ? `ルーティン ${routineSummary} から 今日 ${todaySummary} へ`
    : `${singleSummary}を${exercise.kind === 'added' ? '追加' : '削除'}`;

  return (
    <View style={styles.block}>
      <ExerciseRowFrame
        checkbox={
          <TouchableOpacity
            onPress={() => onToggleExercise(exercise.key)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={`${exercise.name}、${valueLabel}`}
            // 行全体をチェックのタップ領域にしない代わりに、当たり判定を広げて44ptを確保する
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 10 }}
          >
            <Checkbox checked={selected} />
          </TouchableOpacity>
        }
        name={exercise.name}
        category={exercise.category}
        source={exercise.source}
        slug={exercise.slug}
        horizontalPadding={16}
        // 展開部を含めて1つの塊にするため、境界線はblock側が引く
        hideBorder
        content={{
          onPress: () => onToggleExpanded(exercise.key),
          accessibilityState: { expanded },
          accessibilityLabel: `${exercise.name}、${getCategoryLabel(exercise.category)}、${valueLabel}。セットの内訳を${
            expanded ? '閉じる' : '開く'
          }`,
        }}
        trailing={
          <IconSymbol
            name="chevron.down"
            size={20}
            color={Colors.textPlaceholder}
            style={expanded ? styles.chevronOpen : styles.chevron}
          />
        }
        body={
          isChanged ? (
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
          ) : (
            <Text style={[styles.singleSummary, exercise.kind === 'removed' && styles.struck]} numberOfLines={1}>
              {singleSummary}
            </Text>
          )
        }
      />
      {expanded && (
        <View style={styles.setDetail}>
          {isChanged
            ? exercise.setDiffs.map((diff) => (
                <RoutineDiffSetRow
                  key={diff.setNumber}
                  diff={diff}
                  measurementType={measurementType}
                  checked={isSetAccepted(selection, exercise.key, diff.setNumber)}
                  onToggle={(setNumber) => onToggleSet(exercise.key, setNumber)}
                />
              ))
            : // 追加・未実施はセット列ごと丸ごと採否を決めるので内訳は読み取り専用。
              // それでも開けるのは、何が足される／消えるかを確認できるようにするため
              detailSets.map((set, index) => (
                <View key={index} style={styles.readonlySet}>
                  <Text style={styles.readonlyLabel}>{`${index + 1}セット目`}</Text>
                  <Text style={[styles.readonlyValue, exercise.kind === 'removed' && styles.struck]}>
                    {formatHistorySetSummary(columns, [set])}
                  </Text>
                </View>
              ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  chevron: { marginLeft: 'auto' },
  chevronOpen: { marginLeft: 'auto', transform: [{ rotate: '180deg' }] },
  singleSummary: { ...Typography.footnote, color: Colors.textMuted },
  compare: { gap: 2 },
  compareLine: { flexDirection: 'row', gap: 6 },
  // ラベル幅を揃えると値が縦に並び、視線が上下に流れて比較しやすい
  compareLabel: { ...Typography.captionCompact, fontWeight: '600', color: Colors.textPlaceholder, width: 58 },
  compareBefore: { ...Typography.captionCompact, color: Colors.textPlaceholder, flex: 1 },
  compareAfter: { ...Typography.captionCompact, fontWeight: '600', color: Colors.textPrimary, flex: 1 },
  struck: { textDecorationLine: 'line-through' },
  // 左46pxはチェックボックス+サムネの分だけ内訳を字下げする（デザイン案の.setdetail2）
  setDetail: { paddingLeft: 46, paddingRight: 16, paddingBottom: 10, gap: 3, backgroundColor: Colors.surfaceMuted },
  readonlySet: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  readonlyLabel: { ...Typography.captionCompact, color: Colors.textMuted },
  readonlyValue: { ...Typography.captionCompact, fontWeight: '600', color: Colors.textPrimary },
});
