// db/seed.ts は @/db/client を副作用ありでimportするため、実DBに触れないようモックする
jest.mock('@/db/client', () => ({ db: {} }));
jest.mock('@/db/schema', () => ({ exercises: {} }));
jest.mock('drizzle-orm', () => ({ eq: jest.fn() }));

import type { Exercise } from '@/db/schema';
import { PRESET_EXERCISES } from '@/db/seed';
import { filterExercises } from '@/lib/exercises/filter';
import { CATEGORY_ALL } from '@/lib/exercises/constants';

function toExercise(preset: (typeof PRESET_EXERCISES)[number], id: number): Exercise {
  return {
    id,
    slug: preset.slug,
    name: preset.name,
    category: preset.category,
    favorite: false,
    note: null,
    formPoints: null,
    source: 'preset',
    measurementType: preset.measurementType,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('実データ（PRESET_EXERCISES）との整合性', () => {
  it('slugに重複が無い', () => {
    const slugs = PRESET_EXERCISES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('全種目が、自分自身の完全な種目名で検索すると必ず自分自身がヒットする（自己参照）', () => {
    const all = PRESET_EXERCISES.map(toExercise);
    const missing: string[] = [];
    for (const preset of PRESET_EXERCISES) {
      const result = filterExercises(all, CATEGORY_ALL, preset.name);
      if (!result.some((e) => e.slug === preset.slug)) {
        missing.push(preset.name);
      }
    }
    expect(missing).toEqual([]);
  });

  it('全300件規模のリストに対してfilterExercisesを実行してもクラッシュしない（カテゴリ名・muscle・略称等あらゆる検索軸）', () => {
    const all = PRESET_EXERCISES.map(toExercise);
    const queries = ['胸', 'むね', '筋', 'BP', 'SQ', 'DL', 'OHP', '大臀筋', 'すくわっと', ''];
    for (const q of queries) {
      expect(() => filterExercises(all, CATEGORY_ALL, q)).not.toThrow();
    }
  });
});
