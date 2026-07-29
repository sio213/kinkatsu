import { useScrollFocusedInputIntoView } from '@/components/ui/focused-input-scroll-context';
import { Colors } from '@/constants/theme';
import { forwardRef, useRef, type ForwardedRef } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

// forwardRefで受け取った外向きのrefと、箱タップ時のフォーカス用に持つ内部refの両方へ
// 同じTextInputノードを流す。呼び出し側は今まで通り実TextInputのref（focus等）を得られる
function assignRef(ref: ForwardedRef<TextInput>, node: TextInput | null) {
  if (typeof ref === 'function') ref(node);
  else if (ref) ref.current = node;
}

type Props = TextInputProps & {
  height: number;
  // 枠線・背景・角丸など「箱」側で共通デフォルトから変える差分だけを書く
  // (paddingHorizontal・borderRadius・backgroundColorの上書き等)
  boxStyle?: StyleProp<ViewStyle>;
  // 枠線・背景・角丸を持たない「素の」入力欄にしたい場合はtrueにする
  // (例: 分:秒のように複数の入力欄を1つの外枠でまとめて囲む場合)
  bare?: boolean;
};

// 単一行入力欄を、見た目の箱(高さ固定・overflow hidden)とTextInput本体を分離して描画する。
// TextInput自身にheightを持たせてしまうと、日本語IME変換中・変換後の未確定/確定文字
// （カタカナ・漢字など）がこちらの指定lineHeightより自然に背が高く描画されることがあり、
// 縦位置がUIKitの自動センタリングに引っ張られて箱の下側にずれて見える問題が起きる。
// TextInputには高さを持たせず内容に応じて自然にレンダリングさせ、箱側のjustifyContent:
// centerで常に中央に据え、overflow:hiddenではみ出た分だけ切り詰めることで、箱の見た目の
// 高さと縦位置を常に固定する（Androidの文字種によるincludeFontPadding変動対策も兼ねる）。
//
// さらにstyleに渡されたlineHeightは強制的に無効化する。RNのカスタムlineHeightはiOSでは
// 文字列全体に対して単一のベースライン補正しか計算しないため、ひらがな・カタカナ・漢字で
// フォント内部の基準位置(ascent/descent)が異なる文字が混在すると、字体ごとに縦位置が
// 数pt単位でずれて見える（例:「あアプリ」であ→アで見た目の下端が下にずれる）。lineHeightを
// 指定せず文字ごとの自然な行の高さに任せることで、この字体差によるベースラインのズレを防ぐ。
//
// 枠線・背景・角丸・文字色は、アプリ内のほぼ全ての入力欄で同じ値（border/surface/8/textPrimary）
// になっているため既定値として持たせ、呼び出し側はradius・paddingHorizontal・ghost時の色など
// 実際に異なる差分だけをboxStyle/styleで上書きする。
export const BoxedTextInput = forwardRef<TextInput, Props>(function BoxedTextInput(
  { height, boxStyle, bare, style, onFocus, ...rest }: Props,
  ref,
) {
  const innerRef = useRef<TextInput | null>(null);
  const scrollFocusedInputIntoView = useScrollFocusedInputIntoView();
  return (
    // 箱をPressableにして、文字が無い余白部分（左右padding・上下の空き）をタップしても
    // 入力欄にフォーカスできるようにする。TextInput自身は文字の自然高さ・幅ぶんしか当たり判定を
    // 持たない（縦はIMEのベースラインずれ対策で箱の高さをTextInputに持たせず中央寄せしている。
    // 上のコメント参照）ため、それだけだと箱の端が反応しない。箱全体で拾って実TextInputへ委譲する
    <Pressable
      // 箱自体はスクリーンリーダーの独立要素にせず、中のTextInput（accessibilityLabel付き）を
      // そのまま読み上げ対象にする。箱タップはあくまでフォーカス補助
      accessible={false}
      style={[bare ? styles.bareBox : styles.box, { height }, boxStyle]}
      // すでにフォーカス済みのときは何もしない。無条件にfocus()するとselectTextOnFocusが
      // タップのたびに再発火して全選択し直してしまい、「1回目=全選択・2回目以降=カーソル」という
      // TextInput本来の挙動（重量・回数欄と同じ）にならなくなるため
      onPress={() => {
        if (!innerRef.current?.isFocused()) innerRef.current?.focus();
      }}
    >
      <TextInput
        ref={(node) => {
          innerRef.current = node;
          assignRef(ref, node);
        }}
        style={[styles.text, style as StyleProp<TextStyle>, styles.forced]}
        // キーボードと下部固定フッターに隠れる位置なら、見える位置までスクロールする
        // （FocusedInputScrollProviderで包まれた画面のみ。それ以外では何も起きない）
        onFocus={(e) => {
          scrollFocusedInputIntoView(innerRef.current);
          onFocus?.(e);
        }}
        {...rest}
      />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  bareBox: { justifyContent: 'center', overflow: 'hidden' },
  box: {
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: 8,
    backgroundColor: Colors.surface,
  },
  text: { color: Colors.textPrimary },
  // includeFontPadding: Androidの文字種によるボックス高さの変動対策
  // lineHeight: undefinedでcallerのTypography由来の値を必ず打ち消す(上部コメント参照)
  // styleより後に置き、callerが誤って上書きできないようにする
  forced: { includeFontPadding: false, lineHeight: undefined },
});
