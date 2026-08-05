import { Colors, Typography } from '@/constants/theme';
import { buildCarouselDots, carouselPositionLabel } from '@/lib/workout/carousel-dots';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const DOT_SIZE = 6;
const SMALL_DOT_SIZE = 4;

/**
 * 表示中の種目がグラフ何枚目かを示すドット列（デザイン案②）。件数が多い場合は5個に圧縮し、
 * 正確な位置を「3/8」で併記する。押して種目を送ることもできる。
 *
 * **ドットのタップ判定は11×24ptで、44ptの目安を下回る。** 6pxのドットが5px間隔で並ぶ以上、
 * 隣と重ならずに44ptを確保する余地が無い。押しやすさは送りボタン（44pt確保済み）と
 * スワイプが担い、ドットは「押せもする」補助として扱う
 */
export function SummaryChartDots({
  total,
  currentIndex,
  onSelect,
}: {
  total: number;
  currentIndex: number;
  /** 0始まりの種目位置。圧縮時は1つ隣までしか指せない（下のtargetIndexを参照） */
  onSelect: (index: number) => void;
}) {
  const dots = buildCarouselDots(total, currentIndex);
  const position = carouselPositionLabel(total, currentIndex);

  return (
    <View style={styles.row}>
      <View style={styles.dots}>
        {dots.map((dot, slot) => {
          // 圧縮していなければドットと種目が1対1。圧縮時は1対1でなくなるので、
          // 光っているドットより左を押したら1つ戻る・右なら1つ進む、という相対移動にする
          const target =
            dots.length === total ? slot : currentIndex + Math.sign(slot - dots.findIndex((d) => d.active));
          return (
            <TouchableOpacity
              key={slot}
              style={styles.dotTarget}
              onPress={() => onSelect(target)}
              disabled={target === currentIndex}
              accessibilityRole="button"
              accessibilityLabel={`${target + 1}種目目へ`}
            >
              <View style={[styles.dot, dot.small && styles.dotSmall, dot.active && styles.dotActive]} />
            </TouchableOpacity>
          );
        })}
      </View>
      {position && <Text style={styles.position}>{position}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  // gapではなくドット側のpaddingで間隔を作る。見た目の隙間（5px）は保ったまま、
  // 6pxしかないドットのタップ判定を左右+2.5px・上下+9pxぶん広げるため
  dots: { flexDirection: 'row', alignItems: 'center' },
  dotTarget: { paddingHorizontal: 2.5, paddingVertical: 9 },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: Colors.borderStrong,
  },
  // 圧縮時の端。「まだ先がある」ことを大きさで示す
  dotSmall: { width: SMALL_DOT_SIZE, height: SMALL_DOT_SIZE, borderRadius: SMALL_DOT_SIZE / 2 },
  dotActive: { backgroundColor: Colors.accent },
  position: { ...Typography.captionCompact, fontWeight: '600', color: Colors.textMuted },
});
