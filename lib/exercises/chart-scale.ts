import type { ProgressUnit } from '@/lib/exercises/progress';

/**
 * 重量グラフの縦軸（目盛りと描画範囲）を決める。
 *
 * 方針は「0起点を使わない自動スケール＋単位ごとの刻みできりのいい値へ丸め＋上に1段の余裕」。
 * 0起点だと 60→75kg の変化が画面のごく一部に潰れ、逆に素の自動スケールだと 72.5→75kg の
 * 2.5kg差が急成長のように描かれてしまうため、その中間を取っている（デザイン案「要相談1」）。
 */

// 刻みの候補。重量・距離は2.5から、回数・秒・分は整数のみ
const DECIMAL_LADDER = [2.5, 5, 10, 20, 25, 50, 100];
const INTEGER_LADDER = [1, 2, 5, 10, 20, 50, 100];

/** グリッド線の上限。これを超えるようなら刻みを1段上げる */
const MAX_GRID_LINES = 6;
/**
 * 刻みを上げるかの見積もりに足す余裕の段数。実際に足すのは上端の1段だけだが、
 * 最小レンジの保険で下にも伸びうるので、判定は2段ぶん見込んだ厳しめの数で行う
 */
const PAD_LINES = 2;
/** これ以下の間隔しか取れないなら刻みが粗すぎるとみなし、1段下げられないか試す */
const MIN_INTERVALS = 3;
/** 点が上端・下端の線に接しないよう、描画範囲を目盛り1段のこの割合だけ外へ広げる */
const RANGE_PAD_RATIO = 0.3;
/**
 * 上端がデータの最大値にこれだけ近ければ、線に張り付いて見えるので1段足す。
 * 最上段に来た点（白フチつき）とベストチップの置き場所として必要
 */
const UPPER_PAD_RATIO = 0.35;
/** 素の自動スケールに戻すときの上下の余白（データ幅に対する割合） */
const RAW_PAD_RATIO = 0.15;
/** 丸め後の窓がデータ幅＋刻みこの段数を超えるなら、丸めをやめて素の自動スケールに戻す */
const WASTEFUL_STEPS = 2;

const EPS = 1e-9;

export type ChartScale = {
  /** グリッド線の値。下から上へ昇順 */
  ticks: number[];
  /** 描画範囲。ticksの外側に少し広げてある */
  min: number;
  max: number;
  step: number;
  /** ラベルを描くticksの添字。線が5本以上なら1つおきに間引く */
  labelIndices: number[];
};

/**
 * 目盛りの窓。下端はデータの最小値を含むきりのいい目盛りでそのまま止め、余裕は上端だけに足す。
 *
 * 下にも1段足すと、伸びが2.5〜5kgしかない種目（72.5→75kgなど）で窓の下半分が丸ごと
 * 死んで線の傾きが読めなくなる。下は面で塗るぶん、詰まっていても窮屈には見えない。
 */
function roundedWindow(
  lo: number,
  hi: number,
  step: number,
  minRange: number,
): { lower: number; upper: number } {
  let lower = Math.floor(lo / step) * step;
  let upper = Math.ceil(hi / step) * step;
  if (upper <= hi + step * UPPER_PAD_RATIO) upper += step;
  // 全点が同じ値・記録1件のように窓が潰れるときだけ、最小レンジぶんまで下へ広げる保険。
  // わずかな差を画面いっぱいに拡大して見せないため。0以下に落ちるなら広げない
  while (upper - lower < minRange - EPS && lower - step > 0) lower -= step;
  return { lower, upper };
}

// 刻みを上げるかどうかの判定に使う、余裕ぶんを込みにした線の本数の見積もり。
// 実際の余裕は条件付きでしか足されないが、判定は常に足す前提の厳しめの数で行う
// （そうしないと 30→102.5kg のような広いレンジで刻みが上がりきらない）
function estimateLineCount(lo: number, hi: number, step: number): number {
  const span = Math.ceil(hi / step) * step - Math.floor(lo / step) * step;
  return Math.round(span / step) + PAD_LINES + 1;
}

