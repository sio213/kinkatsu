const mockPush = jest.fn();
const mockRemoveExerciseAt = jest.fn();
const mockUpdateExerciseSets = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/lib/routines/draft-store', () => ({
  useRoutineDraftStore: (selector: (state: any) => unknown) =>
    selector({ removeExerciseAt: mockRemoveExerciseAt, updateExerciseSets: mockUpdateExerciseSets }),
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Alert, Text, TextInput, TouchableOpacity } from 'react-native';
import { RoutineTemplateExerciseCard } from '@/components/routines/routine-template-exercise-card';
import type { DraftExercise } from '@/lib/routines/validation';

function makeExercise(overrides: Partial<DraftExercise> = {}): DraftExercise {
  return {
    exerciseId: 5,
    name: 'ベンチプレス',
    category: 'chest',
    measurementType: 'weight_reps',
    source: 'preset',
    slug: 'bench_press',
    sets: [{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null }],
    ...overrides,
  };
}

function render(exercise: DraftExercise, index = 0) {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(<RoutineTemplateExerciseCard exercise={exercise} index={index} />);
  });
  return instance.root;
}

function findButtonByLabel(root: ReactTestInstance, label: string) {
  return root
    .findAllByType(TouchableOpacity)
    .find((btn: ReactTestInstance) =>
      btn.findAllByType(Text).some((t: ReactTestInstance) => [t.props.children].flat().join('') === label),
    );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

test('種目名・セット値が表示される', () => {
  const root = render(makeExercise());
  expect(root.findByProps({ children: 'ベンチプレス' })).toBeDefined();
  const inputs = root.findAllByType(TextInput);
  expect(inputs[0].props.value).toBe('60');
  expect(inputs[1].props.value).toBe('8');
});

test('折りたたむとセット表がdisplay:noneになる', () => {
  const root = render(makeExercise());
  const toggle = root.findByProps({ accessibilityLabel: 'ベンチプレスを折りたたむ' });

  act(() => {
    toggle.props.onPress();
  });

  const body = root.findByProps({ testID: 'card-body' });
  expect(body.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ display: 'none' })]));
});

test('セット追加を押すと直前セットの値をコピーした1件が足される（トレーニング中画面と同じ挙動）', () => {
  const root = render(makeExercise());
  const addBtn = findButtonByLabel(root, 'セット追加')!;

  act(() => {
    addBtn.props.onPress();
  });

  expect(mockUpdateExerciseSets).toHaveBeenCalledWith(0, [
    { weight: 60, reps: 8, durationSeconds: null, distanceMeters: null },
    { weight: 60, reps: 8, durationSeconds: null, distanceMeters: null },
  ]);
});

test('セットが0件の状態でセット追加を押すと空欄のセットが1件足される', () => {
  const root = render(makeExercise({ sets: [] }));
  const addBtn = findButtonByLabel(root, 'セット追加')!;

  act(() => {
    addBtn.props.onPress();
  });

  expect(mockUpdateExerciseSets).toHaveBeenCalledWith(0, [
    { weight: null, reps: null, durationSeconds: null, distanceMeters: null },
  ]);
});

test('セット削除(末尾)を押すと最後のセットが取り除かれる', () => {
  const exercise = makeExercise({
    sets: [
      { weight: 60, reps: 8, durationSeconds: null, distanceMeters: null },
      { weight: 60, reps: 6, durationSeconds: null, distanceMeters: null },
    ],
  });
  const root = render(exercise);
  const deleteBtn = findButtonByLabel(root, 'セット削除')!;

  act(() => {
    deleteBtn.props.onPress();
  });

  expect(mockUpdateExerciseSets).toHaveBeenCalledWith(0, [
    { weight: 60, reps: 8, durationSeconds: null, distanceMeters: null },
  ]);
});

test('行ごとの✕でその行だけが取り除かれる（末尾に限らない）', () => {
  const exercise = makeExercise({
    sets: [
      { weight: 60, reps: 8, durationSeconds: null, distanceMeters: null },
      { weight: 60, reps: 6, durationSeconds: null, distanceMeters: null },
      { weight: 60, reps: 4, durationSeconds: null, distanceMeters: null },
    ],
  });
  const root = render(exercise);
  const rowDeleteBtn = root.findByProps({ accessibilityLabel: 'ベンチプレス セット2を削除' });

  act(() => {
    rowDeleteBtn.props.onPress();
  });

  expect(mockUpdateExerciseSets).toHaveBeenCalledWith(0, [
    { weight: 60, reps: 8, durationSeconds: null, distanceMeters: null },
    { weight: 60, reps: 4, durationSeconds: null, distanceMeters: null },
  ]);
});

test('先頭行の✕でも狙った行だけが取り除かれる', () => {
  const exercise = makeExercise({
    sets: [
      { weight: 60, reps: 8, durationSeconds: null, distanceMeters: null },
      { weight: 60, reps: 6, durationSeconds: null, distanceMeters: null },
    ],
  });
  const root = render(exercise);
  const rowDeleteBtn = root.findByProps({ accessibilityLabel: 'ベンチプレス セット1を削除' });

  act(() => {
    rowDeleteBtn.props.onPress();
  });

  expect(mockUpdateExerciseSets).toHaveBeenCalledWith(0, [
    { weight: 60, reps: 6, durationSeconds: null, distanceMeters: null },
  ]);
});

test('セットが0件のとき、セット削除ボタンはdisabledで押しても何も起きない', () => {
  const root = render(makeExercise({ sets: [] }));
  const deleteBtn = findButtonByLabel(root, 'セット削除')!;

  expect(deleteBtn.props.accessibilityState).toEqual({ disabled: true });

  act(() => {
    deleteBtn.props.onPress();
  });
  expect(mockUpdateExerciseSets).toHaveBeenCalledWith(0, []);
});

test('⋮メニューの削除確認でキャンセルするとremoveExerciseAtは呼ばれない', () => {
  const root = render(makeExercise());
  act(() => {
    root.findByProps({ accessibilityLabel: 'メニューを開く' }).props.onPress();
  });
  act(() => {
    root.findByProps({ accessibilityLabel: '削除' }).props.onPress();
  });

  const cancelHandler = (Alert.alert as jest.Mock).mock.calls[0][2].find((b: any) => b.text === 'キャンセル').onPress;
  act(() => {
    cancelHandler?.();
  });

  expect(mockRemoveExerciseAt).not.toHaveBeenCalled();
});

test('⋮メニューの削除は確認ダイアログを経てremoveExerciseAtを呼ぶ', () => {
  const root = render(makeExercise(), 3);
  const menuTrigger = root.findByProps({ accessibilityLabel: 'メニューを開く' });

  act(() => {
    menuTrigger.props.onPress();
  });

  const deleteItem = root.findByProps({ accessibilityLabel: '削除' });
  act(() => {
    deleteItem.props.onPress();
  });

  expect(Alert.alert).toHaveBeenCalled();
  const confirmHandler = (Alert.alert as jest.Mock).mock.calls[0][2].find((b: any) => b.text === '削除').onPress;
  act(() => {
    confirmHandler();
  });

  expect(mockRemoveExerciseAt).toHaveBeenCalledWith(3);
});

test('ⓘを押すと種目詳細へ遷移する', () => {
  const root = render(makeExercise());
  const infoBtn = root.findByProps({ accessibilityLabel: 'ベンチプレスの詳細を見る' });

  act(() => {
    infoBtn.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith('/exercise/5');
});
