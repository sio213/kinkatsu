import { Colors } from '@/constants/theme';
import type { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { IconSymbol } from './icon-symbol';

type Props = {
  title: string;
  onBack: () => void;
  // 右側スロット。省略時は左のアイコンボタンと同幅の空スペーサーになりタイトルが中央に来る
  right?: ReactNode;
};

// 種目詳細・種目編集で共通の「戻る + 中央タイトル + 右スロット」ヘッダー
export function ScreenHeader({ title, onBack, right }: Props) {
  return (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.iconBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="戻る"
        onPress={onBack}
      >
        <IconSymbol name="chevron.left" size={22} color={Colors.textPlaceholder} />
      </TouchableOpacity>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.iconBtn}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
