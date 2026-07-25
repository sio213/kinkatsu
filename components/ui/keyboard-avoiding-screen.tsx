import { HeaderHeightContext } from '@react-navigation/elements';
import { useContext } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

// 下部固定フッター（保存・決定・戻る等のボタン）を持つ画面で、キーボードが開いている間も
// フッターをキーボードの上に押し上げるためのラッパー。
// `SafeAreaView`(edges={['bottom']})の内側・スクロール本体＋フッターの外側に置く。
//
// keyboardVerticalOffsetにヘッダー高さを渡すのが要点。KeyboardAvoidingViewは自身のonLayout
// （＝親からの相対座標。画面座標ではない）とキーボードの画面座標を突き合わせて余白を計算するため、
// ヘッダー＋ステータスバーの分だけ余白が足りず、素で使うとフッターがキーボードに隠れたままになる。
//
// useHeaderHeight()ではなくHeaderHeightContextを直接読むのは、useHeaderHeight()がナビゲータの
// 外（＝ヘッダーが無い画面やテスト）でthrowするため。ヘッダーが無ければオフセットは0でよい。
export function KeyboardAvoidingScreen({ children, style }: Props) {
  const headerHeight = useContext(HeaderHeightContext) ?? 0;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      // Androidはウィンドウ自体がリサイズされる(softwareKeyboardLayoutMode: resize)ため
      // KeyboardAvoidingView側での押し上げは不要
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
