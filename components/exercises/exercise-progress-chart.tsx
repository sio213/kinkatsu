import { Colors } from '@/constants/theme';
import {
  CHART_HEIGHT,
  computeChartLayout,
  placeBestChip,
  starPoints,
  type ChartLayout,
} from '@/lib/exercises/chart-layout';
import { formatTickValue } from '@/lib/exercises/chart-scale';
import type { ProgressPoint, ProgressUnit } from '@/lib/exercises/progress';
import { useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Line,
  Path,
  Polygon,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

const AREA_GRADIENT_ID = 'progressChartArea';

const LINE_WIDTH = 2.4;
const AREA_OPACITY = 0.22;
const DOT_RADIUS = 3;
const DOT_STROKE_WIDTH = 2;
const BEST_DOT_RADIUS = 4;
const TICK_FONT_SIZE = 9.5;
const BEST_CHIP_FONT_SIZE = 10.5;
/** 中間のグリッドは破線、下端の軸線だけ実線にする */
const GRID_DASH = '3 4';

type Props = {
  points: ProgressPoint[];
  unit: ProgressUnit;
};

function linePath(layout: ChartLayout): string {
  return `M ${layout.points.map((p) => `${p.x} ${p.y}`).join(' L ')}`;
}

function areaPath(layout: ChartLayout): string {
  const first = layout.points[0];
  const last = layout.points[layout.points.length - 1];
  return `${linePath(layout)} L ${last.x} ${layout.bottom} L ${first.x} ${layout.bottom} Z`;
}

/**
 * 種目詳細「記録」タブの重量グラフ。横軸は実日付なので、記録が空いた期間はそのまま余白として
 * 見える（サボった期間が分かる）。縦軸のスケールは lib/exercises/chart-scale.ts、
 * 座標・マーカーの間引き・ベストチップの配置は lib/exercises/chart-layout.ts に分けてある。
 *
 * 幅は親から測って渡すのではなく onLayout で自分で測る。種目詳細の本文パディングや将来の
 * 画面幅の違いをこのコンポーネントが知らなくて済むようにするため。
 */
export function ExerciseProgressChart({ points, unit }: Props) {
  const [width, setWidth] = useState(0);

  const layout = useMemo(
    () => (width > 0 ? computeChartLayout(points, unit, width) : null),
    [points, unit, width],
  );
  const bestChip = useMemo(() => (layout ? placeBestChip(layout, unit) : null), [layout, unit]);

  const handleLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  return (
    <View style={styles.container} onLayout={handleLayout}>
      {layout && (
        <Svg width={layout.width} height={layout.height}>
          <Defs>
            <LinearGradient id={AREA_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={Colors.accent} stopOpacity={AREA_OPACITY} />
              <Stop offset="1" stopColor={Colors.accent} stopOpacity={0} />
            </LinearGradient>
          </Defs>

          {layout.tickYs.map((y, i) => (
            <Line
              key={`grid-${i}`}
              x1={layout.left}
              y1={y}
              x2={layout.right}
              y2={y}
              stroke={i === 0 ? Colors.border : Colors.surfaceSubtle}
              strokeWidth={1}
              strokeDasharray={i === 0 ? undefined : GRID_DASH}
            />
          ))}

          {layout.scale.labelIndices.map((tickIndex, order) => {
            const isLast = order === layout.scale.labelIndices.length - 1;
            return (
              <SvgText
                key={`ylabel-${tickIndex}`}
                x={layout.left - 6}
                y={layout.tickYs[tickIndex] + 3.5}
                textAnchor="end"
                fontSize={TICK_FONT_SIZE}
                fill={Colors.textSecondary}
              >
                {/* 単位は最上段のラベルにだけ付ける（全段に付けると数字が読み取りにくくなる） */}
                {formatTickValue(layout.scale.ticks[tickIndex]) + (isLast ? ` ${unit.label}` : '')}
              </SvgText>
            );
          })}

          {layout.points.length > 1 && (
            <>
              <Path d={areaPath(layout)} fill={`url(#${AREA_GRADIENT_ID})`} />
              <Path
                d={linePath(layout)}
                fill="none"
                stroke={Colors.accent}
                strokeWidth={LINE_WIDTH}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}

          {layout.markerIndices.map((i) =>
            i === layout.bestIndex ? null : (
              <Circle
                key={`dot-${i}`}
                cx={layout.points[i].x}
                cy={layout.points[i].y}
                r={DOT_RADIUS}
                fill={Colors.surface}
                stroke={Colors.accent}
                strokeWidth={DOT_STROKE_WIDTH}
              />
            ),
          )}

          {/* ベストの点はマーカーの間引きに関係なく必ず描く（アンバーの塗り・白枠なし） */}
          {layout.bestIndex != null && (
            <Circle
              cx={layout.points[layout.bestIndex].x}
              cy={layout.points[layout.bestIndex].y}
              r={BEST_DOT_RADIUS}
              fill={Colors.chartBest}
            />
          )}

          {bestChip && (
            <>
              <Rect
                x={bestChip.x}
                y={bestChip.y}
                width={bestChip.width}
                height={bestChip.height}
                rx={6}
                fill={Colors.surface}
                fillOpacity={0.94}
                stroke={Colors.warningBorder}
                strokeWidth={1}
              />
              <Polygon
                points={starPoints(bestChip.x + 13, bestChip.y + bestChip.height / 2, 5.2, 2.3)}
                fill={Colors.chartBest}
              />
              <SvgText
                x={bestChip.x + 22}
                y={bestChip.y + bestChip.height / 2 + 3.6}
                fontSize={BEST_CHIP_FONT_SIZE}
                fontWeight="700"
                fill={Colors.chartBestText}
              >
                {bestChip.label}
              </SvgText>
            </>
          )}

          {layout.xTicks.map((tick, i) => (
            <SvgText
              key={`xlabel-${i}`}
              x={tick.x}
              y={layout.height - 5}
              textAnchor={tick.anchor}
              fontSize={TICK_FONT_SIZE}
              fill={Colors.textSecondary}
            >
              {tick.label}
            </SvgText>
          ))}
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // 幅を測る前後で高さが変わらないようにしておく（測定後にレイアウトが跳ねない）
  container: { height: CHART_HEIGHT },
});
