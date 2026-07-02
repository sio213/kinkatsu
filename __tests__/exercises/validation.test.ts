import { exerciseSchema } from '@/lib/exercises/validation';
import { EXERCISE_CATEGORIES } from '@/lib/exercises/constants';

describe('exerciseSchema', () => {
  test('正常系: name/category/noteすべて有効な値', () => {
    const r = exerciseSchema.safeParse({ name: 'ベンチプレス', category: 'chest', note: 'メモ' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toEqual({ name: 'ベンチプレス', category: 'chest', note: 'メモ' });
    }
  });

  describe('name', () => {
    test('空文字は「種目名を入力してください」', () => {
      const r = exerciseSchema.safeParse({ name: '', category: 'chest', note: '' });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].message).toBe('種目名を入力してください');
    });

    test('前後の空白はtrimされて保存される', () => {
      const r = exerciseSchema.safeParse({ name: '  ベンチ  ', category: 'chest', note: '' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.name).toBe('ベンチ');
    });

    test('空白のみは無効', () => {
      const r = exerciseSchema.safeParse({ name: '   ', category: 'chest', note: '' });
      expect(r.success).toBe(false);
    });
  });

  describe('category', () => {
    test('未選択(undefined)は「カテゴリを選択してください」', () => {
      const r = exerciseSchema.safeParse({ name: 'a', category: undefined, note: '' });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].message).toBe('カテゴリを選択してください');
    });

    test('EXERCISE_CATEGORIESに存在しない値（古いデータ等）は無効', () => {
      const r = exerciseSchema.safeParse({ name: 'a', category: '廃止済みカテゴリ', note: '' });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].message).toBe('カテゴリを選択してください');
    });

    test('EXERCISE_CATEGORIESすべての値で成功する', () => {
      for (const cat of EXERCISE_CATEGORIES) {
        const r = exerciseSchema.safeParse({ name: 'a', category: cat, note: '' });
        expect(r.success).toBe(true);
      }
    });
  });

  describe('note', () => {
    test('空文字はnullに変換される', () => {
      const r = exerciseSchema.safeParse({ name: 'a', category: 'chest', note: '' });
      expect(r.success && r.data.note).toBeNull();
    });

    test('空白のみはnullに変換される', () => {
      const r = exerciseSchema.safeParse({ name: 'a', category: 'chest', note: '   ' });
      expect(r.success && r.data.note).toBeNull();
    });

    test('前後の空白はtrimされる', () => {
      const r = exerciseSchema.safeParse({ name: 'a', category: 'chest', note: '  フォーム注意  ' });
      expect(r.success && r.data.note).toBe('フォーム注意');
    });

    test('nullを直接渡してもそのまま通る', () => {
      const r = exerciseSchema.safeParse({ name: 'a', category: 'chest', note: null });
      expect(r.success && r.data.note).toBeNull();
    });
  });
});
