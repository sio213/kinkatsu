import { useRoutineDraftStore } from '@/lib/routines/draft-store';
import type { ReminderInput } from '@/lib/notifications/types';
import type { DraftExercise } from '@/lib/routines/validation';

function makeReminderInput(overrides: Partial<ReminderInput> = {}): ReminderInput {
  return {
    title: '胸の日',
    body: '後でじゃなく、今やる。',
    kind: 'interval',
    hour: 18,
    minute: 0,
    intervalDays: 1,
    enabled: true,
    ...overrides,
  };
}

function makeDraftExercise(exerciseId: number, overrides: Partial<DraftExercise> = {}): DraftExercise {
  return {
    exerciseId,
    name: `種目${exerciseId}`,
    category: 'chest',
    measurementType: 'weight_reps',
    source: 'preset',
    slug: null,
    sets: [],
    ...overrides,
  };
}

beforeEach(() => {
  useRoutineDraftStore.getState().reset();
});

test('初期状態はexercisesが空配列', () => {
  expect(useRoutineDraftStore.getState().exercises).toEqual([]);
});

test('hydrateは既存の内容を置き換える', () => {
  const { hydrate } = useRoutineDraftStore.getState();
  hydrate([makeDraftExercise(1)]);
  expect(useRoutineDraftStore.getState().exercises).toHaveLength(1);

  hydrate([makeDraftExercise(2), makeDraftExercise(3)]);
  const exercises = useRoutineDraftStore.getState().exercises;
  expect(exercises).toHaveLength(2);
  expect(exercises.map((e) => e.exerciseId)).toEqual([2, 3]);
});

test('addExercisesは既存の一覧の末尾に追加する（種目追加順を維持する）', () => {
  const { hydrate, addExercises } = useRoutineDraftStore.getState();
  hydrate([makeDraftExercise(1)]);
  addExercises([makeDraftExercise(2), makeDraftExercise(3)]);

  expect(useRoutineDraftStore.getState().exercises.map((e) => e.exerciseId)).toEqual([1, 2, 3]);
});

test('removeExerciseAtは指定indexの1件だけを取り除く', () => {
  const { hydrate, removeExerciseAt } = useRoutineDraftStore.getState();
  hydrate([makeDraftExercise(1), makeDraftExercise(2), makeDraftExercise(3)]);

  removeExerciseAt(1);

  expect(useRoutineDraftStore.getState().exercises.map((e) => e.exerciseId)).toEqual([1, 3]);
});

test('updateExerciseSetsは指定indexの種目のsetsだけを置き換え、他の種目には影響しない', () => {
  const { hydrate, updateExerciseSets } = useRoutineDraftStore.getState();
  hydrate([
    makeDraftExercise(1, { sets: [{ weight: 10, reps: 1, durationSeconds: null, distanceMeters: null }] }),
    makeDraftExercise(2, { sets: [{ weight: 20, reps: 2, durationSeconds: null, distanceMeters: null }] }),
  ]);

  updateExerciseSets(0, [{ weight: 99, reps: 9, durationSeconds: null, distanceMeters: null }]);

  const exercises = useRoutineDraftStore.getState().exercises;
  expect(exercises[0].sets).toEqual([{ weight: 99, reps: 9, durationSeconds: null, distanceMeters: null }]);
  expect(exercises[1].sets).toEqual([{ weight: 20, reps: 2, durationSeconds: null, distanceMeters: null }]);
});

test('updateExerciseSetsは空配列を渡せる（全セット削除）', () => {
  const { hydrate, updateExerciseSets } = useRoutineDraftStore.getState();
  hydrate([makeDraftExercise(1, { sets: [{ weight: 10, reps: 1, durationSeconds: null, distanceMeters: null }] })]);

  updateExerciseSets(0, []);

  expect(useRoutineDraftStore.getState().exercises[0].sets).toEqual([]);
});

