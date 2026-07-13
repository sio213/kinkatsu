import { useRoutineDraftStore } from '@/lib/routines/draft-store';
import type { DraftExercise } from '@/lib/routines/validation';

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

test('resetはexercisesを空配列に戻す', () => {
  const { hydrate, reset } = useRoutineDraftStore.getState();
  hydrate([makeDraftExercise(1)]);
  reset();
  expect(useRoutineDraftStore.getState().exercises).toEqual([]);
});
