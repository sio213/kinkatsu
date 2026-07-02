import type { Exercise } from '@/db/schema';
import { getExerciseImages } from '@/lib/exercises/images';

function make(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 1, name: 'ベンチプレス', category: '胸',
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
    it('存在しない名前 → undefined', () => {
      expect(getExerciseImages(make({ name: '存在しない種目' }))).toBeUndefined();
    });

    it('ダンベルカール → source あり、thumbnail なし', () => {
      const result = getExerciseImages(make({ name: 'ダンベルカール' }));
      expect(result).toBeDefined();
      expect(result!.source).toBeDefined();
      expect(result!.thumbnail).toBeUndefined();
    });

    it('ベンチプレス → source と thumbnail 両方あり', () => {
      const result = getExerciseImages(make({ name: 'ベンチプレス' }));
      expect(result).toBeDefined();
      expect(result!.source).toBeDefined();
      expect(result!.thumbnail).toBeDefined();
    });
  });
});
