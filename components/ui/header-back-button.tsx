import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useNavigation } from 'expo-router';
import { StyleSheet, TouchableOpacity } from 'react-native';

// native-stackのネイティブ戻るボタンは左端に寄りすぎる位置で、位置調整のオプションも無いため、
// 余白付きの自前シェブロンに差し替える。ネイティブのスワイプ戻るジェスチャ(gestureEnabled)は
// headerLeftを差し替えても有効なまま。canGoBack時のみ表示し、ルート/モーダル先頭では出さない。
export function HeaderBackButton({ tintColor }: { tintColor?: string }) {
  const navigation = useNavigation();
  if (!navigation.canGoBack()) return null;
  return (
    <TouchableOpacity
      style={styles.button}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel="戻る"
      onPress={() => navigation.goBack()}
    >
      <IconSymbol name="chevron.left" size={26} color={tintColor ?? Colors.textPlaceholder} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: { paddingLeft: 6, paddingRight: 10, paddingVertical: 4 },
});
