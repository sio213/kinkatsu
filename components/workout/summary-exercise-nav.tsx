import { DesignIcon } from '@/components/ui/design-icon';
import { Colors, Typography } from '@/constants/theme';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// ボタン自体は30×30しかないため、上下8・外側8を足してタップ判定を44pt以上にする
// （期間チップと同じ考え方。デザイン案の指定）
const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };
const ICON_SIZE = 19;

function NavButton({
  direction,
  disabled,
  onPress,
}: {
  direction: 'prev' | 'next';
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.button, disabled && styles.buttonDisabled]}
      onPress={onPress}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={direction === 'prev' ? '前の種目' : '次の種目'}
      accessibilityState={{ disabled }}
    >
      {/* IconSymbolではなくDesignIconを使う。デザイン案が使っているMaterial Symbolsと
          字送りが一致し、左右で字形が揃う（design-icon.tsxのchevron-rightのコメント参照） */}
      <DesignIcon
        name={direction === 'prev' ? 'chevron-left' : 'chevron-right'}
        size={ICON_SIZE}
        color={disabled ? Colors.borderStrong : Colors.accent}
      />
    </TouchableOpacity>
  );
}

/**
 * 完了サマリーのグラフで表示中の種目を切り替える行。種目名を中央に、左右に送りボタンを置く。
 *
 * 端に達した側は無効にしてループさせない（「1/5」のような位置テキストは出さず、押せるか
 * どうかで端であることを伝える。デザイン案②）。種目が1件だけなら両方とも無効になる
 */
export function SummaryExerciseNav({
  name,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: {
  name: string;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}) {
  return (
    <View style={styles.row}>
      <NavButton direction="prev" disabled={!hasPrev} onPress={onPrev} />
      {/* 長い種目名は折り返さず1行で省略する。折り返すと送りボタンの縦位置が動くため */}
      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
      <NavButton direction="next" disabled={!hasNext} onPress={onNext} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  button: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accentSurface,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
  },
  // 無効時は面と枠を抜いて、押せる側との差を色ではなく面で見せる
  buttonDisabled: { backgroundColor: Colors.surfaceMuted, borderColor: Colors.border },
  name: {
    flex: 1,
    minWidth: 0,
    textAlign: 'center',
    ...Typography.exerciseNavTitle,
    color: Colors.textPrimary,
  },
});
