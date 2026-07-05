import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useRouter } from 'expo-router';
import { StyleSheet, TouchableOpacity } from 'react-native';

type Props = {
  /** react-navigationのheaderLeftから渡される。スタック最下層の画面ではfalseになる */
  canGoBack?: boolean;
  tintColor?: string;
};

/**
 * ネイティブ標準の戻るボタンを置き換えるカスタムコンポーネント。
 * iOS 26以降、ネイティブヘッダーの戻るボタンにOS標準で半透明の丸い背景（Liquid Glass）が
 * 強制的に付与され、微妙な白い枠のように見えてしまうため、自前描画してその影響を避ける。
 * `headerLeft`を差し替えているため`headerBackButtonDisplayMode`等のネイティブ戻るボタン設定は
 * 効果を持たない（この画面以下では常に本コンポーネントが使われる）。
 */
export function BackButton({ canGoBack = true, tintColor }: Props) {
  const router = useRouter();

  if (!canGoBack) return null;

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={() => router.back()}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel="戻る"
    >
      <IconSymbol
        name="chevron.left"
        size={22}
        weight="semibold"
        color={tintColor ?? Colors.textPlaceholder}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
