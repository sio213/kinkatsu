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
