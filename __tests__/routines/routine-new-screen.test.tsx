const mockBack = jest.fn();
const mockPush = jest.fn();
const mockCreateRoutine = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
  // RoutineFormはキーボードを閉じるためだけにuseFocusEffectを使う(setValue等の状態更新は
  // 無いので、exercise-picker-screen.test.tsxと同じ「毎レンダーで即実行」の単純なモックで安全)
  useFocusEffect: (effect: () => (() => void) | void) => {
    effect();
  },
}));

jest.mock('@/hooks/use-routines', () => ({
  useRoutines: () => ({ createRoutine: mockCreateRoutine }),
}));

import { useRoutineDraftStore } from '@/lib/routines/draft-store';
import type { DraftExercise } from '@/lib/routines/validation';
import RoutineNewScreen from '@/app/routine/new';
import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Alert, Text, TextInput, TouchableOpacity } from 'react-native';

function makeDraftExercise(exerciseId: number): DraftExercise {
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

// useRoutineDraftStoreはモジュール単位のシングルトンでテストを跨いで共有されるため、
// 前のテストのレンダラーをアンマウントし忘れると、次のテストが描画前にstoreを直接書き換えた際
// 古いインスタンスがact()の外で更新を受けて警告が出る。テストごとに明示的に破棄する
let currentInstance: ReturnType<typeof create> | undefined;

function render() {
  act(() => {
    currentInstance = create(React.createElement(RoutineNewScreen));
  });
  return currentInstance!.root;
}

// RoutineNewScreenはマウント時に必ずドラフトストアをresetする（新規作成は常に空から始まる
// 仕様のため）。そのため「ピッカーで種目を選んで戻ってきた」状態を再現するテストは、
// render()の後（＝reset後）にストアへ種目を追加する必要がある。render()前に追加しても
// マウント時resetで即座に消えてしまう
function addExercisesAfterRender(exercises: DraftExercise[]) {
  act(() => {
    useRoutineDraftStore.getState().addExercises(exercises);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useRoutineDraftStore.getState().reset();
  mockCreateRoutine.mockResolvedValue(1);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  act(() => {
    currentInstance?.unmount();
  });
  currentInstance = undefined;
});

test('マウント時にドラフトストアがリセットされ、種目0件では「種目を追加」の空状態が表示される', () => {
  useRoutineDraftStore.getState().addExercises([makeDraftExercise(1)]);
  const root = render();

  expect(useRoutineDraftStore.getState().exercises).toEqual([]);
  expect(root.findByProps({ accessibilityLabel: '種目を追加' })).toBeDefined();
});

test('種目を追加ボタンを押すと/routine/exercise-pickerへ遷移する', () => {
  const root = render();
  const addBtn = root.findByProps({ accessibilityLabel: '種目を追加' });

  act(() => {
    addBtn.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith('/routine/exercise-picker');
});

test('未入力のまま保存を押すと、エラーメッセージが表示されcreateRoutineは呼ばれない', async () => {
  const root = render();
  const submitBtn = findButtonByLabel(root, '保存')!;

  await act(async () => {
    submitBtn.props.onPress();
  });

  expect(mockCreateRoutine).not.toHaveBeenCalled();
  expect(root.findByProps({ children: 'ルーティン名を入力してください' })).toBeDefined();
  expect(root.findByProps({ children: '種目を1つ以上追加してください' })).toBeDefined();
});

test('名前は入力済み・種目0件で保存すると、種目のエラーだけが表示される', async () => {
  const root = render();
  const nameInput = root.findAllByType(TextInput)[0];
  act(() => {
    nameInput.props.onChangeText('胸の日');
  });

  const submitBtn = findButtonByLabel(root, '保存')!;
  await act(async () => {
    await submitBtn.props.onPress();
  });

  expect(mockCreateRoutine).not.toHaveBeenCalled();
  expect(() => root.findByProps({ children: 'ルーティン名を入力してください' })).toThrow();
  expect(root.findByProps({ children: '種目を1つ以上追加してください' })).toBeDefined();
});

test('種目はある・名前が空で保存すると、名前のエラーだけが表示される', async () => {
  const root = render();
  addExercisesAfterRender([makeDraftExercise(5)]);

  const submitBtn = findButtonByLabel(root, '保存')!;
  await act(async () => {
    await submitBtn.props.onPress();
  });

  expect(mockCreateRoutine).not.toHaveBeenCalled();
  expect(root.findByProps({ children: 'ルーティン名を入力してください' })).toBeDefined();
  expect(() => root.findByProps({ children: '種目を1つ以上追加してください' })).toThrow();
});

test('ピッカーから戻ってきた想定(render後にストアへ種目追加)で、フォームの種目一覧に反映される', () => {
  const root = render();
  addExercisesAfterRender([makeDraftExercise(5)]);

  expect(root.findByProps({ accessibilityLabel: '種目5、胸、1セット・60kg×8' })).toBeDefined();
});

test('ドラフトストアから種目が取り除かれると(削除UIはテンプレートセット編集画面に持たせる想定)、フォームの一覧からも即座に消える', () => {
  const root = render();
  addExercisesAfterRender([makeDraftExercise(5), makeDraftExercise(6)]);

  act(() => {
    useRoutineDraftStore.getState().removeExerciseAt(0);
  });

  expect(useRoutineDraftStore.getState().exercises.map((e) => e.exerciseId)).toEqual([6]);
  expect(() => root.findByProps({ accessibilityLabel: '種目5、胸、1セット・60kg×8' })).toThrow();
  expect(root.findByProps({ accessibilityLabel: '種目6、胸、1セット・60kg×8' })).toBeDefined();
});

test('名前を入力し、ドラフトストアに種目がある状態(=render後に追加)で保存すると、変換済みのRoutineInputでcreateRoutineが呼ばれrouter.backする', async () => {
  const root = render();
  addExercisesAfterRender([makeDraftExercise(5)]);

  const nameInput = root.findAllByType(TextInput)[0];
  act(() => {
    nameInput.props.onChangeText('  胸の日  ');
  });

  const submitBtn = findButtonByLabel(root, '保存')!;
  await act(async () => {
    await submitBtn.props.onPress();
  });

  // routineFormSchemaのz.string().trim()によりtrimされた値で保存される
  expect(mockCreateRoutine).toHaveBeenCalledWith({
    name: '胸の日',
    exercises: [{ exerciseId: 5, sets: [{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null }] }],
  });
  expect(mockBack).toHaveBeenCalled();
});

test('複数種目を追加した状態で保存すると、選択順を保ったまま全件がRoutineInputに含まれる', async () => {
  const root = render();
  addExercisesAfterRender([makeDraftExercise(5), makeDraftExercise(9)]);

  const nameInput = root.findAllByType(TextInput)[0];
  act(() => {
    nameInput.props.onChangeText('全身の日');
  });

  const submitBtn = findButtonByLabel(root, '保存')!;
  await act(async () => {
    await submitBtn.props.onPress();
  });

  expect(mockCreateRoutine).toHaveBeenCalledWith({
    name: '全身の日',
    exercises: [
      { exerciseId: 5, sets: [{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null }] },
      { exerciseId: 9, sets: [{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null }] },
    ],
  });
});

test('保存に失敗するとAlertが表示され、router.backは呼ばれず入力内容も残る', async () => {
  mockCreateRoutine.mockRejectedValueOnce(new Error('insert failed'));
  const root = render();
  addExercisesAfterRender([makeDraftExercise(5)]);

  const nameInput = root.findAllByType(TextInput)[0];
  act(() => {
    nameInput.props.onChangeText('胸の日');
  });

  const submitBtn = findButtonByLabel(root, '保存')!;
  await act(async () => {
    await submitBtn.props.onPress();
  });

  expect(Alert.alert).toHaveBeenCalledWith('エラー', 'ルーティンの保存に失敗しました。');
  expect(mockBack).not.toHaveBeenCalled();
  // リトライできるよう入力内容は消えない
  expect(nameInput.props.value).toBe('胸の日');
  expect(root.findByProps({ accessibilityLabel: '種目5、胸、1セット・60kg×8' })).toBeDefined();
});

test('種目行をタップするとテンプレートセット編集画面へ遷移する', () => {
  const root = render();
  addExercisesAfterRender([makeDraftExercise(5)]);

  const row = root.findByProps({ accessibilityLabel: '種目5、胸、1セット・60kg×8' });
  act(() => {
    row.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith('/routine/exercise-edit');
});
