import { buildCarouselDots, carouselPositionLabel, MAX_DOTS } from '@/lib/workout/carousel-dots';

describe('buildCarouselDots', () => {
  it('上限以下なら1件1ドットで、現在位置だけを光らせる', () => {
    expect(buildCarouselDots(3, 1)).toEqual([
      { small: false, active: false },
      { small: false, active: true },
      { small: false, active: false },
    ]);
  });

  it('1件だけならドットも1つ', () => {
    expect(buildCarouselDots(1, 0)).toEqual([{ small: false, active: true }]);
  });

  it('ちょうど上限（5件）までは圧縮しない', () => {
    expect(buildCarouselDots(MAX_DOTS, 4)).toHaveLength(MAX_DOTS);
    expect(buildCarouselDots(MAX_DOTS, 4)[4]).toEqual({ small: false, active: true });
  });

  // デザイン案の「8種目・3番目」の状態。両端を小さくして中央を光らせる
  it('上限を超えたら常に5個へ圧縮し、途中の位置は中央を光らせる', () => {
    expect(buildCarouselDots(8, 2)).toEqual([
      { small: true, active: false },
      { small: false, active: false },
      { small: false, active: true },
      { small: false, active: false },
      { small: true, active: false },
    ]);
  });

  // 端に着いたことをドットだけでも分かるようにする。光らせる側は省略の印と紛らわしいので縮めない
  it('圧縮時、先頭では左端・末尾では右端を光らせ、そのドットは小さくしない', () => {
    expect(buildCarouselDots(8, 0)[0]).toEqual({ small: false, active: true });
    expect(buildCarouselDots(8, 0)[4]).toEqual({ small: true, active: false });

    expect(buildCarouselDots(8, 7)[4]).toEqual({ small: false, active: true });
    expect(buildCarouselDots(8, 7)[0]).toEqual({ small: true, active: false });
  });
});

describe('carouselPositionLabel', () => {
  it('圧縮していない間は位置テキストを出さない', () => {
    expect(carouselPositionLabel(5, 2)).toBeNull();
  });

  // 圧縮すると1ドット＝1種目でなくなるため、正確な位置は数字で補う
  it('圧縮したら1始まりの「現在/全体」を返す', () => {
    expect(carouselPositionLabel(8, 2)).toBe('3/8');
  });
});
