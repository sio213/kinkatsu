import { Colors } from '@/constants/theme';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  children: string;
  containerStyle?: StyleProp<ViewStyle>;
  trailing?: ReactNode;
  accessibilityLabel?: string;
};

// アクセントバー付きの小見出し。種目詳細のセクション見出し（カテゴリ/使う筋肉等）と
// FormLabel（フォーム項目ラベル）が共有する最小単位。バッジ等のtrailingは呼び出し側が渡す。
export function SectionHeading({ children, containerStyle, trailing, accessibilityLabel }: Props) {
  return (
    <View
      style={[styles.row, containerStyle]}
      accessible
      accessibilityRole="header"
      accessibilityLabel={accessibilityLabel ?? children}
    >
      <View style={styles.bar} />
      <Text style={styles.label}>{children}</Text>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  bar: { width: 3, height: 14, borderRadius: 2, backgroundColor: Colors.accent },
  label: { fontSize: 13, fontWeight: '700', color: Colors.textBody, letterSpacing: 0.2 },
});
