import { Colors } from '@/constants/theme';
import { StyleSheet, View } from 'react-native';

type Props = {
  selected: boolean;
  size?: number;
  /**
   * 'outline'（既定）… 円の中にアクセント色のドットを置く。行の背景が変わらない一覧で使う
   *   （種目ピッカーのpicker-exercise-row.tsx）
   * 'filled' … 選択時に円ごとアクセント色で塗り、ドットを白抜きにする。選択行の背景自体が
   *   accentSurfaceで薄く塗られる場面では、輪郭＋小さなドットだけでは選択の主張が弱いため
   *   （種目フォームの「記録する項目」）
   */
  variant?: 'outline' | 'filled';
  /** 中央のドットの直径。既定は size の半分 */
  dotSize?: number;
};

// 見た目のみのプレゼンテーショナルコンポーネント。タップ処理は呼び出し側のTouchableOpacityが持つ
// （checkbox.tsxのラジオボタン版）
export function Radio({ selected, size = 22, variant = 'outline', dotSize }: Props) {
  const resolvedDotSize = dotSize ?? Math.round(size * 0.5);
  const filled = variant === 'filled';
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2 },
        filled && styles.circleFilled,
        selected && styles.selected,
        selected && filled && styles.selectedFilled,
      ]}
    >
      {selected && (
        <View
          style={[
            styles.dot,
            filled && styles.dotFilled,
            { width: resolvedDotSize, height: resolvedDotSize, borderRadius: resolvedDotSize / 2 },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleFilled: { borderWidth: 1.6 },
  selected: { borderColor: Colors.accent },
  selectedFilled: { backgroundColor: Colors.accent },
  dot: { backgroundColor: Colors.accent },
  dotFilled: { backgroundColor: Colors.onAccent },
});
