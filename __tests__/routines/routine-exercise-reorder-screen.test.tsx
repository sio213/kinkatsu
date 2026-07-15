const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
}));

import RoutineExerciseReorderScreen from '@/app/routine/exercise-reorder';
import { useRoutineDraftStore } from '@/lib/routines/draft-store';
import type { DraftExercise } from '@/lib/routines/validation';
import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import ReorderableList from 'react-native-reorderable-list';

function makeExercise(exerciseId: number, overrides: Partial<DraftExercise> = {}): DraftExercise {
  return {
    exerciseId,
    name: `種目${exerciseId}`,
    category: 'chest',
    measurementType: 'weight_reps',
    source: 'preset',
    slug: null,
    sets: [{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null }],
    ...overrides,
  };
}

function findButtonByLabel(root: ReactTestInstance, label: string) {
  return root
    .findAllByType(TouchableOpacity)
    .find((btn: ReactTestInstance) =>
      btn.findAllByType(Text).some((t: ReactTestInstance) => [t.props.children].flat().join('') === label),
    );
}

let currentInstance: ReturnType<typeof create> | undefined;

function render() {
  act(() => {
    currentInstance = create(React.createElement(RoutineExerciseReorderScreen));
  });
  return currentInstance!.root;
}

beforeEach(() => {
  jest.clearAllMocks();
  useRoutineDraftStore.getState().reset();
});

afterEach(() => {
  act(() => {
    currentInstance?.unmount();
  });
  currentInstance = undefined;
});

test('ドラフトの全種目分の行が表示される', () => {
  act(() => {
    useRoutineDraftStore.getState().hydrate([makeExercise(1), makeExercise(2)]);
  });
  const root = render();

  expect(root.findByProps({ children: '種目1' })).toBeDefined();
  expect(root.findByProps({ children: '種目2' })).toBeDefined();
});

test('戻るを押すとrouter.backが呼ばれる(ドラッグ結果は既にドラフトストアへ反映済み)', () => {
  act(() => {
    useRoutineDraftStore.getState().hydrate([makeExercise(1)]);
  });
  const root = render();
  const backBtn = findButtonByLabel(root, '戻る')!;

  act(() => {
    backBtn.props.onPress();
  });

  expect(mockBack).toHaveBeenCalled();
});

test('ドラッグで並び替えると、その場でドラフトストアのexercisesへ反映される(先頭→末尾)', () => {
  act(() => {
    useRoutineDraftStore.getState().hydrate([makeExercise(1), makeExercise(2), makeExercise(3)]);
  });
  const root = render();
  const list = root.findByType(ReorderableList);

  act(() => {
    list.props.onReorder({ from: 0, to: 2 });
  });

  expect(useRoutineDraftStore.getState().exercises.map((e) => e.exerciseId)).toEqual([2, 3, 1]);
});

test('from===to(同じ位置への移動)ではストアの順序が変化しない', () => {
  act(() => {
    useRoutineDraftStore.getState().hydrate([makeExercise(1), makeExercise(2), makeExercise(3)]);
  });
  const root = render();
  const list = root.findByType(ReorderableList);

  act(() => {
    list.props.onReorder({ from: 1, to: 1 });
  });

  expect(useRoutineDraftStore.getState().exercises.map((e) => e.exerciseId)).toEqual([1, 2, 3]);
});

test('同一exerciseIdを含む2件をドラッグしても、setsごと正しく入れ替わる(rowKeyでの区別を検証)', () => {
  const dup1 = makeExercise(1, { sets: [{ weight: 40, reps: 8, durationSeconds: null, distanceMeters: null }] });
  const dup2 = makeExercise(1, { sets: [{ weight: 50, reps: 6, durationSeconds: null, distanceMeters: null }] });
  act(() => {
    useRoutineDraftStore.getState().hydrate([dup1, dup2]);
  });
  const root = render();
  const list = root.findByType(ReorderableList);

  act(() => {
    list.props.onReorder({ from: 0, to: 1 });
  });

  const exercises = useRoutineDraftStore.getState().exercises;
  expect(exercises[0].sets).toEqual(dup2.sets);
  expect(exercises[1].sets).toEqual(dup1.sets);
});

describe('ドラッグハンドルのaccessibilityActions(スクリーンリーダー向けの上へ/下へ移動)', () => {
  test('先頭行にはmoveUpアクションが無く、moveDownのみ発火するとストアへ反映される', () => {
    act(() => {
      useRoutineDraftStore.getState().hydrate([makeExercise(1), makeExercise(2), makeExercise(3)]);
    });
    const root = render();
    const handle = root.findByProps({ accessibilityLabel: '種目1をドラッグして並び替え' });

    expect(handle.props.accessibilityActions).toEqual([{ name: 'moveDown', label: '下へ移動' }]);

    act(() => {
      handle.props.onAccessibilityAction({ nativeEvent: { actionName: 'moveDown' } });
    });

    expect(useRoutineDraftStore.getState().exercises.map((e) => e.exerciseId)).toEqual([2, 1, 3]);
  });

  test('末尾行にはmoveDownアクションが無く、moveUpのみ発火するとストアへ反映される', () => {
    act(() => {
      useRoutineDraftStore.getState().hydrate([makeExercise(1), makeExercise(2), makeExercise(3)]);
    });
    const root = render();
    const handle = root.findByProps({ accessibilityLabel: '種目3をドラッグして並び替え' });

    expect(handle.props.accessibilityActions).toEqual([{ name: 'moveUp', label: '上へ移動' }]);

    act(() => {
      handle.props.onAccessibilityAction({ nativeEvent: { actionName: 'moveUp' } });
    });

    expect(useRoutineDraftStore.getState().exercises.map((e) => e.exerciseId)).toEqual([1, 3, 2]);
  });

  test('要素が1件だけのときはmoveUp/moveDownどちらのアクションも提供されない', () => {
    act(() => {
      useRoutineDraftStore.getState().hydrate([makeExercise(1)]);
    });
    const root = render();
    const handle = root.findByProps({ accessibilityLabel: '種目1をドラッグして並び替え' });

    expect(handle.props.accessibilityActions).toEqual([]);
  });
});

test('exercisesが0件でもクラッシュせず表示・戻るができる', () => {
  const root = render();
  const backBtn = findButtonByLabel(root, '戻る')!;

  act(() => {
    backBtn.props.onPress();
  });

  expect(mockBack).toHaveBeenCalled();
});

test('要素が1件だけの場合、並び替えの余地が無くても表示・戻るとも問題ない', () => {
  act(() => {
    useRoutineDraftStore.getState().hydrate([makeExercise(1)]);
  });
  const root = render();

  expect(root.findByProps({ children: '種目1' })).toBeDefined();
  const backBtn = findButtonByLabel(root, '戻る')!;
  act(() => {
    backBtn.props.onPress();
  });
  expect(mockBack).toHaveBeenCalled();
});
