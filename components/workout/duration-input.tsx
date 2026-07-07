import { Colors } from '@/constants/theme';
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
      {/* 分・秒を固定幅にして中央へ寄せた結果、枠の左右に生まれる余白がタップに反応しなく
          なってしまうため、両端をそれぞれ隣接する分・秒欄へフォーカスするタップ領域にする */}
      <TouchableOpacity
        style={styles.durationSpacer}
        activeOpacity={1}
        onPress={() => minInputRef.current?.focus()}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <TextInput
        ref={minInputRef}
        style={[styles.durationPart, ghost && styles.durationPartGhost, styles.durationMinPart]}
        value={min}
        onChangeText={handleMinChange}
        keyboardType="number-pad"
        maxLength={3}
        textAlign="center"
        placeholder="分"
        placeholderTextColor={Colors.textPlaceholder}
        accessibilityLabel={`${exerciseName} セット${setNumber} 時間 分`}
        accessibilityHint={ghost ? '前回の記録から自動入力された未確認の値です' : undefined}
      />
      {/* 分が1桁のケース（プランク等の短時間種目で多い）では自動フォーカス移動が発火しないため、
          コロンをタップしても秒欄へ移動できるようにして手動タップの手間を減らす */}
      <TouchableOpacity
        onPress={() => secInputRef.current?.focus()}
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text style={styles.durationColon}>:</Text>
      </TouchableOpacity>
      <TextInput
        ref={secInputRef}
        style={[styles.durationPart, ghost && styles.durationPartGhost, styles.durationSecPart]}
        value={sec}
        onChangeText={handleSecChange}
        keyboardType="number-pad"
        maxLength={2}
        textAlign="center"
        placeholder="秒"
        placeholderTextColor={Colors.textPlaceholder}
        accessibilityLabel={`${exerciseName} セット${setNumber} 時間 秒`}
        accessibilityHint={ghost ? '前回の記録から自動入力された未確認の値です' : undefined}
      />
      <TouchableOpacity
        style={styles.durationSpacer}
        activeOpacity={1}
        onPress={() => secInputRef.current?.focus()}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
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
    paddingVertical: 11,
    paddingHorizontal: 6,
  },
  // 前回の値がまだ未確認（ゴースト表示）の間、背景・枠線・文字色の3点を変えることで
  // 文字色の濃淡だけに頼らないようにする（WCAG 1.4.1対応）
  durationCellGhost: { backgroundColor: Colors.accentSurface, borderColor: Colors.accent },
  // flex:1にすると、time単独のように列幅が広い場合に分・秒それぞれが独立してその半分の
  // 幅の中央に寄ってしまい、間が間延びして見える。固定幅にして「分:秒」をひとまとまりの
  // 塊にし、左右のdurationSpacer（flex:1の余白）で挟むことで中央寄せしつつ、その余白
  // 部分もタップで隣接する入力欄へフォーカスできるようにする
  durationPart: {
    padding: 0,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  durationPartGhost: { color: Colors.textSecondary },
  durationSpacer: {
    flex: 1,
    alignSelf: 'stretch',
  },
  durationMinPart: {
    width: 30,
  },
  durationSecPart: {
    width: 24,
  },
  durationColon: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMuted,
    marginHorizontal: 2,
  },
});
