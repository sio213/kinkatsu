import { DesignIcon } from '@/components/ui/design-icon';
import { Colors } from '@/constants/theme';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

/**
 * プレースホルダーのアイコンサイズ。枠は38/40/46pxの3種あるが、行ごとにアイコンの大きさが
 * 変わると一覧がざわつくため、枠に対する比率ではなく固定値にしている。
 * 種目詳細のメディア枠だけは枠が大きいので別の値（exercise-detail-screen.tsx）。
 */
const PLACEHOLDER_ICON_SIZE = 20;

type Props = {
  /** getExerciseImages(...).thumbnail。素材を持たない種目（カスタム種目）ではundefined */
  source: number | undefined;
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
 *
 * sourceが無い種目（カスタム種目）は写真の代わりにプレースホルダーの線画を出す。枠の角丸・
 * 枠線・背景は写真ありの行と同一にして、外形だけで浮かないようにしている。
 */
export function ExerciseThumbnail({ source, size, bordered = true }: Props) {
  return (
    <View
      style={[
        styles.frame,
        { width: size, height: size },
        bordered && styles.bordered,
        source == null && styles.placeholder,
      ]}
    >
      {source == null ? (
        <DesignIcon
          name="dumbbell-outline"
          size={PLACEHOLDER_ICON_SIZE}
          color={Colors.textPlaceholder}
        />
      ) : (
        <Image source={source} style={styles.image} contentFit="cover" />
      )}
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
  // 画像のときはflex:1で枠いっぱいに広がるが、プレースホルダーは固定サイズなので中央に置く
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { flex: 1 },
});
