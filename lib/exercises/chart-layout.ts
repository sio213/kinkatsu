import { computeChartScale, formatTickValue, type ChartScale } from '@/lib/exercises/chart-scale';
import { findBestIndex, type ProgressPoint, type ProgressUnit } from '@/lib/exercises/progress';

/**
 * 重量グラフの座標計算。SVGの描画そのもの（exercise-progress-chart.tsx）から切り離して
 * ここに置き、テストできるようにしている。
 */

/** SVG全体の高さ。上30pxはベストチップの帯、下22pxはX軸ラベル、残り158pxがプロット領域 */
export const CHART_HEIGHT = 210;
const PAD_TOP = 30;
const PAD_BOTTOM = 22;
const PAD_RIGHT = 6;
/** 左ガターの下限。ラベルが短くてもこれ以上は詰めない */
const MIN_GUTTER = 30;
/** 左右の内寄せ。両端の点のマーカーがプロットの縁で欠けないようにする */
const INSET = 6;

const TICK_FONT_SIZE = 9.5;
/** X軸に出す日付ラベルの数 */
const X_TICK_COUNT = 4;

/** マーカーを全点に描く下限の平均間隔。これ未満だと間引き、8px未満で消す */
const DOT_FULL_SPACING = 14;
const DOT_HALF_SPACING = 11;
const DOT_MIN_SPACING = 8;

/** ベストチップの寸法と、点との衝突判定に使うマーカーの実効半径 */
const BEST_CHIP_HEIGHT = 19;
const BEST_CHIP_PAD = 28;
const BEST_CHIP_FONT_SIZE = 10.5;
const COLLISION_RADIUS = 11;

const DAY_MS = 86_400_000;
/** X軸ラベルに年を含めるかどうかの境目。1年以上にまたがるなら月日だけでは年が分からない */
const YEAR_LABEL_SPAN_MS = 365 * DAY_MS;

/**
 * 文字列の描画幅の見積もり。全角を1.0em・半角を0.58emとして数える。
 * 左ガターの幅とベストチップの幅を決めるのに使う（実測できないSVGテキストの近似）
 */
export function estimateTextWidth(text: string, fontSize: number): number {
  let em = 0;
  for (const ch of text) em += /[\x20-\x7E]/.test(ch) ? 0.58 : 1;
  return em * fontSize;
}

export type ChartPoint = {
  x: number;
  y: number;
  point: ProgressPoint;
  index: number;
};

export type ChartLayout = {
  width: number;
  height: number;
  /** 表示中の期間が1年以上にまたがるか。月日だけでは年が分からないのでラベルに年を足す */
  withYear: boolean;
  /** プロット領域の上下端（Y座標） */
  top: number;
  bottom: number;
  /** プロット領域の左右端（X座標） */
  left: number;
  right: number;
  scale: ChartScale;
  /** 目盛りのY座標。scale.ticksと同じ順（下から上） */
  tickYs: number[];
  points: ChartPoint[];
  /** マーカーを描く点の添字。密なときは間引かれ、8px未満では空になる */
  markerIndices: number[];
  /** 自己ベストの点の添字。同値なら最初に到達した回。点が無ければnull */
  bestIndex: number | null;
  /** X軸ラベル（位置と文字列） */
  xTicks: { x: number; label: string; anchor: 'start' | 'middle' | 'end' }[];
};

/**
 * マーカーを描く点の添字。線は常に全点で描くが、マーカーは平均間隔に応じて間引く。
 * タップは常に最近傍スナップなので、マーカーが消えても操作性は落ちない
 */
export function pickMarkerIndices(count: number, spacing: number): number[] {
  if (count === 0) return [];
  if (spacing < DOT_MIN_SPACING) return [];
  const every = spacing >= DOT_FULL_SPACING ? 1 : spacing >= DOT_HALF_SPACING ? 2 : 3;
  const indices: number[] = [];
  for (let i = 0; i < count; i++) {
    if (i % every === 0) indices.push(i);
  }
  return indices;
}

