import { computeScrollTarget, pickTopmostY } from '@/components/ui/form-scroll-context';

describe('pickTopmostY', () => {
  test('全て測定できなかった(null)場合はnullを返す', () => {
    expect(pickTopmostY([null, null])).toBeNull();
  });

  test('空配列の場合はnullを返す', () => {
    expect(pickTopmostY([])).toBeNull();
  });

  test('1件だけ測定できた場合はその値を返す', () => {
    expect(pickTopmostY([null, 120, null])).toBe(120);
  });

  test('複数測定できた場合は最小値(画面上で一番上)を返す', () => {
    // errorsオブジェクトのキー順(=配列の並び順)とは無関係に、実測Y座標が一番小さいものを選ぶ
    expect(pickTopmostY([300, 50, 500])).toBe(50);
  });

  test('0(画面最上部)も有効な値として扱う', () => {
    expect(pickTopmostY([0, 100])).toBe(0);
  });
});

describe('computeScrollTarget', () => {
  test('マージン分を差し引いた位置を返す', () => {
    expect(computeScrollTarget(100, 16)).toBe(84);
  });

  test('差し引いた結果が負値になる場合は0にクランプする', () => {
    expect(computeScrollTarget(10, 16)).toBe(0);
  });

  test('マージン省略時は既定値(16)が使われる', () => {
    expect(computeScrollTarget(100)).toBe(84);
  });

  test('境界値: topmostYがマージンとちょうど同じ場合は自然に0になる(クランプではなく減算結果として)', () => {
    expect(computeScrollTarget(16, 16)).toBe(0);
  });
});
