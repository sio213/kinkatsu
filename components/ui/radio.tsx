import { Colors } from '@/constants/theme';
import { StyleSheet, View } from 'react-native';

type Props = {
  selected: boolean;
  size?: number;
};

// 見た目のみのプレゼンテーショナルコンポーネント。タップ処理は呼び出し側のTouchableOpacityが持つ
// （checkbox.tsxのラジオボタン版。単一選択のpicker-exercise-row.tsxで使う）
export function Radio({ selected, size = 22 }: Props) {
  const dotSize = Math.round(size * 0.5);
  return (
    <View
      style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }, selected && styles.selected]}
    >
      {selected && <View style={[styles.dot, { width: dotSize, height: dotSize, borderRadius: dotSize / 2 }]} />}
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
  selected: { borderColor: Colors.accent },
  dot: { backgroundColor: Colors.accent },
});
