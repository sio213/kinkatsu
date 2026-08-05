import { Colors, Typography } from '@/constants/theme';
import { buildCarouselDots, carouselPositionLabel } from '@/lib/workout/carousel-dots';
import { StyleSheet, Text, View } from 'react-native';

const DOT_SIZE = 6;
const SMALL_DOT_SIZE = 4;

/**
 * 表示中の種目がグラフ何枚目かを示すドット列（デザイン案②）。件数が多い場合は5個に圧縮し、
 * 正確な位置を「3/8」で併記する。
 *
 * 読み上げでは点の羅列に意味が無いので、行ごと1つの位置テキストにまとめる
 */
export function SummaryChartDots({ total, currentIndex }: { total: number; currentIndex: number }) {
  const dots = buildCarouselDots(total, currentIndex);
  const position = carouselPositionLabel(total, currentIndex);

  return (
    <View style={styles.row} accessible accessibilityLabel={`${total}種目中${currentIndex + 1}種目目`}>
      <View style={styles.dots}>
        {dots.map((dot, i) => (
          <View key={i} style={[styles.dot, dot.small && styles.dotSmall, dot.active && styles.dotActive]} />
        ))}
      </View>
      {position && <Text style={styles.position}>{position}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 5 },
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