function formatDateLabel(timestamp: number, withYear: boolean): string {
  const d = new Date(timestamp);
  return withYear ? `${d.getFullYear()}/${d.getMonth() + 1}` : `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 左ガターの幅。実際に描くラベル（丸め後の目盛り値＋単位）の実測幅から決める */
function gutterWidth(scale: ChartScale, unit: ProgressUnit): number {
  let max = 0;
  const lastLabeled = scale.labelIndices[scale.labelIndices.length - 1];
  for (const i of scale.labelIndices) {
    const text = formatTickValue(scale.ticks[i]) + (i === lastLabeled ? ` ${unit.label}` : '');
    max = Math.max(max, estimateTextWidth(text, TICK_FONT_SIZE));
  }
  return Math.max(MIN_GUTTER, Math.ceil(max) + 8);
}

export function computeChartLayout(
  points: ProgressPoint[],
  unit: ProgressUnit,
  width: number,
): ChartLayout {
  const scale = computeChartScale(points.map((p) => p.value), unit);
  const top = PAD_TOP;
  const bottom = CHART_HEIGHT - PAD_BOTTOM;
  const left = gutterWidth(scale, unit);
  const right = width - PAD_RIGHT;

  const toY = (value: number) =>
    bottom - ((value - scale.min) / (scale.max - scale.min)) * (bottom - top);

  const innerWidth = Math.max(right - left - INSET * 2, 1);
  const first = points[0]?.dateKey ?? 0;
  const last = points[points.length - 1]?.dateKey ?? 0;
  const span = last - first;
  // 点が1つだけ、または全点が同じ日なら水平中央に置く（X軸ラベルも中央揃えになる）
  const toX = (dateKey: number) =>
    points.length < 2 || span === 0
      ? left + INSET + innerWidth / 2
      : left + INSET + (innerWidth * (dateKey - first)) / span;

  const chartPoints: ChartPoint[] = points.map((point, index) => ({
    x: toX(point.dateKey),
    y: toY(point.value),
    point,
    index,
  }));

  const spacing = innerWidth / Math.max(points.length - 1, 1);
  const withYear = span >= YEAR_LABEL_SPAN_MS;

  return {
    width,
    height: CHART_HEIGHT,
    withYear,
    top,
    bottom,
    left,
    right,
    scale,
    tickYs: scale.ticks.map(toY),
    points: chartPoints,
    markerIndices: pickMarkerIndices(points.length, spacing),
    bestIndex: findBestIndex(points),
    xTicks: pickXTickIndices(points.length).map((i) => ({
      x: chartPoints[i].x,
      label: formatDateLabel(points[i].dateKey, withYear),
      anchor: points.length < 2 ? 'middle' : i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle',
    })),
  };
}

/** X軸ラベルを出す点の添字。等間隔に4つ取り、点が少ないときは重複を落とす */
export function pickXTickIndices(count: number): number[] {
  if (count === 0) return [];
  const indices: number[] = [];
  for (let k = 0; k < X_TICK_COUNT; k++) {
    const i = Math.round(((count - 1) * k) / (X_TICK_COUNT - 1));
    if (!indices.includes(i)) indices.push(i);
  }
  return indices;
}

export type BestChipBox = { x: number; y: number; width: number; height: number; label: string };

/**
 * ベストチップ（「★ ベスト 75kg」）の置き場所。
 *
 * 基本は右肩上がりのグラフを想定してプロット内の左上に置くが、右肩下がりだとそこに線と点が
 * 通るため、点と重なるなら右上へ、それも塞がっていれば点も数字も無い段を探して逃がす。
 * 衝突判定にはマーカーの実効半径（11px）を含める。
 */
export function placeBestChip(layout: ChartLayout, unit: ProgressUnit): BestChipBox | null {
  if (layout.bestIndex == null) return null;
  const best = layout.points[layout.bestIndex].point.value;
  const label = `ベスト ${formatTickValue(best)}${unit.label}`;
  const width = Math.round(estimateTextWidth(label, BEST_CHIP_FONT_SIZE) + BEST_CHIP_PAD);
  const height = BEST_CHIP_HEIGHT;

  const overlaps = (x: number, y: number) =>
    layout.points.filter(
      (p) =>
        p.x >= x - COLLISION_RADIUS &&
        p.x <= x + width + COLLISION_RADIUS &&
        p.y >= y - COLLISION_RADIUS &&
        p.y <= y + height + COLLISION_RADIUS,
    ).length;

  // 既定は最上段のグリッド線のすぐ下
  const topRow = layout.tickYs[layout.tickYs.length - 1] + 4;
  const leftX = layout.left + 6;
  const rightX = layout.right - 6 - width;

  if (overlaps(leftX, topRow) === 0) return { x: leftX, y: topRow, width, height, label };
  if (overlaps(rightX, topRow) === 0) return { x: rightX, y: topRow, width, height, label };

  // 左右とも塞がっていれば、上の段から順に「点が最も少ない段」を探す
  let bestBox = { x: leftX, y: topRow, score: overlaps(leftX, topRow) };
  for (const x of [leftX, rightX]) {
    for (let k = layout.tickYs.length - 1; k >= 1; k--) {
      const y = layout.tickYs[k] + 4;
      if (y + height > layout.bottom - 2) continue;
      const score = overlaps(x, y);
      if (score < bestBox.score) bestBox = { x, y, score };
      if (bestBox.score === 0) break;
    }
    if (bestBox.score === 0) break;
  }

  return { x: bestBox.x, y: bestBox.y, width, height, label };
}

/**
 * タッチ位置のX座標から最も近い点の添字を返す。点そのものを狙わせず、指を置いたあたりの
 * 一番近い記録にスナップさせるための判定（マーカーが間引かれて消えていても効く）
 */
export function findNearestPointIndex(layout: ChartLayout, x: number): number | null {
  if (layout.points.length === 0) return null;
  let nearest = 0;
  let minDistance = Infinity;
  for (const p of layout.points) {
    const distance = Math.abs(p.x - x);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = p.index;
    }
  }
  return nearest;
}

/** ツールチップ1行目の日付。全期間表示のように1年以上にまたがる場合だけ年を含める */
export function formatTooltipDate(dateKey: number, withYear: boolean): string {
  const d = new Date(dateKey);
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  return withYear ? `${d.getFullYear()}/${md}` : md;
}

const TOOLTIP_HEIGHT = 36;
const TOOLTIP_DATE_FONT_SIZE = 9.5;
const TOOLTIP_VALUE_FONT_SIZE = 13;
const TOOLTIP_SUB_FONT_SIZE = 9.5;
/** 点とチップの間隔。上に出す場合と下に逃がす場合で少し違う */
const TOOLTIP_GAP_ABOVE = 9;
const TOOLTIP_GAP_BELOW = 10;

export type TooltipBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  /** 値の行（値＋単位＋補助情報）を中央揃えで並べ始めるX座標 */
  valueX: number;
  dateY: number;
  valueY: number;
};

/**
 * 選択中の点に出すツールチップの位置と大きさ。2行・中央揃えで、点の上に置くのが基本。
 *
 * 左右はプロット内に収まるようクランプする。ベストチップと重なる場合は、上のまま横
 * （右→左）に逃がし、横に入らない場合のみ点の下に出す（デザイン案「要相談3」）。
 */
export function placeTooltip(
  layout: ChartLayout,
  index: number,
  texts: { date: string; value: string; unit: string; aux: string | null },
  bestChip: BestChipBox | null,
): TooltipBox | null {
  const point = layout.points[index];
  if (!point) return null;

  const valueWidth = estimateTextWidth(texts.value, TOOLTIP_VALUE_FONT_SIZE);
  const unitWidth = estimateTextWidth(texts.unit, TOOLTIP_SUB_FONT_SIZE);
  const auxWidth = texts.aux ? estimateTextWidth(texts.aux, TOOLTIP_SUB_FONT_SIZE) : 0;
  const dateWidth = estimateTextWidth(texts.date, TOOLTIP_DATE_FONT_SIZE);

  const valueRowWidth = valueWidth + unitWidth + (texts.aux ? auxWidth + 3 : 0);
  const width = Math.round(Math.max(valueRowWidth + 7, dateWidth) + 22);
  const height = TOOLTIP_HEIGHT;

  let x = Math.min(Math.max(point.x - width / 2, layout.left + 2), layout.right - width - 2);
  let y = point.y - height - TOOLTIP_GAP_ABOVE;

  if (bestChip && overlapsChip(x, y, width, height, bestChip)) {
    const rightX = bestChip.x + bestChip.width + 6;
    const leftX = bestChip.x - 6 - width;
    if (rightX + width <= layout.right - 2) x = rightX;
    else if (leftX >= layout.left + 2) x = leftX;
    else y = Math.min(point.y + TOOLTIP_GAP_BELOW, layout.bottom - height - 2);
  }

  return {
    x,
    y,
    width,
    height,
    valueX: x + width / 2 - (valueRowWidth + 1.5) / 2,
    dateY: y + 14,
    valueY: y + 28,
  };
}

function overlapsChip(x: number, y: number, width: number, height: number, chip: BestChipBox): boolean {
  return (
    x < chip.x + chip.width + 4 &&
    x + width > chip.x - 4 &&
    y < chip.y + chip.height + 4 &&
    y + height > chip.y - 4
  );
}

/** 星形のポリゴン点列（外接半径R・内接半径r）。DesignIconのstarはSVGパスなので座標指定ができない */
export function starPoints(cx: number, cy: number, outer: number, inner: number): string {
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 ? inner : outer;
    points.push(`${(cx + Math.cos(angle) * radius).toFixed(2)},${(cy + Math.sin(angle) * radius).toFixed(2)}`);
  }
  return points.join(' ');
}
