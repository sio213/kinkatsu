import { RoutineDiffSetRow } from '@/components/routines/routine-diff-set-row';
import { Checkbox } from '@/components/ui/checkbox';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Typography } from '@/constants/theme';
import { resolveMeasurementType } from '@/lib/exercises/constants';
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
  // リストの最後の行だけ区切り線を引かない
  isLast: boolean;
  onToggleExercise: (key: string) => void;
  onToggleSet: (key: string, setNumber: number) => void;
  onToggleExpanded: (key: string) => void;
};

/**
 * 差分確認画面の1行。
 *
 * **サムネイル・カテゴリチップを持たない。** この画面でユーザーがするのは「この種目の変更を
 * 反映するか」の判断だけで、並んでいるのは直前のサマリーで見たばかりの数種目なので、
 * 識別に絵は要らない。外したぶんの幅で「変更前 → 変更後」が1行に収まり、
 * 「ルーティン」「今日」のラベルも要らなくなる（2026-08-07 確定。それまでは
 * 過去の記録から読み込む画面と行を共有していた）。
 *
 * **タップの割り当て**：行全体がアコーディオンの開閉、チェックボックスだけがチェック。
 * 反映内容を変える操作より、開くだけで取り消せる操作に大きいターゲットを割り当てる——
 * 取り消せない書き込みの前段なので、誤タップで内容が静かに変わる方を避ける。
 *
 * 3種類すべてが開ける。「値の変更」はセット単位のチェック、「追加した種目」「未実施の種目」は
 * セット列の読み取り専用表示。同じ見た目の行に押せる行と押せない行が混ざるのを避けるため。
 *
 * 「変更後」は resolveExerciseSets を通した結果を出す。セットのチェックを外すと
 * その場で値が戻り、確定したらどうなるかが常に見えている状態になる。
 * 種目のチェックを外すと、その種目のセットのチェックも全部外れる（画面側でまとめている）。
 */
export function RoutineDiffExerciseRow({
  exercise,
  selection,
  partiallySelected,
  expanded,
  isLast,
  onToggleExercise,
  onToggleSet,
  onToggleExpanded,
}: Props) {
  const selected = selection.exercises.has(exercise.key);
  const measurementType = resolveMeasurementType(exercise.measurementType);
  const isChanged = exercise.kind === 'changed';

  const beforeSummary = summarizeExerciseSets(measurementType, exercise.routineSets);
  // チェックが付いている間は「反映したらこうなる」。外しているときは反映結果がルーティンの
  // ままになり両側が同じ文字列で並ぶので、「チェックすればこうなる」＝今日の実績を出す
  const afterSets = isChanged && selected ? resolveExerciseSets(exercise, selection) : exercise.todaySets;
  const afterSummary = summarizeExerciseSets(measurementType, afterSets);
  // 追加＝今日やった内容、未実施＝ルーティンから消える内容
  const singleSummary = exercise.kind === 'added' ? afterSummary : beforeSummary;

  const valueLabel = isChanged
    ? `${beforeSummary} から ${afterSummary} へ変更`
    : `${singleSummary}を${exercise.kind === 'added' ? '追加' : '削除'}`;

  // 追加・未実施はセット列ごと丸ごと採否を決めるため、内訳は読み取り専用。
  // 「値の変更」のセット行と同じ組み立て（ラベル・値・種別チップ）を通したいので、
  // セット列をそのままDiffSetの形に写して渡す
  const detailDiffs: DiffSet[] =
    exercise.kind === 'added'
      ? exercise.todaySets.map((set, i) => ({ setNumber: i + 1, kind: 'added', before: null, after: set }))
      : exercise.routineSets.map((set, i) => ({ setNumber: i + 1, kind: 'removed', before: set, after: null }));

  return (
    <View style={[styles.block, isLast && styles.blockLast]}>
      <View style={styles.row}>
        <TouchableOpacity
          onPress={() => onToggleExercise(exercise.key)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: partiallySelected ? 'mixed' : selected }}
          accessibilityLabel={`${exercise.name}、${valueLabel}`}
          // 行全体をチェックのタップ領域にしない代わりに、当たり判定を広げて44ptを確保する
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 10 }}
          // 本文が2行なので、上揃え＋2で1行目の文字と光学的に揃える（デザイン仕様）
          style={styles.checkbox}
        >
          <Checkbox checked={selected} indeterminate={partiallySelected} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.content}
          onPress={() => onToggleExpanded(exercise.key)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${exercise.name}、${valueLabel}。セットの内訳を${expanded ? '閉じる' : '開く'}`}
        >
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {exercise.name}
            </Text>
            <IconSymbol
              name="chevron.down"
              size={14}
              color={Colors.textPlaceholder}
              style={expanded ? styles.chevronOpen : undefined}
            />
          </View>

          {/* 反映される行だけ「変更後」を強調する。外れている行は変更前と同じスタイルに戻り、
              ただの比較として読める（デザイン仕様） */}
          <View style={styles.valueRow}>
            {isChanged ? (
              <>
                <Text style={styles.before} numberOfLines={1}>
                  {beforeSummary}
                </Text>
                <IconSymbol name="arrow.right" size={13} color={Colors.borderStrong} style={styles.arrow} />
                <Text style={selected ? styles.after : styles.before} numberOfLines={1}>
                  {afterSummary}
                </Text>
              </>
            ) : (
              <Text
                style={[
                  selected ? styles.after : styles.before,
                  exercise.kind === 'removed' && selected && styles.struck,
                ]}
                numberOfLines={1}
              >
                {singleSummary}
              </Text>
            )}
          </View>
        </TouchableOpacity>
      </View>

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
  // 展開部を含めて1つの塊にするため、境界線は行ではなくこちらが引く
  block: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  blockLast: { borderBottomWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  checkbox: { marginTop: 2 },
  content: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { ...Typography.cardTitle, color: Colors.textPrimary, flex: 1 },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  valueRow: { flexDirection: 'row', alignItems: 'center' },
  before: { ...Typography.footnote, color: Colors.textPlaceholder, flexShrink: 1 },
  after: { ...Typography.footnote, fontWeight: '600', color: Colors.textPrimary, flexShrink: 1 },
  arrow: { marginHorizontal: 8 },
  struck: { textDecorationLine: 'line-through' },
  // 左右のパディングはセット行が持つ。最後のセット行が区切り線に貼り付かないよう下に8だけ空ける
  setDetail: { paddingBottom: 8, backgroundColor: Colors.surfaceMuted },
});
