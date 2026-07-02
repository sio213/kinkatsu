import {
  CATEGORY_ALL,
  CATEGORY_FAVORITE,
  EXERCISE_CATEGORIES,
  getCategoryLabel,
} from '@/lib/exercises/constants';

describe('getCategoryLabel', () => {
  it('既知のカテゴリslugは日本語ラベルを返す', () => {
    expect(getCategoryLabel('chest')).toBe('胸');
    expect(getCategoryLabel('leg')).toBe('脚');
  });

  it('EXERCISE_CATEGORIESすべてに対応するラベルが存在する', () => {
    for (const cat of EXERCISE_CATEGORIES) {
      expect(typeof getCategoryLabel(cat)).toBe('string');
      expect(getCategoryLabel(cat).length).toBeGreaterThan(0);
    }
  });

  it('未知のslug → そのまま返す（fallback）', () => {
    expect(getCategoryLabel('legacy_category')).toBe('legacy_category');
  });

  it('空文字 → そのまま返す（fallback）', () => {
    expect(getCategoryLabel('')).toBe('');
  });

  it('CATEGORY_ALL / CATEGORY_FAVORITE はそのまま返る（非カテゴリの特殊値）', () => {
    expect(getCategoryLabel(CATEGORY_ALL)).toBe(CATEGORY_ALL);
    expect(getCategoryLabel(CATEGORY_FAVORITE)).toBe(CATEGORY_FAVORITE);
  });
});
