import { Colors } from '@/constants/theme';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

type Props = {
  /** getExerciseImages(...).thumbnail */
  source: number;
  /** 一辺のpx。呼び出し側の行の高さに合わせる（38/40/46が使われている） */
  size: number;
  /** 枠線を出すか。並び替え画面だけドラッグ中の見た目を軽くするため出さない */
  bordered?: boolean;
};

/**
 * 種目のサムネイル。一覧・ピッカー・カード類で共通。
 *
 * frameのbackgroundColorは素材が読み込まれるまでの下地。素材(GymVisual)は背景が白く
 * 焼き込まれているため、表示後は画像の白がこの色を覆う。種目詳細のメディア枠
 * (exercise-detail-screen.tsx)では乗算ブレンドで白背景を枠と同色に置き換えているが、
 * 一覧のサムネイルは白のままのほうが良いという判断でここには入れていない。
 */
export function ExerciseThumbnail({ source, size, bordered = true }: Props) {
  return (
    <View style={[styles.frame, { width: size, height: size }, bordered && styles.bordered]}>
      <Image source={source} style={styles.image} contentFit="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: 7,
    backgroundColor: Colors.surfaceSubtle,
    // 角丸から画像がはみ出さないようにする
    overflow: 'hidden',
  },
  bordered: {
    borderWidth: 1,
    borderColor: Colors.border,
  },
  image: { flex: 1 },
});
