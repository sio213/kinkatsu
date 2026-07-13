import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

type Props = { children: ReactNode };

// フォーム全体を包む最上位コンテナ。フィールド(FormField)間の間隔をgap16に統一する。
// デザイン案(種目04新規作成/06編集フレーム)のフィールド間gap15〜16に合わせた値。
export function FormFieldStack({ children }: Props) {
  return <View style={styles.stack}>{children}</View>;
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
});
