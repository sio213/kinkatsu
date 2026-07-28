import { isCompleted, type ProgressPoint, type ProgressSet } from '@/lib/exercises/progress';

/**
 * 重量グラフの内訳カードで、セット行をどう並べるかの計算。表示コンポーネントから切り離して
 * テストできるようにしている。
 */

/** これ以上のセット数がある日は畳む。7セット以下は畳んでも隠れるのが1〜2行だけでタップのコストに見合わない */
export const COLLAPSE_THRESHOLD = 8;
/** 畳んだときに見せるセット数 */
export const COLLAPSED_WINDOW = 5;

export type DetailSetRow = {
  set: ProgressSet;
  /** 画面に出す通し番号。同じ日に複数カードがあると set.setNumber は 1 から振り直されるため使えない */
  position: number;
  isBest: boolean;
};

/**
 * 内訳カードに並べるセット行。8セット以上の日は「ベストを含む連続5件」に畳む。
 * 先頭5件固定にしないのは、ベストのセットがグラフの点に対応しているため、それが窓から
 * 切れると「どのセットがこの点なのか」が分からなくなるから（デザイン案）。
 */
export function buildDetailSetRows(point: ProgressPoint, expanded: boolean): DetailSetRow[] {
  const rows: DetailSetRow[] = point.sets.map((set, index) => ({
    set,
    position: index + 1,
    isBest: set === point.best,
  }));

  if (expanded || rows.length < COLLAPSE_THRESHOLD) return rows;

  const bestIndex = rows.findIndex((row) => row.isBest);
  // ベストを窓の中央に置き、前後がはみ出す場合は端に寄せる
  const start = Math.min(
    Math.max(bestIndex - Math.floor(COLLAPSED_WINDOW / 2), 0),
    rows.length - COLLAPSED_WINDOW,
  );
  return rows.slice(start, start + COLLAPSED_WINDOW);
}

/** 畳んだときに隠れるセット数。畳む必要が無ければ0 */
export function hiddenSetCount(point: ProgressPoint, expanded: boolean): number {
  if (expanded || point.sets.length < COLLAPSE_THRESHOLD) return 0;
  return point.sets.length - COLLAPSED_WINDOW;
}

/** ✓確定したセットだけ。前回比の計算に使う（自己ベスト判定と基準を揃える） */
export function completedSets(point: ProgressPoint): ProgressSet[] {
  return point.sets.filter(isCompleted);
}
