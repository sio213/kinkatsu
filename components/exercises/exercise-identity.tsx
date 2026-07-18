import { CategoryChip } from '@/components/exercises/category-chip';
import { Colors, Typography } from '@/constants/theme';
import type { ExerciseImages } from '@/lib/exercises/images';
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  images: ExerciseImages;
  name: string;
  category: string;
  // 種目名の右に置く要素（例: 自己ベストバッジ）。session-exercise-card.tsx・
  // routine-template-exercise-card.tsxは使わないが、カレンダーの読み取り専用カードが使う
  nameTrailing?: ReactNode;
  // カテゴリチップの右に置く要素（折りたたみ時のセット概要、前回比較数値等）
  metaTrailing?: ReactNode;
};

// サムネイル+種目名+カテゴリチップの並びは、トレーニング中画面(session-exercise-card.tsx)・
// ルーティン編集画面(routine-template-exercise-card.tsx)・カレンダーの読み取り専用カードで
// 見た目が共通のため、表示専用の部分だけをここに切り出す。展開/折りたたみ・⋮メニュー・
// タップ領域（カード全体か、ヘッダー行だけか）は呼び出し側の操作モデルが異なるためここには含めず、
// 各カード側でこのコンポーネントをTouchableOpacity等で包んで使う
export function ExerciseIdentity({ images, name, category, nameTrailing, metaTrailing }: Props) {
  return (
    <>
      <Image source={images.thumbnail} style={styles.thumbnail} contentFit="cover" />
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {nameTrailing}
        </View>
        <View style={styles.metaRow}>
          <CategoryChip category={category} />
          {metaTrailing}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  thumbnail: {
    width: 46,
    height: 46,
    borderRadius: 7,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  info: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { ...Typography.cardTitle, color: Colors.textPrimary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
