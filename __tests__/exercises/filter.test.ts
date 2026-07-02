import type { Exercise } from '@/db/schema';
import { filterExercises } from '@/lib/exercises/filter';
import { CATEGORY_ALL, CATEGORY_FAVORITE } from '@/lib/exercises/constants';

function make(overrides: Partial<Exercise> & { name: string; category: string }): Exercise {
  return {
    id: 1, favorite: false, note: null, source: 'preset',
    createdAt: 0, updatedAt: 0, ...overrides,
  };
}

const CHEST  = make({ id: 1, name: 'ベンチプレス',   category: '胸' });
const CHEST2 = make({ id: 2, name: 'ダンベルフライ', category: '胸' });
const SHOULDER = make({ id: 3, name: 'サイドレイズ', category: '肩' });
const FAV    = make({ id: 4, name: 'スクワット',     category: '脚', favorite: true });
const UNKNOWN = make({ id: 5, name: 'テスト種目',    category: '未知カテゴリ' });

const ALL = [CHEST, CHEST2, SHOULDER, FAV, UNKNOWN];

describe('filterExercises', () => {
  it('空配列 → []', () => {
    expect(filterExercises([], CATEGORY_ALL, '')).toEqual([]);
  });

  describe('カテゴリフィルタ', () => {
    it('CATEGORY_ALL + search なし → 全件', () => {
      expect(filterExercises(ALL, CATEGORY_ALL, '')).toHaveLength(ALL.length);
    });

    it('CATEGORY_FAVORITE → favorite=true のみ', () => {
      const result = filterExercises(ALL, CATEGORY_FAVORITE, '');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(FAV.id);
    });

    it('CATEGORY_FAVORITE かつお気に入りなし → []', () => {
      expect(filterExercises([CHEST, CHEST2], CATEGORY_FAVORITE, '')).toEqual([]);
    });

    it('特定カテゴリ（胸）→ 胸のみ', () => {
      const result = filterExercises(ALL, '胸', '');
      expect(result.every((e) => e.category === '胸')).toBe(true);
      expect(result).toHaveLength(2);
    });

    it('存在しないカテゴリ → []', () => {
      expect(filterExercises(ALL, '存在しないカテゴリ', '')).toEqual([]);
    });
  });

  describe('テキスト検索', () => {
    it('部分一致で絞り込む', () => {
      const result = filterExercises(ALL, CATEGORY_ALL, 'ベンチ');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('ベンチプレス');
    });

    it('空白のみ → フィルタなし（全件）', () => {
      expect(filterExercises([CHEST, CHEST2], CATEGORY_ALL, '   ')).toHaveLength(2);
    });

    it('前後空白つき → trim されてマッチ', () => {
      const result = filterExercises(ALL, CATEGORY_ALL, ' ベンチ ');
      expect(result).toHaveLength(1);
    });

    it('マッチなし → []', () => {
      expect(filterExercises(ALL, CATEGORY_ALL, 'zzz絶対マッチしない')).toEqual([]);
    });
  });

  describe('カテゴリ + search の複合', () => {
    it('AND 条件で絞り込む', () => {
      const result = filterExercises(ALL, '胸', 'ダンベル');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('ダンベルフライ');
    });
  });

  describe('ソート', () => {
    it('CATEGORY_ORDER 昇順（胸 < 肩）', () => {
      const result = filterExercises([SHOULDER, CHEST], CATEGORY_ALL, '');
      expect(result[0].category).toBe('胸');
      expect(result[1].category).toBe('肩');
    });

    it('同カテゴリ内は名前の localeCompare("ja") 昇順', () => {
      const result = filterExercises([CHEST, CHEST2], CATEGORY_ALL, '');
      expect(result[0].name).toBe('ダンベルフライ');
      expect(result[1].name).toBe('ベンチプレス');
    });

    it('未知カテゴリは order=99 でソート末尾', () => {
      const result = filterExercises([UNKNOWN, CHEST], CATEGORY_ALL, '');
      expect(result[result.length - 1].category).toBe('未知カテゴリ');
    });
  });
});
