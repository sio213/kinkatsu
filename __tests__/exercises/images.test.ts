import type { Exercise } from '@/db/schema';
import { getExerciseImages } from '@/lib/exercises/images';

function make(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 1, name: 'ベンチプレス', slug: 'bench_press', category: '胸',
    favorite: false, note: null, muscle: null, formPoints: null, source: 'preset',
    measurementType: 'weight_reps',
    createdAt: 0, updatedAt: 0,
    ...overrides,
  };
}

describe('getExerciseImages', () => {
  describe('source が preset 以外', () => {
    it('custom → sourceなし、thumbnailはプレースホルダー', () => {
      const result = getExerciseImages(make({ source: 'custom' }));
      expect(result.source).toBeUndefined();
      expect(result.thumbnail).toBeDefined();
    });
  });

  describe('source が preset', () => {
    it('存在しないslug → sourceなし、thumbnailはプレースホルダー', () => {
      const result = getExerciseImages(make({ slug: 'nonexistent_exercise' }));
      expect(result.source).toBeUndefined();
      expect(result.thumbnail).toBeDefined();
    });

    it('slugがnull → sourceなし、thumbnailはプレースホルダー', () => {
      const result = getExerciseImages(make({ slug: null }));
      expect(result.source).toBeUndefined();
      expect(result.thumbnail).toBeDefined();
    });

    it('ダンベルカール → source あり、thumbnail はプレースホルダーで補完', () => {
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
