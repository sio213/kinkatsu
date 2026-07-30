import {
  computeChartScale,
  formatTickLabel,
  formatTickValue,
  type ChartScale,
} from '@/lib/exercises/chart-scale';
import type { ProgressPoint, ProgressUnit } from '@/lib/exercises/progress';

/**
 * 重量グラフの座標計算。SVGの描画そのもの（exercise-progress-chart.tsx）から切り離して
 * ここに置き、テストできるようにしている。
 */

/**
 * SVG全体の高さ。上24pxは最上段の点に出すツールチップの逃げ場、下22pxはX軸ラベル、
 * 残り164pxがプロット領域。ベストチップ（実寸19px）は最上段のグリッド線の「下」に置くので、
 * 上の帯はチップぶんを取っておく必要が無い（30pxでは期間チップとの間が空きすぎていた）
 */
export const CHART_HEIGHT = 210;
const PAD_TOP = 24;
const PAD_BOTTOM = 22;
const PAD_RIGHT = 6;
/** 左ガターの下限。ラベルが短くてもこれ以上は詰めない */
const MIN_GUTTER = 30;
/** 左右の内寄せ。両端の点のマーカーがプロットの縁で欠けないようにする */
const INSET = 6;

const TICK_FONT_SIZE = 9.5;
/** X軸に出す日付ラベルの数（重なる場合はここから間引かれる） */
const X_TICK_COUNT = 4;
/** X軸ラベル同士に最低限空ける隙間。これを確保できない中間ラベルは落とす */
const X_LABEL_GAP = 8;

/** マーカーを全点に描く下限の平均間隔。これ未満だと間引き、8px未満で消す */
const DOT_FULL_SPACING = 14;
const DOT_HALF_SPACING = 11;
const DOT_MIN_SPACING = 8;

/** ベストチップの寸法と、点との衝突判定に使うマーカーの実効半径 */
const BEST_CHIP_HEIGHT = 19;
const BEST_CHIP_PAD = 28;
/** チップの文字サイズ。幅の見積もりと実際の描画（exercise-progress-chart.tsx）がズレないよう共有する */
export const BEST_CHIP_FONT_SIZE = 10.5;
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

export type XTick = { x: number; label: string; anchor: 'start' | 'middle' | 'end' };

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
  /**
   * 全期間の自己ベストの点。期間チップで絞っても変わらない。表示期間の外にある場合も
   * ここには入る（チップは値を出し続け、点だけが描かれない）
   */
  personalBest: ProgressPoint | null;
  /**
   * 自己ベストの点の、表示中の点列における添字。自己ベストが表示期間の外にあるときはnull
   * （アンバーの点は描けない。値は personalBest から読む）
   */
  bestIndex: number | null;
  /** X軸ラベル（位置と文字列） */
  xTicks: XTick[];
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
    const text = formatTickLabel(scale.ticks[i], unit, i === lastLabeled);
    max = Math.max(max, estimateTextWidth(text, TICK_FONT_SIZE));
  }
  return Math.max(MIN_GUTTER, Math.ceil(max) + 8);
}

export function computeChartLayout(
  points: ProgressPoint[],
  unit: ProgressUnit,
  width: number,
  /**
   * 全期間の自己ベスト（findPersonalBest の結果）。期間で絞った points から求めては**いけない**——
   * 1ヶ月表示のたびにその月の最大が「ベスト」になり、内訳カード・過去の記録一覧のバッジと
   * 食い違うため（アンバーは全期間の自己ベスト専用の色）
   */
  personalBest: ProgressPoint | null,
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

  // 自己ベストの日が表示期間に含まれていなければ描く点が無い。チップだけが値を出し続ける
  const bestAt = personalBest == null ? -1 : points.findIndex((p) => p.dateKey === personalBest.dateKey);
  const bestIndex = bestAt < 0 ? null : bestAt;

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
    personalBest,
    bestIndex,
    xTicks: pickXTicks(chartPoints, withYear),
  };
}

/** ラベルが実際に占める横方向の区間。アンカーによって基準点の左右どちらに伸びるかが変わる */
type PlacedTick = { tick: XTick; start: number; end: number };

function placeXTick(points: ChartPoint[], index: number, withYear: boolean): PlacedTick {
  const x = points[index].x;
  const label = formatDateLabel(points[index].point.dateKey, withYear);
  const anchor: XTick['anchor'] =
    index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle';
  const width = estimateTextWidth(label, TICK_FONT_SIZE);
  const start = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2;
  return { tick: { x, label, anchor }, start, end: start + width };
}

/**
 * X軸に出す日付ラベル。
 *
 * 件数ではなくX座標を等分し、その目標位置に最も近い記録を選ぶ。件数で等分すると、記録が
 * 偏っている期間（例: 3日連続で記録した後に3週間空く）で選ばれた点のX座標が数pxに密集し、
 * ラベル同士が重なってしまうため。
 *
 * それでも近すぎる場合は、文字幅の見積もりから重なる中間ラベルを落とす。期間の始まりと
 * 終わりが分かるように両端のラベルは必ず残す（両端は常にプロットの左右端にあり重ならない）。
 */
