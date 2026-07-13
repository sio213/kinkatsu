import { Colors, Typography } from '@/constants/theme';
import type { ReactNode } from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

type Props = {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
};

// フォームのバリデーションエラー1行分の表示。FormField内のフィールド単位のエラー表示だけでなく、
// リマインダートグルの警告など、FormFieldの外で単独のエラー文言を出したい場面でも流用する。
// デフォルトのmarginTop: -4はSectionGroupのgap8を打ち消してFormField内での本文との間隔を
// 4pxにするための補正値（FormField外で使う場合は呼び出し側でstyleを渡して上書きする）
export function FormErrorText({ children, style }: Props) {
  return <Text style={[styles.errorText, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  errorText: { ...Typography.caption, color: Colors.danger, marginTop: -4 },
});
