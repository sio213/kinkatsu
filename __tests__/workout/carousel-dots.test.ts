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

  // 端の隣に居ることもドットで分かるようにする（両端2つずつを実際の位置に対応させる）
  it('圧縮時、2番目では2番目・最後から2番目では4番目を光らせる', () => {
    const second = buildCarouselDots(8, 1);
    expect(second.map((d) => d.active)).toEqual([false, true, false, false, false]);
    // 左端は「まだ先がある」印のままにする（実際に前の種目が1つある）
    expect(second[0]).toEqual({ small: true, active: false });

    const secondFromLast = buildCarouselDots(8, 6);
    expect(secondFromLast.map((d) => d.active)).toEqual([false, false, false, true, false]);
    expect(secondFromLast[4]).toEqual({ small: true, active: false });
  });

  // 6件では 0→0 1→1 2,3→2 4→3 5→4。中ほどが2件だけになっても破綻しない
  it('上限+1件（6件）でも両端の対応が優先される', () => {
    expect(buildCarouselDots(6, 0).findIndex((d) => d.active)).toBe(0);
    expect(buildCarouselDots(6, 1).findIndex((d) => d.active)).toBe(1);
    expect(buildCarouselDots(6, 2).findIndex((d) => d.active)).toBe(2);
    expect(buildCarouselDots(6, 3).findIndex((d) => d.active)).toBe(2);
    expect(buildCarouselDots(6, 4).findIndex((d) => d.active)).toBe(3);
    expect(buildCarouselDots(6, 5).findIndex((d) => d.active)).toBe(4);
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
