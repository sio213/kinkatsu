import type { Exercise } from '@/db/schema';
import { filterExercises, normalizeForSearch } from '@/lib/exercises/filter';
import { CATEGORY_ALL, CATEGORY_FAVORITE } from '@/lib/exercises/constants';

function make(overrides: Partial<Exercise> & { name: string; category: string }): Exercise {
  return {
    id: 1, slug: null, favorite: false, note: null, source: 'preset',
    createdAt: 0, updatedAt: 0, ...overrides,
  };
}

const CHEST  = make({ id: 1, name: 'ベンチプレス',   category: '胸' });
const CHEST2 = make({ id: 2, name: 'ダンベルフライ', category: '胸' });
const SHOULDER = make({ id: 3, name: 'サイドレイズ', category: '肩' });
const FAV    = make({ id: 4, name: 'スクワット',     category: '脚', favorite: true });
const UNKNOWN = make({ id: 5, name: 'テスト種目',    category: '未知カテゴリ' });

const ALL = [CHEST, CHEST2, SHOULDER, FAV, UNKNOWN];

const CUSTOM_ALNUM = make({ id: 6, name: 'EZバーカール', category: '腕' });
const CUSTOM_PAREN = make({ id: 7, name: 'チェストプレス（マシン）', category: '胸' });
const CUSTOM_CHOON = make({ id: 8, name: 'カーフレイズ', category: '脚' });
const CUSTOM_KANJI = make({ id: 9, name: '縄跳び', category: '有酸素' });
const CUSTOM_HIRA  = make({ id: 10, name: 'なわとび', category: '有酸素' });

const EXT = [...ALL, CUSTOM_ALNUM, CUSTOM_PAREN, CUSTOM_CHOON, CUSTOM_KANJI, CUSTOM_HIRA];

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

  describe('かな/カナ表記ゆれ吸収', () => {
    it('ひらがな検索でカタカナ種目名にマッチ（濁点・小書き含む）', () => {
      const result = filterExercises(ALL, CATEGORY_ALL, 'すくわっと');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('スクワット');
    });

    it('濁点つきひらがな', () => {
      const result = filterExercises(ALL, CATEGORY_ALL, 'だんべる');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('ダンベルフライ');
    });

    it('半角カナ検索でも全角カタカナ種目名にマッチ（NFKC正規化）', () => {
      const result = filterExercises(ALL, CATEGORY_ALL, 'ｽｸﾜｯﾄ');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('スクワット');
    });

    it('normalizeForSearch はひらがな→カタカナ・NFKC・小文字化を行う', () => {
      expect(normalizeForSearch('すくわっと')).toBe('スクワット');
      expect(normalizeForSearch('ABC')).toBe('abc');
    });

    it('半角英字クエリは大文字小文字を区別せずマッチする', () => {
      expect(filterExercises(EXT, CATEGORY_ALL, 'ez').map((e) => e.name)).toContain('EZバーカール');
      expect(filterExercises(EXT, CATEGORY_ALL, 'EZ').map((e) => e.name)).toContain('EZバーカール');
    });

    it('全角英字クエリはNFKCで半角化されマッチする', () => {
      expect(filterExercises(EXT, CATEGORY_ALL, 'ＥＺ').map((e) => e.name)).toContain('EZバーカール');
    });

    it('全角括弧を含む種目名は括弧外の語で部分一致する', () => {
      expect(filterExercises(EXT, CATEGORY_ALL, 'マシン').map((e) => e.name)).toContain(
        'チェストプレス（マシン）',
      );
    });

    it('半角括弧クエリでも全角括弧を含む種目名にマッチする（NFKC）', () => {
      expect(filterExercises(EXT, CATEGORY_ALL, '(マシン)').map((e) => e.name)).toContain(
        'チェストプレス（マシン）',
      );
    });

    it('長音符を含む種目名にひらがなクエリでマッチする', () => {
      expect(filterExercises(EXT, CATEGORY_ALL, 'かーふ').map((e) => e.name)).toContain(
        'カーフレイズ',
      );
    });

    it('カタカナクエリでひらがなを含む種目名にマッチする（逆方向）', () => {
      expect(filterExercises(EXT, CATEGORY_ALL, 'ナワトビ').map((e) => e.name)).toContain(
        'なわとび',
      );
    });

    it('漢字のみのクエリで漢字名にマッチする', () => {
      expect(filterExercises(EXT, CATEGORY_ALL, '縄跳').map((e) => e.name)).toContain('縄跳び');
    });

    it('前後の全角スペースはtrimされてマッチする', () => {
      expect(filterExercises(ALL, CATEGORY_ALL, '　ベンチ　')).toHaveLength(1);
    });

    it('normalizeForSearch は空文字・記号を安全に扱う', () => {
      expect(normalizeForSearch('')).toBe('');
      expect(normalizeForSearch('（）!?')).toBe('()!?');
      expect(() => normalizeForSearch('💪スクワット')).not.toThrow();
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
