import type { Exercise } from '@/db/schema';
import { getExerciseImages } from '@/lib/exercises/images';

function make(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 1, name: 'ベンチプレス', slug: 'bench_press', category: '胸',
    favorite: false, note: null, source: 'preset',
    createdAt: 0, updatedAt: 0,
    ...overrides,
  };
}

describe('getExerciseImages', () => {
  describe('source が preset 以外', () => {
    it('custom → undefined', () => {
      expect(getExerciseImages(make({ source: 'custom' }))).toBeUndefined();
    });
  });

  describe('source が preset', () => {
    it('存在しないslug → undefined', () => {
      expect(getExerciseImages(make({ slug: 'nonexistent_exercise' }))).toBeUndefined();
    });

    it('slugがnull → undefined', () => {
      expect(getExerciseImages(make({ slug: null }))).toBeUndefined();
    });

    it('ダンベルカール → source あり、thumbnail なし', () => {
      const result = getExerciseImages(make({ slug: 'dumbbell_curl', name: 'ダンベルカール' }));
      expect(result).toBeDefined();
      expect(result!.source).toBeDefined();
      expect(result!.thumbnail).toBeUndefined();
    });

    it('ベンチプレス → source と thumbnail 両方あり', () => {
      const result = getExerciseImages(make({ slug: 'bench_press', name: 'ベンチプレス' }));
      expect(result).toBeDefined();
      expect(result!.source).toBeDefined();
      expect(result!.thumbnail).toBeDefined();
    });
  });
});