function pickXTicks(points: ChartPoint[], withYear: boolean): XTick[] {
  if (points.length === 0) return [];

  const leftX = points[0].x;
  const rightX = points[points.length - 1].x;
  // 点が1つだけ、または全点が同じ日なら横に並ばないので中央に1つだけ出す
  if (leftX === rightX) {
    return [{ ...placeXTick(points, 0, withYear).tick, anchor: 'middle' }];
  }

  const candidates: number[] = [];
  for (let k = 0; k < X_TICK_COUNT; k++) {
    const targetX = leftX + ((rightX - leftX) * k) / (X_TICK_COUNT - 1);
    const index = nearestIndexByX(points, targetX);
    if (!candidates.includes(index)) candidates.push(index);
  }

  const placed = candidates.map((index) => placeXTick(points, index, withYear));
  const last = placed[placed.length - 1];
  const kept = [placed[0]];
  for (const tick of placed.slice(1, -1)) {
    const prev = kept[kept.length - 1];
    if (tick.start - prev.end >= X_LABEL_GAP && last.start - tick.end >= X_LABEL_GAP) {
      kept.push(tick);
    }
  }
  kept.push(last);
  return kept.map((p) => p.tick);
}

/**
 * グラフ上でハイライトする点の意味。
 *
 * `personal-best` … 実測の自己ベスト。アンバーの点＋★のチップ（最大○○指標のときだけ）
 * `metric-max` … 選択中の指標の最高値。色も★も持たない。アンバーと★は自己ベスト専用
 */
export type HighlightKind = 'personal-best' | 'metric-max';

export type BestChipBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  /** 本体（「ベスト 80kg」）。太字のアンバーで描く */
  label: string;
  /** 自己ベストが表示期間の外にあるときだけの補足（「・4/12」）。本体より弱く描く。無ければ空文字 */
  date: string;
};

/**
 * 自己ベストが表示期間の外にあるとき、チップに添える日付。
 *
 * 点が無い状態で値だけ浮いていると「今どこかにこの値の点があるはず」と誤読されるため、
 * 「過去のある1日の記録」だと分かるように日付を出す（デザイン相談での採用案）。
 * 表示中の最新の記録と年が違えば年も出す——「4/12」だけでは去年のベストと区別できないため。
 */
function outOfRangeDate(layout: ChartLayout, best: ProgressPoint): string {
  const latest = layout.points[layout.points.length - 1];
  const withYear =
    layout.withYear ||
    (latest != null && new Date(best.dateKey).getFullYear() !== new Date(latest.point.dateKey).getFullYear());
  return formatTooltipDate(best.dateKey, withYear);
}

/**
 * ベストチップ（「★ ベスト 75kg」）の置き場所。値は**全期間の自己ベスト**で、期間チップを
 * 切り替えても書き換わらない（アンバー＝自己ベストを画面全体で1つの意味に揃えるため）。
 * 自己ベストの日が表示期間の外にあるときは「★ ベスト 80kg・4/12」と日付を添える。
 *
 * 基本は右肩上がりのグラフを想定してプロット内の左上に置くが、右肩下がりだとそこに線と点が
 * 通るため、点と重なるなら右上へ、それも塞がっていれば点も数字も無い段を探して逃がす。
 * 衝突判定にはマーカーの実効半径（11px）を含める。
 */
export function placeBestChip(
  layout: ChartLayout,
  unit: ProgressUnit,
  /**
   * ハイライトが「実測の自己ベスト」か「選択中の指標の最高値」か。アンバーと★は前者専用で、
   * 総重量・推定1RMでは「最高 1,860kg」と呼称を変える（FIX-10）
   */
  kind: HighlightKind = 'personal-best',
): BestChipBox | null {
  const best = layout.personalBest;
  // 点が1つも無いグラフにチップだけ浮かせない。personalBestは表示期間と無関係に非nullに
  // なり得るので、bestIndexのnullチェックではこの条件を兼ねられない
  if (best == null || layout.points.length === 0) return null;
  const label = `${kind === 'personal-best' ? 'ベスト' : '最高'} ${formatTickValue(best.value)}${unit.label}`;
  // 期間外の日付は本体の値より一段弱く描くので、幅の見積もりだけ合算して別々に返す
  const date = layout.bestIndex == null ? `・${outOfRangeDate(layout, best)}` : '';
  const width = Math.round(estimateTextWidth(label + date, BEST_CHIP_FONT_SIZE) + BEST_CHIP_PAD);
  const height = BEST_CHIP_HEIGHT;

  // 3桁＋小数の重量に年つきの日付が付くと（「ベスト 102.5kg・2025/10/6」）チップは
  // プロット幅の7割を超える。どの候補位置を選んでもプロットからはみ出さないよう最後に丸める
  const clampX = (x: number) => Math.max(layout.left + 2, Math.min(x, layout.right - width - 2));

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
  const leftX = clampX(layout.left + 6);
  const rightX = clampX(layout.right - 6 - width);

  if (overlaps(leftX, topRow) === 0) return { x: leftX, y: topRow, width, height, label, date };
  if (overlaps(rightX, topRow) === 0) return { x: rightX, y: topRow, width, height, label, date };

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

  return { x: bestBox.x, y: bestBox.y, width, height, label, date };
}

/**
 * タッチ位置のX座標から最も近い点の添字を返す。点そのものを狙わせず、指を置いたあたりの
 * 一番近い記録にスナップさせるための判定（マーカーが間引かれて消えていても効く）
 */
export function findNearestPointIndex(layout: ChartLayout, x: number): number | null {
  if (layout.points.length === 0) return null;
  return nearestIndexByX(layout.points, x);
}

function nearestIndexByX(points: ChartPoint[], x: number): number {
  let nearest = 0;
  let minDistance = Infinity;
  for (const p of points) {
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
/** SVGの上端からの最小マージン。これ以上は上げない（上げるとチップが切れる） */
const TOOLTIP_MIN_TOP = 2;

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
  // グリッド線が最大本数まで引かれると最上段の点はプロットの上端すれすれに来るため、
  // 点との間隔よりSVGに収まることを優先する（はみ出したぶんは描画されずに切れる）
  let y = Math.max(point.y - height - TOOLTIP_GAP_ABOVE, TOOLTIP_MIN_TOP);

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
