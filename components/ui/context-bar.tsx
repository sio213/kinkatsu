import { Colors } from '@/constants/theme';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

type Justify = 'space-between' | 'flex-end' | 'flex-start';

// ヘッダー直下に置く「今何を操作しているか」を示す帯の共通の見た目（余白・下境界線）。
// 中身（日付+タイマー、選択数+全選択チェックボックスなど）は画面側で組み立てる。
// justifyは中身が1要素だけの画面（例: タイマーチップのみ）で右寄せ等にしたい時に上書きする
export function ContextBar({ children, justify = 'space-between' }: { children: ReactNode; justify?: Justify }) {
  return <View style={[styles.bar, { justifyContent: justify }]}>{children}</View>;
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
});
