import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useNavigation } from 'expo-router';
import { StyleSheet, TouchableOpacity } from 'react-native';

type Props = {
  tintColor?: string;
  /**
   * 押したときの遷移。省略すると通常の「1つ戻る」。
   *
   * 完了サマリーのように、下に積まれているのがタブで、シェブロンでは別の画面（記録編集）へ
   * 進ませたい場合に渡す。goBackではないので canGoBack の判定も適用しない
   */
  onPress?: () => void;
  /** 行き先が「1つ前」でない場合に上書きする読み上げ（例:「記録を編集する」） */
  accessibilityLabel?: string;
};

// native-stackのネイティブ戻るボタンは左端に寄りすぎる位置で、位置調整のオプションも無いため、
// 余白付きの自前シェブロンに差し替える。ネイティブのスワイプ戻るジェスチャ(gestureEnabled)は
// headerLeftを差し替えても有効なまま。canGoBack時のみ表示し、ルート/モーダル先頭では出さない。
export function HeaderBackButton({ tintColor, onPress, accessibilityLabel }: Props) {
  const navigation = useNavigation();
  if (!onPress && !navigation.canGoBack()) return null;
  return (
    <TouchableOpacity
      style={styles.button}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? '戻る'}
      onPress={onPress ?? (() => navigation.goBack())}
    >
      <IconSymbol name="chevron.left" size={26} color={tintColor ?? Colors.textPlaceholder} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: { paddingLeft: 6, paddingRight: 10, paddingVertical: 4 },
});
