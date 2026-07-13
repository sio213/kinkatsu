const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
}));

import { useRoutineDraftStore } from '@/lib/routines/draft-store';
import type { DraftExercise } from '@/lib/routines/validation';
import RoutineExerciseEditScreen from '@/app/routine/exercise-edit';
import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Text, TextInput, TouchableOpacity } from 'react-native';

function makeExercise(exerciseId: number): DraftExercise {
  return {
    exerciseId,
    name: `種目${exerciseId}`,
    category: 'chest',
    measurementType: 'weight_reps',
    source: 'preset',
    slug: null,
    sets: [{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null }],
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
    currentInstance = create(React.createElement(RoutineExerciseEditScreen));
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

test('ドラフトが空なら「種目を追加」の空状態が表示される', () => {
  const root = render();
  expect(root.findByProps({ accessibilityLabel: '種目を追加' })).toBeDefined();
});

test('ドラフトの全種目分のカードが表示される', () => {
  act(() => {
    useRoutineDraftStore.getState().addExercises([makeExercise(1), makeExercise(2)]);
  });
  const root = render();

  expect(root.findByProps({ children: '種目1' })).toBeDefined();
  expect(root.findByProps({ children: '種目2' })).toBeDefined();
});

test('種目を追加ボタンを押すと/routine/exercise-pickerへ遷移する', () => {
  const root = render();
  const addBtn = root.findByProps({ accessibilityLabel: '種目を追加' });

  act(() => {
    addBtn.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith('/routine/exercise-picker');
});

test('保存を押すとrouter.backが呼ばれる（編集内容は既にドラフトストアへ反映済み）', () => {
  act(() => {
    useRoutineDraftStore.getState().addExercises([makeExercise(1)]);
  });
  const root = render();
  const saveBtn = findButtonByLabel(root, '保存')!;

  act(() => {
    saveBtn.props.onPress();
  });

  expect(mockBack).toHaveBeenCalled();
});

test('種目の⋮メニューから削除すると、ドラフトストアから即座に取り除かれ画面から消える', () => {
  act(() => {
    useRoutineDraftStore.getState().addExercises([makeExercise(1), makeExercise(2)]);
  });
  const root = render();

  act(() => {
    useRoutineDraftStore.getState().removeExerciseAt(0);
  });

  expect(() => root.findByProps({ children: '種目1' })).toThrow();
  expect(root.findByProps({ children: '種目2' })).toBeDefined();
});

// 実ストアを使うテスト。RoutineTemplateExerciseCardの単体テスト(store全mock)では
// updateExerciseSetsへ渡す引数の正しさしか検証できず、削除後の実際の再レンダー結果までは
// 検証できない。行削除で配列位置がずれた際、行コンポーネントが古い表示値を持ち越さないことを
// ここで確認する(回帰テスト。かつてkey={setIndex}＋RoutineTemplateSetRowの表示stateが
// マウント時にしか初期化されない実装で、中間行削除後に別のセットの値が表示され続けるバグがあった)
test('中間のセットを行✕で削除すると、残りの行は正しい値を表示する（表示の取り違えがない）', () => {
  act(() => {
    useRoutineDraftStore.getState().addExercises([
      {
        ...makeExercise(1),
        sets: [
          { weight: 10, reps: 1, durationSeconds: null, distanceMeters: null },
          { weight: 20, reps: 2, durationSeconds: null, distanceMeters: null },
          { weight: 30, reps: 3, durationSeconds: null, distanceMeters: null },
        ],
      },
    ]);
  });
  const root = render();

  const rowDeleteBtn = root.findByProps({ accessibilityLabel: '種目1 セット2を削除' });
  act(() => {
    rowDeleteBtn.props.onPress();
  });

  const inputs = root.findAllByType(TextInput);
  expect(inputs.map((i) => i.props.value)).toEqual(['10', '1', '30', '3']);
});
