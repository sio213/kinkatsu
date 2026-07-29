import { Colors } from '@/constants/theme';
import {
  CHART_HEIGHT,
  computeChartLayout,
  findNearestPointIndex,
  formatTooltipDate,
  placeBestChip,
  placeTooltip,
  starPoints,
  type ChartLayout,
} from '@/lib/exercises/chart-layout';
import { formatTickValue } from '@/lib/exercises/chart-scale';
import { formatProgressAux, type ProgressPoint, type ProgressUnit } from '@/lib/exercises/progress';
import { useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
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
  TSpan,
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

/** 選択中の点の印。青のハローを下敷きにして、マーカー自体も一回り大きくする */
const SELECTED_HALO_RADIUS = 9.5;
const SELECTED_HALO_OPACITY = 0.15;
const SELECTED_DOT_RADIUS = 4.5;
const SELECTED_LINE_DASH = '3 3';
const SELECTED_LINE_OPACITY = 0.55;

const TOOLTIP_DATE_FONT_SIZE = 9.5;
const TOOLTIP_VALUE_FONT_SIZE = 13;
const TOOLTIP_SUB_FONT_SIZE = 9.5;

type Props = {
  points: ProgressPoint[];
  unit: ProgressUnit;
  /**
   * 全期間の自己ベスト（findPersonalBest の結果）。期間で絞ったpointsから求めた値を渡さないこと。
   * 表示期間の外にあってもチップは値を出し続け、アンバーの点だけが描かれなくなる
   */
  personalBest: ProgressPoint | null;
  /** 選択中の点。点が無いときはnull */
  selectedIndex: number | null;
  onSelect: (index: number) => void;
};

function linePath(layout: ChartLayout): string {
  return `M ${layout.points.map((p) => `${p.x} ${p.y}`).join(' L ')}`;
}

function areaPath(layout: ChartLayout): string {
  const first = layout.points[0];
  const last = layout.points[layout.points.length - 1];
  // 塗りの下端はプロットの下端(layout.bottom)ではなく最下段のグリッド線に合わせる。
  // 描画範囲は目盛りの外側へ少し広げてあるため、bottomまで塗ると軸線の下へはみ出して見える
  const baseline = layout.tickYs[0];
  return `${linePath(layout)} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`;
}

/**
 * 種目詳細「記録」タブの重量グラフ。横軸は実日付なので、記録が空いた期間はそのまま余白として
 * 見える（サボった期間が分かる）。縦軸のスケールは lib/exercises/chart-scale.ts、
 * 座標・マーカーの間引き・ベストチップの配置は lib/exercises/chart-layout.ts に分けてある。
 *
 * 幅は親から測って渡すのではなく onLayout で自分で測る。種目詳細の本文パディングや将来の
 * 画面幅の違いをこのコンポーネントが知らなくて済むようにするため。
 */
export function ExerciseProgressChart({ points, unit, personalBest, selectedIndex, onSelect }: Props) {
  const [width, setWidth] = useState(0);

  const layout = useMemo(
    () => (width > 0 ? computeChartLayout(points, unit, width, personalBest) : null),
    [points, unit, width, personalBest],
  );
  const bestChip = useMemo(() => (layout ? placeBestChip(layout, unit) : null), [layout, unit]);

  const selected = layout && selectedIndex != null ? layout.points[selectedIndex] : null;
  const tooltipTexts = useMemo(() => {
    if (!layout || !selected) return null;
    return {
      date: formatTooltipDate(selected.point.dateKey, layout.withYear),
      value: formatTickValue(selected.point.value),
      unit: unit.label,
      aux: formatProgressAux(unit, selected.point),
    };
  }, [layout, selected, unit]);
  const tooltip = useMemo(
    () =>
      layout && selected && tooltipTexts
        ? placeTooltip(layout, selected.index, tooltipTexts, bestChip)
        : null,
    [layout, selected, tooltipTexts, bestChip],
  );

  const handleLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  // 点そのものを狙わせず、指の位置のX座標から最も近い記録にスナップする
  const selectAt = (x: number) => {
    if (!layout) return;
    const nearest = findNearestPointIndex(layout, x);
    if (nearest != null) onSelect(nearest);
  };

  // タップに加えて、指を横に滑らせると選択が追従する。ScrollViewの中にあるので、
  // 横に8px動くまでPanを有効化せず、縦に12px動いたら失敗させてスクロールへ譲る
  // （こうしないとグラフの上から始めた縦方向のドラッグでスクロールできなくなる）。
  // コールバックはUIスレッドではなくJSスレッドで動かす（runOnJS)
  const gesture = useMemo(
    () =>
      Gesture.Race(
        Gesture.Tap()
          .runOnJS(true)
          .onEnd((event) => selectAt(event.x)),
        Gesture.Pan()
          .runOnJS(true)
          .activeOffsetX([-8, 8])
          .failOffsetY([-12, 12])
          // onBeginは指を置いた瞬間（＝まだ縦か横か決まっていない時点）に呼ばれるため使わない。
          // 使うと縦スクロールしただけで選択が変わってしまう。有効化された後のonStartから拾う
          .onStart((event) => selectAt(event.x))
          .onUpdate((event) => selectAt(event.x)),
      ),
    // selectAtはlayoutにだけ依存する（onSelectは親で毎回作られるため依存に含めない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout],
  );

  // 視覚ではアンバーの点で分かる「自己ベスト」を読み上げにも足す（デザインレビュー指摘）
  const selectionLabel =
    tooltipTexts &&
    [
      tooltipTexts.date,
      `${tooltipTexts.value}${tooltipTexts.unit}`,
      tooltipTexts.aux,
      selectedIndex != null && selectedIndex === layout?.bestIndex ? '自己ベスト' : null,
    ]
      .filter(Boolean)
      .join('、');

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={styles.container}
        onLayout={handleLayout}
        accessibilityRole="image"
        accessibilityLabel={
          selectionLabel ? `記録の推移グラフ。選択中: ${selectionLabel}` : '記録の推移グラフ'
        }
        accessibilityHint="グラフを押すか横になぞると、その位置に一番近い記録を選びます"
      >
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

            {/* 選択の印。縦の破線はプロットの上端まで通し、どの位置を見ているかを一目で分かるようにする */}
            {selected && (
              <>
                <Line
                  x1={selected.x}
                  y1={layout.top - 3}
                  x2={selected.x}
                  y2={layout.bottom}
                  stroke={Colors.accent}
                  strokeWidth={1}
                  strokeDasharray={SELECTED_LINE_DASH}
                  opacity={SELECTED_LINE_OPACITY}
                />
                <Circle
                  cx={selected.x}
                  cy={selected.y}
                  r={SELECTED_HALO_RADIUS}
                  fill={Colors.accent}
                  opacity={SELECTED_HALO_OPACITY}
                />
                {/* ベストの点が選択されている場合は、この下でアンバーのマーカーを重ねて描く */}
                {selected.index !== layout.bestIndex && (
                  <Circle
                    cx={selected.x}
                    cy={selected.y}
                    r={SELECTED_DOT_RADIUS}
                    fill={Colors.accent}
                    stroke={Colors.surface}
                    strokeWidth={2}
                  />
                )}
              </>
            )}

            {/* ベストの点はマーカーの間引きに関係なく必ず描く（アンバーの塗り）。
                選択中は一回り大きくして白枠を付け、青のハローの上に乗せる */}
            {layout.bestIndex != null && (
              <Circle
                cx={layout.points[layout.bestIndex].x}
                cy={layout.points[layout.bestIndex].y}
                r={selectedIndex === layout.bestIndex ? SELECTED_DOT_RADIUS : BEST_DOT_RADIUS}
                fill={Colors.chartBest}
                stroke={selectedIndex === layout.bestIndex ? Colors.surface : undefined}
                strokeWidth={selectedIndex === layout.bestIndex ? 2 : 0}
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

            {tooltip && tooltipTexts && (
              <>
                <Rect
                  x={tooltip.x}
                  y={tooltip.y}
                  width={tooltip.width}
                  height={tooltip.height}
                  rx={6}
                  fill={Colors.surface}
                  stroke={Colors.border}
                  strokeWidth={1}
                />
                <SvgText
                  x={tooltip.x + tooltip.width / 2}
                  y={tooltip.dateY}
                  textAnchor="middle"
                  fontSize={TOOLTIP_DATE_FONT_SIZE}
                  fill={Colors.textSecondary}
                >
                  {tooltipTexts.date}
                </SvgText>
                {/* 値・単位・補助情報はフォントサイズが違うので、1つのテキストにせず横に並べる */}
                <SvgText
                  x={tooltip.valueX}
                  y={tooltip.valueY}
                  fontSize={TOOLTIP_VALUE_FONT_SIZE}
                  fontWeight="700"
                  fill={Colors.textPrimary}
                >
                  {tooltipTexts.value}
                  <TSpan fontSize={TOOLTIP_SUB_FONT_SIZE} fontWeight="600" fill={Colors.textMuted}>
                    {tooltipTexts.unit}
                    {tooltipTexts.aux ? ` ${tooltipTexts.aux}` : ''}
                  </TSpan>
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
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  // 幅を測る前後で高さが変わらないようにしておく（測定後にレイアウトが跳ねない）
  container: { height: CHART_HEIGHT },
});