describe('moveExerciseAt', () => {
  test('directionが"up"のとき、指定indexと1つ前の要素を入れ替える', () => {
    const { hydrate, moveExerciseAt } = useRoutineDraftStore.getState();
    hydrate([makeDraftExercise(1), makeDraftExercise(2), makeDraftExercise(3)]);

    moveExerciseAt(1, 'up');

    expect(useRoutineDraftStore.getState().exercises.map((e) => e.exerciseId)).toEqual([2, 1, 3]);
  });

  test('directionが"down"のとき、指定indexと1つ後ろの要素を入れ替える', () => {
    const { hydrate, moveExerciseAt } = useRoutineDraftStore.getState();
    hydrate([makeDraftExercise(1), makeDraftExercise(2), makeDraftExercise(3)]);

    moveExerciseAt(1, 'down');

    expect(useRoutineDraftStore.getState().exercises.map((e) => e.exerciseId)).toEqual([1, 3, 2]);
  });

  test('先頭要素をさらに"up"しても何も起きない(範囲外は無視する)', () => {
    const { hydrate, moveExerciseAt } = useRoutineDraftStore.getState();
    hydrate([makeDraftExercise(1), makeDraftExercise(2)]);

    moveExerciseAt(0, 'up');

    expect(useRoutineDraftStore.getState().exercises.map((e) => e.exerciseId)).toEqual([1, 2]);
  });

  test('末尾要素をさらに"down"しても何も起きない(範囲外は無視する)', () => {
    const { hydrate, moveExerciseAt } = useRoutineDraftStore.getState();
    hydrate([makeDraftExercise(1), makeDraftExercise(2)]);

    moveExerciseAt(1, 'down');

    expect(useRoutineDraftStore.getState().exercises.map((e) => e.exerciseId)).toEqual([1, 2]);
  });

  test('要素が1件だけの配列では、up/downどちらも何も起きない(isFirst/isLastが同時に真になるケース)', () => {
    const { hydrate, moveExerciseAt } = useRoutineDraftStore.getState();
    hydrate([makeDraftExercise(1)]);

    moveExerciseAt(0, 'up');
    expect(useRoutineDraftStore.getState().exercises.map((e) => e.exerciseId)).toEqual([1]);

    moveExerciseAt(0, 'down');
    expect(useRoutineDraftStore.getState().exercises.map((e) => e.exerciseId)).toEqual([1]);
  });

  test('入れ替え対象以外の種目(sets含む)には影響しない', () => {
    const { hydrate, moveExerciseAt } = useRoutineDraftStore.getState();
    hydrate([
      makeDraftExercise(1, { sets: [{ weight: 10, reps: 1, durationSeconds: null, distanceMeters: null }] }),
      makeDraftExercise(2, { sets: [{ weight: 20, reps: 2, durationSeconds: null, distanceMeters: null }] }),
      makeDraftExercise(3, { sets: [{ weight: 30, reps: 3, durationSeconds: null, distanceMeters: null }] }),
    ]);

    moveExerciseAt(0, 'down');

    const exercises = useRoutineDraftStore.getState().exercises;
    expect(exercises[2]).toEqual(makeDraftExercise(3, { sets: [{ weight: 30, reps: 3, durationSeconds: null, distanceMeters: null }] }));
  });
});

