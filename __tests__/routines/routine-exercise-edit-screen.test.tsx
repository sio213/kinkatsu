const mockBack = jest.fn();
const mockPush = jest.fn();
const mockUseExercisesWithHistory = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
}));

jest.mock('@/hooks/use-workout-session', () => ({
  useExercisesWithHistory: (...args: unknown[]) => mockUseExercisesWithHistory(...args),
}));

// lib/workout/history.tsはトップレベルで@/db/client(expo-sqlite依存)を読み込むため、
// このスクリーンが使うNO_SESSION_TO_EXCLUDE(単なる定数)だけを差し替える
jest.mock('@/lib/workout/history', () => ({ NO_SESSION_TO_EXCLUDE: -1 }));

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
  mockUseExercisesWithHistory.mockReturnValue(new Set());
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

test('種目を追加ボタンを押すと/routine/exercise-pickerへ、この画面自身が起点であることが分かるreturnToパラメータ付きで遷移する', () => {
  const root = render();
  const addBtn = root.findByProps({ accessibilityLabel: '種目を追加' });

  act(() => {
    addBtn.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/routine/exercise-picker',
    params: { returnTo: 'exercise-edit' },
  });
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
function findMenuTriggers(root: ReactTestInstance) {
  return root.findAllByType(TouchableOpacity).filter((t) => t.props.accessibilityLabel === 'メニューを開く');
}

function findMenuItem(root: ReactTestInstance, label: string) {
  return root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === label);
}

test('先頭・末尾カードのisFirst/isLastが正しく渡り、それぞれ上へ移動/下へ移動が無効になる', () => {
  act(() => {
    useRoutineDraftStore.getState().addExercises([makeExercise(1), makeExercise(2), makeExercise(3)]);
  });
  const root = render();
  const triggers = findMenuTriggers(root);
  expect(triggers).toHaveLength(3);

  act(() => {
    triggers[0].props.onPress();
  });
  expect(findMenuItem(root, '上へ移動')!.props.disabled).toBe(true);
  expect(findMenuItem(root, '下へ移動')!.props.disabled).toBe(false);
});

test('useExercisesWithHistoryのSetに含まれる種目だけ「過去の記録から読み込む」が有効になる', () => {
  mockUseExercisesWithHistory.mockReturnValue(new Set([1]));
  act(() => {
    useRoutineDraftStore.getState().addExercises([makeExercise(1), makeExercise(2)]);
  });
  const root = render();

  // 両方のカードのメニューを開いてから、ツリー内の出現順(=カードの並び順)で判定する。
  // 1件ずつ開いて都度findMenuItemで探すと、閉じずに次を開いた場合に同名ラベルが複数存在し
  // どちらのカードの項目か曖昧になるため
  const triggers = findMenuTriggers(root);
  act(() => {
    triggers[0].props.onPress();
  });
  act(() => {
    triggers[1].props.onPress();
  });

  const items = root
    .findAllByType(TouchableOpacity)
    .filter((t) => t.props.accessibilityLabel === '過去の記録から読み込む');
  expect(items).toHaveLength(2);
  expect(items[0].props.disabled).toBe(false); // exerciseId=1はSetに含まれる
  expect(items[1].props.disabled).toBe(true); // exerciseId=2はSetに含まれない
});

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
