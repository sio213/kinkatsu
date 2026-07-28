import { Colors } from '@/constants/theme';
import { CHART_HEIGHT } from '@/lib/exercises/chart-layout';
import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Line, Path, Stop } from 'react-native-svg';

const SAMPLE_GRADIENT_ID = 'progressChartSampleArea';

/**
 * 見本の形。デザイン案が 290px 幅で描いた座標をそのまま持ち、横方向だけ実際の幅に合わせて伸ばす。
 * 「同じ重量を数回続けてから上げる」という実際の進め方に近い階段状にしてある
 */
const DESIGN_WIDTH = 290;
const SAMPLE_POINTS: [number, number][] = [
  [24, 128],
  [62, 128],
  [100, 112],
  [138, 112],
  [176, 94],
  [214, 94],
  [266, 60],
];
const SAMPLE_GRID_YS = [172, 138, 104, 70, 36];
const SAMPLE_BASELINE = 172;
const SAMPLE_X_START = 8;
const SAMPLE_X_END = 284;

/** 見本であることが一目で分かるよう、線も点も薄くする */
const SAMPLE_OPACITY = 0.3;
const SAMPLE_AREA_OPACITY = 0.16;
const GRID_DASH = '3 4';
const SAMPLE_LINE_DASH = '5 5';

/**
 * 記録が0件のときに描く、階段状の薄い見本グラフ。
 *
 * 「まだ何も無い」ことを空白で示すのではなく、完成形を予告して記録する動機にする（デザイン案）。
 * 高さは本物のグラフ（CHART_HEIGHT）と同じにしてあるので、0件から2件以降に変わっても
 * 期間チップから下のレイアウトが動かない。
 */
export function ExerciseProgressChartSample() {
  const [width, setWidth] = useState(0);

  const handleLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  const scaleX = (x: number) => (x / DESIGN_WIDTH) * width;
  const linePath = `M ${SAMPLE_POINTS.map(([x, y]) => `${scaleX(x)} ${y}`).join(' L ')}`;
  const areaPath = `${linePath} L ${scaleX(SAMPLE_POINTS[SAMPLE_POINTS.length - 1][0])} ${SAMPLE_BASELINE} L ${scaleX(SAMPLE_POINTS[0][0])} ${SAMPLE_BASELINE} Z`;

  return (
    <View style={styles.container} onLayout={handleLayout} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {width > 0 && (
        <Svg width={width} height={CHART_HEIGHT}>
          <Defs>
            <LinearGradient id={SAMPLE_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={Colors.accent} stopOpacity={SAMPLE_AREA_OPACITY} />
              <Stop offset="1" stopColor={Colors.accent} stopOpacity={0} />
            </LinearGradient>
          </Defs>

          {SAMPLE_GRID_YS.map((y, i) => (
            <Line
              key={`grid-${i}`}
              x1={scaleX(SAMPLE_X_START)}
              y1={y}
              x2={scaleX(SAMPLE_X_END)}
              y2={y}
              stroke={i === 0 ? Colors.border : Colors.surfaceSubtle}
              strokeWidth={1}
              strokeDasharray={i === 0 ? undefined : GRID_DASH}
            />
          ))}

          <Path d={areaPath} fill={`url(#${SAMPLE_GRADIENT_ID})`} />
          <Path
            d={linePath}
            fill="none"
            stroke={Colors.accent}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={SAMPLE_LINE_DASH}
            opacity={SAMPLE_OPACITY}
          />
          {SAMPLE_POINTS.map(([x, y], i) => (
            <Circle
              key={`dot-${i}`}
              cx={scaleX(x)}
              cy={y}
              r={3}
              fill={Colors.surface}
              stroke={Colors.accent}
              strokeWidth={2}
              opacity={SAMPLE_OPACITY}
            />
          ))}
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: CHART_HEIGHT },
});