describe('reorderExercises', () => {
  test('渡した配列の順序をそのまま置き換える(末尾→先頭)', () => {
    const { hydrate, reorderExercises } = useRoutineDraftStore.getState();
    hydrate([makeDraftExercise(1), makeDraftExercise(2), makeDraftExercise(3)]);

    const [a, b, c] = useRoutineDraftStore.getState().exercises;
    reorderExercises([c, a, b]);

    expect(useRoutineDraftStore.getState().exercises.map((e) => e.exerciseId)).toEqual([3, 1, 2]);
  });

  test('先頭→末尾への移動も正しく反映する', () => {
    const { hydrate, reorderExercises } = useRoutineDraftStore.getState();
    hydrate([makeDraftExercise(1), makeDraftExercise(2), makeDraftExercise(3)]);

    const [a, b, c] = useRoutineDraftStore.getState().exercises;
    reorderExercises([b, c, a]);

    expect(useRoutineDraftStore.getState().exercises.map((e) => e.exerciseId)).toEqual([2, 3, 1]);
  });

  test('要素が1件だけの配列に同じ内容を渡しても変化しない', () => {
    const { hydrate, reorderExercises } = useRoutineDraftStore.getState();
    hydrate([makeDraftExercise(1)]);

    reorderExercises(useRoutineDraftStore.getState().exercises);

    expect(useRoutineDraftStore.getState().exercises.map((e) => e.exerciseId)).toEqual([1]);
  });

  test('sets等の中身を保ったまま順序だけを入れ替える', () => {
    const { hydrate, reorderExercises } = useRoutineDraftStore.getState();
    hydrate([
      makeDraftExercise(1, { sets: [{ weight: 10, reps: 1, durationSeconds: null, distanceMeters: null }] }),
      makeDraftExercise(2, { sets: [{ weight: 20, reps: 2, durationSeconds: null, distanceMeters: null }] }),
    ]);

    const [a, b] = useRoutineDraftStore.getState().exercises;
    reorderExercises([b, a]);

    const exercises = useRoutineDraftStore.getState().exercises;
    expect(exercises[0]).toEqual(b);
    expect(exercises[1]).toEqual(a);
  });

  test('exercisesが空の状態で空配列を渡しても空配列のまま', () => {
    const { hydrate, reorderExercises } = useRoutineDraftStore.getState();
    hydrate([]);

    reorderExercises([]);

    expect(useRoutineDraftStore.getState().exercises).toEqual([]);
  });

  test('同じ順序をそのまま渡し直しても内容は変化しない(冪等)', () => {
    const { hydrate, reorderExercises } = useRoutineDraftStore.getState();
    hydrate([makeDraftExercise(1), makeDraftExercise(2), makeDraftExercise(3)]);
    const before = useRoutineDraftStore.getState().exercises;

    reorderExercises(before);

    expect(useRoutineDraftStore.getState().exercises.map((e) => e.exerciseId)).toEqual([1, 2, 3]);
  });

  test('同じexerciseIdを複数含む配列でも、各要素の中身(sets)ごと正しく並び替わる', () => {
    const { hydrate, reorderExercises } = useRoutineDraftStore.getState();
    const first = makeDraftExercise(5, {
      sets: [{ weight: 10, reps: 1, durationSeconds: null, distanceMeters: null }],
    });
    const second = makeDraftExercise(5, {
      sets: [{ weight: 20, reps: 2, durationSeconds: null, distanceMeters: null }],
    });
    hydrate([first, second]);

    reorderExercises([second, first]);

    const exercises = useRoutineDraftStore.getState().exercises;
    expect(exercises[0].sets).toEqual(second.sets);
    expect(exercises[1].sets).toEqual(first.sets);
  });
});

describe('replaceExerciseAt', () => {
  test('指定indexの種目を丸ごと別の種目に差し替える', () => {
    const { hydrate, replaceExerciseAt } = useRoutineDraftStore.getState();
    hydrate([makeDraftExercise(1), makeDraftExercise(2)]);

    const replacement = makeDraftExercise(9, {
      name: '入れ替え後の種目',
      sets: [{ weight: 40, reps: 5, durationSeconds: null, distanceMeters: null }],
    });
    replaceExerciseAt(0, replacement);

    const exercises = useRoutineDraftStore.getState().exercises;
    expect(exercises[0]).toEqual(replacement);
    expect(exercises[1].exerciseId).toBe(2);
  });
});

