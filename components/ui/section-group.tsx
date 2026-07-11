import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

type Props = { children: ReactNode };

// 見出し(SectionHeading/FormLabel)+本文を1つのまとまりとして扱う最小単位。
// 種目詳細画面の各セクション（カテゴリ/使う筋肉等）と種目フォームの各フィールドが
// 同じ形（見出しと本文の間はgap8）だったため共通化した。グループ間の余白は
// 画面ごとに異なる（詳細画面20・フォーム16）ため、呼び出し側の親Viewのgapが持つ。
export function SectionGroup({ children }: Props) {
  return <View style={styles.group}>{children}</View>;
}

const styles = StyleSheet.create({
  group: { gap: 8 },
});
