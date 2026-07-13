import type { RoutineDetail } from '@/lib/routines/db';
import {
  routineFormSchema,
  toDraftExercises,
  toRoutineInput,
  type DraftExercise,
  type RoutineFormValues,
} from '@/lib/routines/validation';

function makeDraftExercise(overrides: Partial<DraftExercise> = {}): DraftExercise {
  return {
    exerciseId: 1,
    name: 'ベンチプレス',
    category: 'chest',
    measurementType: 'weight_reps',
    source: 'preset',
    slug: 'bench_press',
    sets: [{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null }],
    ...overrides,
  };
}

describe('routineFormSchema', () => {
  test('名前・種目1件以上があれば成功する', () => {
    const result = routineFormSchema.safeParse({ name: '胸の日', exercises: [makeDraftExercise()] });
    expect(result.success).toBe(true);
  });

  test('名前が空文字だとエラーになる', () => {
    const result = routineFormSchema.safeParse({ name: '', exercises: [makeDraftExercise()] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.name?.[0]).toBe('ルーティン名を入力してください');
    }
  });

  test('名前が空白のみでもtrimされてエラーになる', () => {
    const result = routineFormSchema.safeParse({ name: '   ', exercises: [makeDraftExercise()] });
    expect(result.success).toBe(false);
  });

  test('種目が0件だとエラーになる', () => {
    const result = routineFormSchema.safeParse({ name: '胸の日', exercises: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.exercises?.[0]).toBe('種目を1つ以上追加してください');
    }
  });
});

describe('toRoutineInput', () => {
  test('DraftExerciseの表示用フィールド(name/category等)を除きexerciseId/setsだけを取り出す', () => {
    const values: RoutineFormValues = {
      name: '胸の日',
      exercises: [
        makeDraftExercise({ exerciseId: 5, sets: [{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null }] }),
        makeDraftExercise({ exerciseId: 9, name: 'スクワット', category: 'leg', sets: [] }),
      ],
    };

    expect(toRoutineInput(values)).toEqual({
      name: '胸の日',
      exercises: [
        { exerciseId: 5, sets: [{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null }] },
        { exerciseId: 9, sets: [] },
      ],
    });
  });
});

describe('toDraftExercises', () => {
  test('getRoutineDetail()のDB行をDraftExercise[]に変換する', () => {
    const detail: RoutineDetail = {
      routine: { id: 1, name: '胸の日', orderIndex: 0, createdAt: 0, updatedAt: 0 },
      exercises: [
        {
          id: 100,
          routineId: 1,
          exerciseId: 5,
          orderIndex: 0,
          createdAt: 0,
          name: 'ベンチプレス',
          category: 'chest',
          measurementType: 'weight_reps',
          source: 'preset',
          slug: 'bench_press',
          sets: [
            { id: 1000, routineExerciseId: 100, setNumber: 1, weight: 60, reps: 8, durationSeconds: null, distanceMeters: null, createdAt: 0 },
          ],
        },
      ],
    };

    expect(toDraftExercises(detail)).toEqual([
      {
        exerciseId: 5,
        name: 'ベンチプレス',
        category: 'chest',
        measurementType: 'weight_reps',
        source: 'preset',
        slug: 'bench_press',
        sets: [{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null }],
      },
    ]);
  });

  test('種目0件のルーティンは空配列になる', () => {
    const detail: RoutineDetail = {
      routine: { id: 1, name: '空のルーティン', orderIndex: 0, createdAt: 0, updatedAt: 0 },
      exercises: [],
    };
    expect(toDraftExercises(detail)).toEqual([]);
  });
});
