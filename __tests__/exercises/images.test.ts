import type { Exercise } from '@/db/schema';
import { getExerciseImages } from '@/lib/exercises/images';

function make(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 1, name: 'ベンチプレス', slug: 'bench_press', category: '胸',
    favorite: false, note: null, formPoints: null, source: 'preset',
    measurementType: 'weight_reps', pairedWeights: false,
    createdAt: 0, updatedAt: 0,
    ...overrides,
  };
}

describe('getExerciseImages', () => {
  describe('source が preset 以外', () => {
    // カスタム種目に他種目の写真を出さないため、素材が無いことをundefinedで表す。
    // 表示側（ExerciseThumbnail・種目詳細のメディア枠）がプレースホルダーに分岐する
    it('custom → source・thumbnailともになし', () => {
      const result = getExerciseImages(make({ source: 'custom' }));
      expect(result.source).toBeUndefined();
      expect(result.thumbnail).toBeUndefined();
    });
  });

  describe('source が preset', () => {
    it('存在しないslug → source・thumbnailともになし', () => {
      const result = getExerciseImages(make({ slug: 'nonexistent_exercise' }));
      expect(result.source).toBeUndefined();
      expect(result.thumbnail).toBeUndefined();
    });

    it('slugがnull → source・thumbnailともになし', () => {
      const result = getExerciseImages(make({ slug: null }));
      expect(result.source).toBeUndefined();
      expect(result.thumbnail).toBeUndefined();
    });

    it('ダンベルカール → source と thumbnail 両方あり', () => {
      const result = getExerciseImages(make({ slug: 'dumbbell_curl', name: 'ダンベルカール' }));
      expect(result.source).toBeDefined();
      expect(result.thumbnail).toBeDefined();
    });

    it('ベンチプレス → source と thumbnail 両方あり', () => {
      const result = getExerciseImages(make({ slug: 'bench_press', name: 'ベンチプレス' }));
      expect(result.source).toBeDefined();
      expect(result.thumbnail).toBeDefined();
    });
  });
});