function pickStep(lo: number, hi: number, unit: ProgressUnit): number {
  const ladder = unit.integerOnly ? INTEGER_LADDER : DECIMAL_LADDER;
  let step = ladder.find((v) => v >= unit.step) ?? unit.step;

  // 線が増えすぎるなら刻みを上げる。ただし下端が0以下に落ちる刻みは選ばない（0起点にしない）
  while (estimateLineCount(lo, hi, step) > MAX_GRID_LINES) {
    const next = ladder.find((v) => v > step);
    if (next == null) break;
    if (lo > 0 && Math.floor(lo / next) * next <= 0) break;
    step = next;
  }

  // 逆に段が粗すぎるときは1段下げる。ダンベル種目のような軽い重量（7.5〜12.5kg）で
  // 5kg刻みのままだと線が3本しか引けず推移が読めないため（デザイン案Y-10の積み残し）。
  // 最小レンジを割る場合は下げない——わずかな差を拡大して見せないことの方が優先
  const current = roundedWindow(lo, hi, step, unit.minRange);
  if (Math.round((current.upper - current.lower) / step) <= MIN_INTERVALS - 1) {
    const smaller = [...ladder].reverse().find((v) => v < step);
    if (smaller != null) {
      const candidate = roundedWindow(lo, hi, smaller, unit.minRange);
      // 0付近で最小レンジまで下へ広げきれなかった刻みは選ばない
      const spanEnough = candidate.upper - candidate.lower >= unit.minRange - EPS;
      // 下げるのは窓が今より下へ広がらずに済むときだけ。広がるなら、線が増える代わりに
      // データの占める高さが押し縮められて逆効果になる（72.5〜75kgで2.5kg刻みにするケース）
      const noWider = candidate.lower >= current.lower - EPS;
      const fits = estimateLineCount(lo, hi, smaller) <= MAX_GRID_LINES;
      const positive = lo <= 0 || candidate.lower > 0;
      if (spanEnough && noWider && fits && positive) return smaller;
    }
  }

  return step;
}

// 丸めをやめて素の自動スケールに戻すときの3本のグリッド。目盛りはきりのいい値にならない
function rawScale(lo: number, hi: number, unit: ProgressUnit): ChartScale {
  const range = Math.max(hi - lo, unit.minRange);
  const min = lo - range * RAW_PAD_RATIO;
  const max = hi + range * RAW_PAD_RATIO;
  const ticks = [min, (min + max) / 2, max];
  return { ticks, min, max, step: (max - min) / 2, labelIndices: [0, 1, 2] };
}

/**
 * ラベルを描く目盛りの添字。線が5本以上のときだけ1つおきに間引く
 * （3〜4本ならすべての段に数字が出る）。狭い横幅に数字が詰まって読めなくなるのを防ぐ
 */
export function pickLabelIndices(tickCount: number): number[] {
  const all = Array.from({ length: tickCount }, (_, i) => i);
  return tickCount >= 5 ? all.filter((i) => i % 2 === 0) : all;
}

export function computeChartScale(values: number[], unit: ProgressUnit): ChartScale {
  if (values.length === 0) {
    // 記録0件のサンプル表示用。描画側が線を引かないので値そのものに意味は無いが、
    // 枠と目盛りの本数だけデータがある場合と揃うようにしておく
    const ticks = [0, unit.step, unit.step * 2];
    return { ticks, min: 0, max: unit.step * 2, step: unit.step, labelIndices: [0, 1, 2] };
  }

  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const step = pickStep(lo, hi, unit);
  const { lower, upper } = roundedWindow(lo, hi, step, unit.minRange);

  // 丸めた窓がデータ範囲に対して広すぎる／0起点に落ちた場合は、丸めを諦めて素の自動スケールに戻す
  const rawSpan = Math.ceil(hi / step) * step - Math.floor(lo / step) * step;
  const wasteful = rawSpan > Math.max(hi - lo, unit.minRange) + WASTEFUL_STEPS * step;
  const zeroed = lo > 0 && lower <= 0;
  if (wasteful || zeroed) return rawScale(lo, hi, unit);

  const count = Math.round((upper - lower) / step);
  const ticks = Array.from({ length: count + 1 }, (_, k) => roundValue(lower + step * k));

  return {
    ticks,
    min: lower - step * RANGE_PAD_RATIO,
    max: upper + step * RANGE_PAD_RATIO,
    step,
    labelIndices: pickLabelIndices(ticks.length),
  };
}

// 2.5刻みの積み上げで 67.50000000000001 のような値にならないようにする
function roundValue(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 目盛りラベルの表示文字列（小数第1位まで。整数なら小数点を出さない） */
export function formatTickValue(value: number): string {
  return String(Math.round(value * 10) / 10);
}
