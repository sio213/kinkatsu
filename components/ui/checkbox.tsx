import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { StyleSheet, View } from 'react-native';

type Props = {
  checked: boolean;
  size?: number;
};

// 見た目のみのプレゼンテーショナルコンポーネント。タップ処理は呼び出し側のTouchableOpacityが持つ
// （history-load-exercise-card.tsxの行チェックボックスと、画面の「全選択」トグルで共有し、
// サイズ・角丸・チェックマークの見た目がズレないようにする）
export function Checkbox({ checked, size = 22 }: Props) {
  return (
    <View
      style={[
        styles.box,
        { width: size, height: size, borderRadius: Math.round(size * 0.27) },
        checked && styles.checked,
      ]}
    >
      {checked && <IconSymbol name="checkmark" size={Math.round(size * 0.64)} color={Colors.onAccent} />}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checked: { backgroundColor: Colors.accent, borderColor: Colors.accent },
});
