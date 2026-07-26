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
 * 素材(GymVisual)は背景が白く焼き込まれているため、`backgroundColor` を指定しても
 * 画像がその上を白で塗りつぶしてしまう。そこで乗算ブレンドのオーバーレイを重ねて
 * 背景だけを surfaceSubtle にしている（白(255)への乗算結果はオーバーレイ色そのもの、
 * 黒(0)は黒のまま。種目詳細のメディア枠 exercise-detail-screen.tsx と同じ手法）。
 * isolationでこのViewを合成グループにして、背後のカードまで巻き込まないようにしている。
 */
export function ExerciseThumbnail({ source, size, bordered = true }: Props) {
  return (
    <View style={[styles.frame, { width: size, height: size }, bordered && styles.bordered]}>
      <Image source={source} style={styles.image} contentFit="cover" />
      <View style={styles.tint} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: 7,
    backgroundColor: Colors.surfaceSubtle,
    // 角丸からオーバーレイがはみ出さないようにする
    overflow: 'hidden',
    isolation: 'isolate',
  },
  bordered: {
    borderWidth: 1,
    borderColor: Colors.border,
  },
  image: { flex: 1 },
  tint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.surfaceSubtle,
    mixBlendMode: 'multiply',
  },
});
