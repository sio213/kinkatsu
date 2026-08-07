import { ExerciseRowFrame } from '@/components/exercises/exercise-row-frame';
import { RoutineDiffSetRow } from '@/components/routines/routine-diff-set-row';
import { Checkbox } from '@/components/ui/checkbox';
import { DesignIcon } from '@/components/ui/design-icon';
import { Colors, IconSizes, Typography } from '@/constants/theme';
import { getCategoryLabel, resolveMeasurementType } from '@/lib/exercises/constants';
import {
  isSetAccepted,
  resolveExerciseSets,
  type DiffExercise,
  type DiffSelection,
  type DiffSet,
} from '@/lib/routines/diff';
import { summarizeExerciseSets } from '@/lib/workout/set-format';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  exercise: DiffExercise;
  selection: DiffSelection;
  // 「値の変更」で、一部のセットだけチェックが外れている状態。チェックマークの代わりに横棒を出す
  partiallySelected: boolean;
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
 *
 * 種目のチェックを外すと、その種目のセットのチェックも全部外れる（画面側でまとめている）。
 */
export function RoutineDiffExerciseRow({
  exercise,
  selection,
  partiallySelected,
  expanded,
  onToggleExercise,
  onToggleSet,
  onToggleExpanded,
}: Props) {
  const selected = selection.exercises.has(exercise.key);
  const measurementType = resolveMeasurementType(exercise.measurementType);

  const isChanged = exercise.kind === 'changed';
  // 取り消し線と「今日」側の強調は「反映される」ことの印。チェックが外れている行に付けると、
  // 実際には残る値に「無くなる」と書くことになるので外す。外れている行は
  // 「ルーティンはこう、今日はこうだった」というただの比較に戻る
  const applied = selected;
  const routineSummary = summarizeExerciseSets(measurementType, exercise.routineSets);
  // チェックが付いている間は「反映したらこうなる」を出す（セットのチェックを外すとその場で戻る）。
  // 外しているときは反映結果がルーティンのままになり、上下の行が同じ文字列で並んで読めなくなるため、
  // 「チェックすればこうなる」＝今日の実績をそのまま出す
  const todaySets = isChanged && selected ? resolveExerciseSets(exercise, selection) : exercise.todaySets;
  const todaySummary = summarizeExerciseSets(measurementType, todaySets);
  // 追加＝今日やった内容、未実施＝ルーティンから消える内容
  const singleSummary = exercise.kind === 'added' ? todaySummary : routineSummary;
  // 追加・未実施はセット列ごと丸ごと採否を決めるため、内訳は読み取り専用。
  // 「値の変更」のセット行と同じ組み立て（ラベル・値・種別チップ）を通したいので、
  // セット列をそのままDiffSetの形に写して渡す
  const detailDiffs: DiffSet[] =
    exercise.kind === 'added'
      ? exercise.todaySets.map((set, i) => ({ setNumber: i + 1, kind: 'added', before: null, after: set }))
      : exercise.routineSets.map((set, i) => ({ setNumber: i + 1, kind: 'removed', before: set, after: null }));

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
            accessibilityState={{ checked: partiallySelected ? 'mixed' : selected }}
            accessibilityLabel={`${exercise.name}、${valueLabel}`}
            // 行全体をチェックのタップ領域にしない代わりに、当たり判定を広げて44ptを確保する
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 10 }}
            // 本文が2行の行なので、上揃え＋2で1行目の文字と光学的に揃える
            style={styles.checkbox}
          >
            <Checkbox checked={selected} indeterminate={partiallySelected} />
          </TouchableOpacity>
        }
        name={exercise.name}
        category={exercise.category}
        source={exercise.source}
        slug={exercise.slug}
        horizontalPadding={16}
        gap={12}
        infoGap={4}
        alignItems="flex-start"
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
          // 種目カード右端のchevron（IconSizes.cardChevron）と同じアイコン・同じ大きさを使う。
          // Material Symbolsのexpand_moreは同じpxでも字形が太く、行の中で悪目立ちする。
          // chevron-rightを回して下向き（閉）／上向き（開）にする
          <DesignIcon
            name="chevron-right"
            size={IconSizes.cardChevron}
            color={Colors.textPlaceholder}
            style={expanded ? styles.chevronOpen : styles.chevron}
          />
        }
        body={
          isChanged ? (
            <View style={styles.compare}>
              <View style={styles.compareLine}>
                <Text style={styles.compareLabel}>ルーティン</Text>
                <Text style={[styles.compareBefore, applied && styles.struck]} numberOfLines={1}>
                  {routineSummary}
                </Text>
              </View>
              <View style={styles.compareLine}>
                <Text style={styles.compareLabel}>今日</Text>
                <Text style={applied ? styles.compareAfter : styles.compareBefore} numberOfLines={1}>
                  {todaySummary}
                </Text>
              </View>
            </View>
          ) : (
            <Text
              style={[styles.singleSummary, exercise.kind === 'removed' && applied && styles.struck]}
              numberOfLines={1}
            >
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
            : // 開けるようにしているのは、何が足される／消えるかを確認できるようにするため
              detailDiffs.map((diff) => (
                <RoutineDiffSetRow key={diff.setNumber} diff={diff} measurementType={measurementType} readOnly />
              ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  checkbox: { marginTop: 2 },
  chevron: { transform: [{ rotate: '90deg' }] },
  chevronOpen: { transform: [{ rotate: '270deg' }] },
  singleSummary: { ...Typography.footnote, color: Colors.textMuted },
  compare: { gap: 2 },
  compareLine: { flexDirection: 'row', gap: 6 },
  // ラベル幅を揃えると値が縦に並び、視線が上下に流れて比較しやすい。
  // ラベルだけ一段小さいのは行の説明であって値ではないため。値は「追加した種目」「未実施の種目」の
  // 要約行と同じfootnote(13px)にする——同じ「その種目がどうなるか」を伝える行なので、
  // セクションによって文字サイズが変わる理由が無い
  compareLabel: { ...Typography.captionCompact, fontWeight: '600', color: Colors.textPlaceholder, width: 58 },
  compareBefore: { ...Typography.footnote, color: Colors.textPlaceholder, flex: 1 },
  compareAfter: { ...Typography.footnote, fontWeight: '600', color: Colors.textPrimary, flex: 1 },
  struck: { textDecorationLine: 'line-through' },
  // 左右のパディングは行が持つ（左24＝親の16＋インデント8）。最後のセット行が
  // 区切り線に貼り付かないよう下に8だけ空ける
  setDetail: { paddingBottom: 8, backgroundColor: Colors.surfaceMuted },
});
