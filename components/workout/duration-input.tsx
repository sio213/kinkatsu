import { BoxedTextInput } from '@/components/ui/boxed-text-input';
import { Colors, Typography } from '@/constants/theme';
import { combineDurationDisplay, splitDurationDisplay } from '@/lib/workout/set-format';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type DurationInputProps = {
  initialValue: string;
  onChange: (combined: string) => void;
  exerciseName: string;
  setNumber: number;
  // 前回の値がまだ確認(✓)されていない状態の見た目（ゴースト表示）にするかどうか
  ghost?: boolean;
};

export type DurationInputHandle = { focus: () => void };

// 分・秒を数値専用キーボードの別入力として扱い、任意の文字が打てないようにする。
// 秒は入力時点で60以上になる変更を無視することで、そもそも不正な状態に到達させない。
// ラベルは列のlabel（time型は「時間(分:秒)」）をそのまま使うと"時間(分:秒) 分"のように
// 読み上げが重複するため、計測タイプによらず固定の「時間」を基準にする
export const DurationInput = forwardRef<DurationInputHandle, DurationInputProps>(function DurationInput(
  { initialValue, onChange, exerciseName, setNumber, ghost }: DurationInputProps,
  ref,
) {
  const initial = splitDurationDisplay(initialValue);
  const [min, setMin] = useState(initial.min);
  const [sec, setSec] = useState(initial.sec);
  // 同一レンダーサイクル内で分→秒と連続してonChangeTextが呼ばれても、setStateはバッチ処理され
  // 直後のハンドラからはまだ更新前の値しか見えない（stale closure）。setStateの外で同期的に
  // 更新する鏡を経由することで、常に最新の値を基準にonChangeへ渡す（set-row.tsx側のvaluesRefと同じ対策）
  const minRef = useRef(min);
  const secRef = useRef(sec);
  const minInputRef = useRef<TextInput>(null);
  const secInputRef = useRef<TextInput>(null);

  useImperativeHandle(ref, () => ({ focus: () => minInputRef.current?.focus() }), []);

  // 余白（スペーサー・コロン）タップで隣接する入力欄へフォーカスを送る補助。ただしBoxedTextInputの
  // 箱タップと同様、すでにフォーカス済みなら何もしない（無条件focus()だとselectTextOnFocusが
  // 毎回再発火して全選択し直し、2回目タップでカーソルに移れず重量・回数欄と挙動がずれるため）
  const focusIfNeeded = (target: { current: TextInput | null }) => {
    if (!target.current?.isFocused()) target.current?.focus();
  };

  const handleMinChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 3);
    minRef.current = digits;
    setMin(digits);
    onChange(combineDurationDisplay(digits, secRef.current));
    // 分を2桁打った時点で秒欄へ自動遷移する（3桁以上の分は稀なため、必要なら手動で分欄をタップし直す）
    if (digits.length >= 2) secInputRef.current?.focus();
  };

  const handleSecChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 2);
    if (digits !== '' && Number(digits) > 59) return;
    secRef.current = digits;
    setSec(digits);
    onChange(combineDurationDisplay(minRef.current, digits));
  };

  return (
    <View style={[styles.durationCell, ghost && styles.durationCellGhost]}>
      {/* 分・秒のTextInput本体をそれぞれ左半分・右半分いっぱい（flex:1）に広げ、コロン側に
          文字を寄せる（分=右寄せ・秒=左寄せ）ことで「分:秒」の塊感を保ちつつ、箱の端まで
          TextInput本体の当たり判定にする。こうすると重量・回数欄と同じく、タップした箇所に
          そのままカーソルが立つ（2回目タップでカーソル移動できる）。固定幅＋左右スペーサーで
          中央寄せしていた旧実装では、スペーサー部分がフォーカス補助しか持たず、既にフォーカス
          済みの状態で端をタップしてもカーソルが動かなかった */}
      <BoxedTextInput
        ref={minInputRef}
        height={32}
        bare
        boxStyle={styles.durationPartBox}
        style={[styles.durationPart, ghost && styles.durationPartGhost]}
        value={min}
        onChangeText={handleMinChange}
        keyboardType="number-pad"
        // 重量・回数セル（set-row.tsx）と挙動を揃え、タップで既存値を全選択して上書きできるようにする。
        // 数値欄では全選択/コピペのコンテキストメニュー（英語表示にもなる）は不要なので隠す
        selectTextOnFocus
        contextMenuHidden
        maxLength={3}
        textAlign="right"
        placeholder="分"
        placeholderTextColor={Colors.textPlaceholder}
        accessibilityLabel={`${exerciseName} セット${setNumber} 時間 分`}
        accessibilityHint={ghost ? '前回の記録から自動入力された未確認の値です' : undefined}
      />
      {/* 分が1桁のケース（プランク等の短時間種目で多い）では自動フォーカス移動が発火しないため、
          コロンをタップしても秒欄へ移動できるようにして手動タップの手間を減らす */}
      <TouchableOpacity
        onPress={() => focusIfNeeded(secInputRef)}
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text style={styles.durationColon}>:</Text>
      </TouchableOpacity>
      <BoxedTextInput
        ref={secInputRef}
        height={32}
        bare
        boxStyle={styles.durationPartBox}
        style={[styles.durationPart, ghost && styles.durationPartGhost]}
        value={sec}
        onChangeText={handleSecChange}
        keyboardType="number-pad"
        selectTextOnFocus
        contextMenuHidden
        maxLength={2}
        textAlign="left"
        placeholder="秒"
        placeholderTextColor={Colors.textPlaceholder}
        accessibilityLabel={`${exerciseName} セット${setNumber} 時間 秒`}
        accessibilityHint={ghost ? '前回の記録から自動入力された未確認の値です' : undefined}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  durationCell: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: 7,
    // 上下の余白は分・秒のBoxedTextInput(height:32)側に持たせ、ここではpaddingVerticalを
    // 持たない。paddingVerticalにすると、その余白部分が分・秒どちらのタップ領域にも含まれず
    // 「箱の上下端をタップしても反応しない」デッドゾーンになるため
    paddingHorizontal: 6,
  },
  // 前回の値がまだ未確認（ゴースト表示）の間、背景・枠線・文字色の3点を変えることで
  // 文字色の濃淡だけに頼らないようにする（WCAG 1.4.1対応）
  durationCellGhost: { backgroundColor: Colors.accentSurface, borderColor: Colors.accent },
  // 分・秒はBoxedTextInputで箱(幅)とTextInput本体を分離している(bare指定で枠線・背景は
  // 持たせず、親durationCellの枠内に収める)。文字色は既定値のままなのでここでは持たない。
  // 詳細はcomponents/ui/boxed-text-input.tsxのコメント参照
  durationPart: Typography.metric,
  durationPartGhost: { color: Colors.textSecondary },
  // 分・秒の箱をそれぞれ左半分・右半分いっぱいに広げる。TextInput本体が箱幅まで伸びるので
  // 端までタップ＝カーソル配置になり、重量・回数欄と挙動が揃う。文字はtextAlignでコロン側
  // （分=右・秒=左）に寄せているため、幅を広げても「分:秒」の塊感は保たれる
  durationPartBox: {
    flex: 1,
  },
  durationColon: {
    ...Typography.metric,
    color: Colors.textMuted,
    marginHorizontal: 2,
  },
});
