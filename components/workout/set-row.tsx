import { DurationInput, type DurationInputHandle } from '@/components/workout/duration-input';
import { BoxedTextInput } from '@/components/ui/boxed-text-input';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Typography } from '@/constants/theme';
import type { Set } from '@/db/schema';
import type { MeasurementType } from '@/lib/exercises/constants';
import { MEASUREMENT_COLUMNS, parseColumns, parseColumnsWithFallback, toDisplayValues } from '@/lib/workout/set-format';
import type { SetValues } from '@/lib/workout/sets';
import { forwardRef, memo, useEffect, useImperativeHandle, useRef, useState } from 'react';
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
  // このセットが、種目追加/入れ替え時に前回の記録から実際に値をコピーして挿入されたものかどうか
  // （lib/workout/session.tsのPrefilledCard.prefilledSetIds参照）。ゴースト表示はこれがtrueの間だけ出す。
  // DBの状態（値がある・✓未確定）だけで判定すると、記録一覧から過去の記録を開いた時や、
  // プリフィル後に「セット追加」で足された行にまで表示されてしまうため、行id単位で厳密に絞る
  isPrefilledSet: boolean;
  // 同じカード内のいずれかのセットが一度でも✓確定 or 編集されたかどうか
  // （session-exercise-card.tsxでカード単位に算出）。1セットでも触れたら「もう見た」とみなし、
  // そのカードの残りのゴースト行も含めて全部通常色に戻す
  cardReviewed: boolean;
};

export type SetRowHandle = { focus: () => void };

export const SetRow = memo(
  forwardRef<SetRowHandle, Props>(function SetRow(
    {
      set,
      exerciseName,
      measurementType,
      onSave,
      onReopen,
      onDraftChange,
      onAutoSaveDraft,
      isPrefilledSet,
      cardReviewed,
    }: Props,
    ref,
  ) {
  const columns = MEASUREMENT_COLUMNS[measurementType];
  const done = set.completedAt != null;
  const isBusyRef = useRef(false);
  const firstTextInputRef = useRef<TextInput>(null);
  const firstDurationInputRef = useRef<DurationInputHandle>(null);

  // 種目追加直後、この行が先頭セットならフォーカスして欲しい親からの指示を受けて実際に
  // フォーカスする。計測タイプによって1列目がTextInput/DurationInputのどちらになるかが
  // 変わるため、両方のrefを持っておき実際に描画されている方へ委譲する
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

  const [values, setValues] = useState<Record<string, string>>(() => toDisplayValues(columns, set));
  // cardReviewedは同じカードのどれか1セットでも✓確定 or 編集されたら（reopenで未確定に戻っても）
  // trueのまま親側でラッチされる。カード単位で「もう見た」を表すため、このセット自身が
  // ✓未確定・未編集でもここがtrueならゴースト表示は解除する
  const ghost = isPrefilledSet && !done && !cardReviewed;
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
        // ✓は完了/未完了の純粋なトグル。値は常時編集可能でvaluesが唯一の情報源のため、
        // reopen時にDB値へ引き戻す必要はない（編集済みならその値のままでよい）
        await onReopen(set.id);
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
      {columns.map((c, index) => {
        const isDuration = c.key === 'durationSeconds';
        const isFirstColumn = index === 0;
        // ✓済みでも重量・回数欄は直接編集できる（入力ミスに後で気づくケースがあるため）。
        // ✓はcompletedAtの完了/未完了トグルに徹し、編集可否とは独立させている
        const input = isDuration ? (
          <DurationInput
            ref={isFirstColumn ? firstDurationInputRef : undefined}
            initialValue={values[c.key] ?? ''}
            onChange={(text) => handleFieldChange(c.key, text)}
            exerciseName={exerciseName}
            setNumber={set.setNumber}
            ghost={ghost}
          />
        ) : (
          <BoxedTextInput
            ref={isFirstColumn ? firstTextInputRef : undefined}
            height={32}
            boxStyle={[styles.cellBox, ghost && styles.cellGhost]}
            style={[styles.cellText, ghost && styles.cellTextGhost]}
            value={values[c.key]}
            onChangeText={(text) => handleFieldChange(c.key, text)}
            keyboardType={c.keyboardType}
            textAlign="center"
            placeholder="-"
            placeholderTextColor={Colors.textPlaceholder}
            accessibilityLabel={`${exerciseName} セット${set.setNumber} ${c.label}`}
            accessibilityHint={ghost ? '前回の記録から自動入力された未確認の値です' : undefined}
          />
        );
        return (
          <View key={c.key} style={styles.cellWrapper}>
            {input}
          </View>
        );
      })}
      <TouchableOpacity
        style={[styles.check, done && styles.checkDone]}
        onPress={handleTogglePress}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={
          ghost ? `${exerciseName} セット${set.setNumber}、未確認の値` : `${exerciseName} セット${set.setNumber}`
        }
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        {done && <IconSymbol name="checkmark" size={14} color={Colors.onAccent} />}
      </TouchableOpacity>
    </View>
  );
  }),
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 5 },
  number: { width: 52, textAlign: 'center', ...Typography.caption, fontWeight: '600', color: Colors.textPlaceholder },
  cellWrapper: { flex: 1 },
  // 重量・回数欄は箱(背景・枠線・角丸・横padding)とTextInput本体をBoxedTextInputで
  // 分離している。背景・枠線は既定値のままなので、既定(8)より小さいborderRadiusと
  // paddingHorizontalの差分だけ持つ。詳細はcomponents/ui/boxed-text-input.tsxのコメント参照
  cellBox: { borderRadius: 7, paddingHorizontal: 10 },
  cellText: Typography.metric,
  // ✓未確定のまま値が入っている行の見た目（ゴースト表示）。文字色だけでなく背景・枠線も
  // 変えることで、色の濃淡だけに頼らないようにする（WCAG 1.4.1対応）。文字色はtextMutedだと
  // このaccentSurface背景ではコントラスト比がWCAG AA(4.5:1)にわずかに届かないため、
  // 一段濃いtextSecondaryにする
  cellGhost: {
    backgroundColor: Colors.accentSurface,
    borderColor: Colors.accent,
  },
  cellTextGhost: { color: Colors.textSecondary },
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
