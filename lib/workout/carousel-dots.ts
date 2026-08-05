/** ドットの上限。これを超える件数は5個に圧縮し、位置は「3/8」のテキストで補う（デザイン案） */
export const MAX_DOTS = 5;

export type CarouselDot = {
  /** 端であることを示す小さいドット。件数が上限を超えたときだけ現れる */
  small: boolean;
  active: boolean;
};

/**
 * 種目切り替えの位置を表すドット列。
 *
 * 件数が上限以下ならそのまま1件1ドット。超えたら常に5個に圧縮し、両端を小さくして
 * 「まだ先がある」ことを示す。圧縮すると1ドット＝1種目でなくなるため、正確な位置は
 * 呼び出し側が「3/8」のテキストで併記する。
 *
 * 圧縮時に光るドットの位置は、両端2つずつを実際の位置に対応させ、それ以外は中央にまとめる。
 *
 *   先頭         → 1番目
 *   2番目        → 2番目
 *   中ほど       → 3番目（中央）
 *   最後から2番目 → 4番目
 *   末尾         → 5番目
 *
 * 中央固定にしないのは、端の近くに居ることをドットだけでも分かるようにするため。端に光らせる
 * ときはそのドットを小さくしない（実際にその位置の種目を指しているので、省略の印と紛らわしくなる）。
 *
 * currentIndexは0始まり
 */
export function buildCarouselDots(total: number, currentIndex: number): CarouselDot[] {
  if (total <= MAX_DOTS) {
    return Array.from({ length: total }, (_, i) => ({ small: false, active: i === currentIndex }));
  }

  const activeSlot =
    currentIndex === 0
      ? 0
      : currentIndex === 1
        ? 1
        : currentIndex === total - 2
          ? MAX_DOTS - 2
          : currentIndex === total - 1
            ? MAX_DOTS - 1
            : 2;
  return Array.from({ length: MAX_DOTS }, (_, slot) => ({
    small: (slot === 0 || slot === MAX_DOTS - 1) && slot !== activeSlot,
    active: slot === activeSlot,
  }));
}

/** ドットを圧縮したときだけ添える位置テキスト。1始まりで数える */
export function carouselPositionLabel(total: number, currentIndex: number): string | null {
  return total > MAX_DOTS ? `${currentIndex + 1}/${total}` : null;
}
