import type { RoutineDetail } from '@/lib/routines/db';
import {
  routineFormSchema,
  toDraftExercises,
  toDraftReminder,
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

function baseFormValues(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: '胸の日',
    exercises: [makeDraftExercise()],
    reminderEnabled: false,
    reminder: null,
    ...overrides,
  };
}

describe('routineFormSchema', () => {
  test('名前・種目1件以上があれば成功する', () => {
    const result = routineFormSchema.safeParse(baseFormValues());
    expect(result.success).toBe(true);
  });

  test('名前が空文字だとエラーになる', () => {
    const result = routineFormSchema.safeParse(baseFormValues({ name: '' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.name?.[0]).toBe('ルーティン名を入力してください');
    }
  });

  test('名前が空白のみでもtrimされてエラーになる', () => {
    const result = routineFormSchema.safeParse(baseFormValues({ name: '   ' }));
    expect(result.success).toBe(false);
  });

  test('種目が0件だとエラーになる', () => {
    const result = routineFormSchema.safeParse(baseFormValues({ exercises: [] }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.exercises?.[0]).toBe('種目を1つ以上追加してください');
    }
  });

  test('reminderEnabled:trueでreminderがnullのままだとエラーになる', () => {
    const result = routineFormSchema.safeParse(baseFormValues({ reminderEnabled: true, reminder: null }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.reminder?.[0]).toBe('通知タイミングを設定してください');
    }
  });

  test('reminderEnabled:trueでもreminderが設定済みなら成功する', () => {
    const reminder = { title: '胸の日', body: 'b', kind: 'interval' as const, hour: 18, minute: 0, intervalDays: 1, enabled: true };
    const result = routineFormSchema.safeParse(baseFormValues({ reminderEnabled: true, reminder }));
    expect(result.success).toBe(true);
  });

  test('reminderEnabled:falseならreminderがnullのままでも成功する', () => {
    const result = routineFormSchema.safeParse(baseFormValues({ reminderEnabled: false, reminder: null }));
    expect(result.success).toBe(true);
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
      reminderEnabled: false,
      reminder: null,
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
      reminder: null,
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
      reminder: null,
    };
    expect(toDraftExercises(detail)).toEqual([]);
  });
});

describe('toDraftReminder', () => {
  const baseDetail: RoutineDetail = {
    routine: { id: 1, name: '胸の日', orderIndex: 0, createdAt: 0, updatedAt: 0 },
    exercises: [],
    reminder: null,
  };

  test('紐づくリマインダーが無ければトグルOFF(未設定)を返す(既存ルーティンでreminderが無いのは保存時のバリデーション上OFFで保存した場合のみのため)', () => {
    expect(toDraftReminder(baseDetail)).toEqual({ enabled: false, reminder: null });
  });

  test('紐づくリマインダーがあれば、そのenabled状態とReminderInputへ変換した設定内容を返す', () => {
    const detail: RoutineDetail = {
      ...baseDetail,
      reminder: {
        id: 1,
        routineId: 1,
        title: '胸の日',
        body: '後でじゃなく、今やる。',
        kind: 'interval',
        hour: 18,
        minute: 0,
        weekdays: null,
        monthdays: null,
        anchorDate: null,
        intervalDays: 1,
        intervalMonths: null,
        nthWeek: null,
        nthWeekdays: null,
        enabled: false,
        createdAt: 0,
        updatedAt: 0,
      },
    };

    const result = toDraftReminder(detail);

    expect(result.enabled).toBe(false);
    expect(result.reminder).toEqual(expect.objectContaining({ routineId: 1, title: '胸の日', kind: 'interval' }));
  });
});