describe('loadSetsIntoExerciseAt', () => {
  test('指定indexの種目のsetsだけを置き換え、他の種目には影響しない(updateExerciseSetsと同じ反映内容)', () => {
    const { hydrate, loadSetsIntoExerciseAt } = useRoutineDraftStore.getState();
    hydrate([
      makeDraftExercise(1, { sets: [{ weight: 10, reps: 1, durationSeconds: null, distanceMeters: null }] }),
      makeDraftExercise(2, { sets: [{ weight: 20, reps: 2, durationSeconds: null, distanceMeters: null }] }),
    ]);

    loadSetsIntoExerciseAt(0, [{ weight: 99, reps: 9, durationSeconds: null, distanceMeters: null }]);

    const exercises = useRoutineDraftStore.getState().exercises;
    expect(exercises[0].sets).toEqual([{ weight: 99, reps: 9, durationSeconds: null, distanceMeters: null }]);
    expect(exercises[1].sets).toEqual([{ weight: 20, reps: 2, durationSeconds: null, distanceMeters: null }]);
  });

  test('lastSetsReplacementにindexと新しいtokenをセットする(呼び出し前と異なる値になる)', () => {
    const { hydrate, loadSetsIntoExerciseAt } = useRoutineDraftStore.getState();
    hydrate([makeDraftExercise(1)]);
    expect(useRoutineDraftStore.getState().lastSetsReplacement).toBeNull();

    loadSetsIntoExerciseAt(0, [{ weight: 1, reps: 1, durationSeconds: null, distanceMeters: null }]);

    const first = useRoutineDraftStore.getState().lastSetsReplacement;
    expect(first?.index).toBe(0);
    expect(first?.token).toEqual(expect.any(Number));

    loadSetsIntoExerciseAt(0, [{ weight: 2, reps: 2, durationSeconds: null, distanceMeters: null }]);
    const second = useRoutineDraftStore.getState().lastSetsReplacement;
    expect(second?.token).not.toBe(first?.token);
  });

  test('updateExerciseSetsはlastSetsReplacementを変えない(カード自身の編集と区別するため)', () => {
    const { hydrate, updateExerciseSets } = useRoutineDraftStore.getState();
    hydrate([makeDraftExercise(1)]);

    updateExerciseSets(0, [{ weight: 1, reps: 1, durationSeconds: null, distanceMeters: null }]);

    expect(useRoutineDraftStore.getState().lastSetsReplacement).toBeNull();
  });
});

test('resetはexercisesを空配列に戻す', () => {
  const { hydrate, reset } = useRoutineDraftStore.getState();
  hydrate([makeDraftExercise(1)]);
  reset();
  expect(useRoutineDraftStore.getState().exercises).toEqual([]);
});

describe('リマインダー関連の状態', () => {
  test('初期状態はreminderEnabled:true・reminder:null(デフォルトON・未設定)', () => {
    expect(useRoutineDraftStore.getState().reminderEnabled).toBe(true);
    expect(useRoutineDraftStore.getState().reminder).toBeNull();
  });

  test('setReminderEnabledはトグル状態だけを変え、reminderの中身は消さない', () => {
    const { setReminder, setReminderEnabled } = useRoutineDraftStore.getState();
    const reminder = makeReminderInput();
    setReminder(reminder);

    setReminderEnabled(false);
    expect(useRoutineDraftStore.getState().reminderEnabled).toBe(false);
    expect(useRoutineDraftStore.getState().reminder).toEqual(reminder);

    setReminderEnabled(true);
    expect(useRoutineDraftStore.getState().reminderEnabled).toBe(true);
    expect(useRoutineDraftStore.getState().reminder).toEqual(reminder);
  });

  test('setReminderは設定内容を置き換える', () => {
    const { setReminder } = useRoutineDraftStore.getState();
    setReminder(makeReminderInput({ kind: 'weekly', weekdays: [1, 3] }));

    expect(useRoutineDraftStore.getState().reminder).toEqual(
      expect.objectContaining({ kind: 'weekly', weekdays: [1, 3] }),
    );
  });

  test('hydrateReminderは既存ルーティンのリマインダー設定を読み込む', () => {
    const { hydrateReminder } = useRoutineDraftStore.getState();
    const reminder = makeReminderInput({ enabled: false });

    hydrateReminder({ enabled: false, reminder });

    expect(useRoutineDraftStore.getState().reminderEnabled).toBe(false);
    expect(useRoutineDraftStore.getState().reminder).toEqual(reminder);
  });

  test('resetはreminderEnabled:true・reminder:nullに戻す', () => {
    const { setReminder, setReminderEnabled, reset } = useRoutineDraftStore.getState();
    setReminder(makeReminderInput());
    setReminderEnabled(false);

    reset();

    expect(useRoutineDraftStore.getState().reminderEnabled).toBe(true);
    expect(useRoutineDraftStore.getState().reminder).toBeNull();
  });
});
