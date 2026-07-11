import { forwardRef } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

type Props = TextInputProps & {
  height: number;
  // 枠線・背景・角丸・横paddingなど「箱」側の見た目
  boxStyle?: StyleProp<ViewStyle>;
};

// 単一行入力欄を、見た目の箱(高さ固定・overflow hidden)とTextInput本体を分離して描画する。
// TextInput自身にheightを持たせてしまうと、日本語IME変換中・変換後の未確定/確定文字
// （カタカナ・漢字など）がこちらの指定lineHeightより自然に背が高く描画されることがあり、
// 縦位置がUIKitの自動センタリングに引っ張られて箱の下側にずれて見える問題が起きる。
// TextInputには高さを持たせず内容に応じて自然にレンダリングさせ、箱側のjustifyContent:
// centerで常に中央に据え、overflow:hiddenではみ出た分だけ切り詰めることで、箱の見た目の
// 高さと縦位置を常に固定する（Androidの文字種によるincludeFontPadding変動対策も兼ねる）。
export const BoxedTextInput = forwardRef<TextInput, Props>(function BoxedTextInput(
  { height, boxStyle, style, ...rest }: Props,
  ref,
) {
  return (
    <View style={[styles.box, { height }, boxStyle]}>
      <TextInput ref={ref} style={[styles.text, style as StyleProp<TextStyle>]} {...rest} />
    </View>
  );
});

const styles = StyleSheet.create({
  box: { justifyContent: 'center', overflow: 'hidden' },
  text: { includeFontPadding: false },
});
