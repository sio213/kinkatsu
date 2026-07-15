const mockBack = jest.fn();
const mockPush = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockUseRoutines = jest.fn();
const mockUseRoutineExerciseSummaries = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

jest.mock('@/hooks/use-routines', () => ({
  useRoutines: () => mockUseRoutines(),
  useRoutineExerciseSummaries: () => mockUseRoutineExerciseSummaries(),
}));

import RoutinePickerScreen from '@/app/workout/routine-picker';
import type { Routine } from '@/db/schema';
import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';

function baseRoutine(overrides: Partial<Routine> = {}): Routine {
  return { id: 1, name: '胸トレ', orderIndex: 0, createdAt: 0, updatedAt: 0, ...overrides };
}

function render() {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(RoutinePickerScreen));
  });
  return instance.root;
}

function findCardByLabel(root: ReactTestInstance, label: string) {
  return root
    .findAllByType(TouchableOpacity)
    .find((btn) => typeof btn.props.accessibilityLabel === 'string' && btn.props.accessibilityLabel.includes(label));
}

// 「{exerciseCount}種目」はJSX上{exerciseCount}種目のように2要素に分かれてレンダーされるため、
// 単純なfindByProps({children: '3種目'})では見つからない（workout-screen.test.tsxのfindButtonByLabelと同じ理由）
function findTextByJoinedChildren(root: ReactTestInstance, text: string) {
  return root
    .findAllByType(Text)
    .find((t) => [t.props.children].flat().join('') === text);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseLocalSearchParams.mockReturnValue({ sessionId: '99' });
  mockUseRoutines.mockReturnValue({ routines: [] });
  mockUseRoutineExerciseSummaries.mockReturnValue(new Map());
});

test('sessionIdが不正(NaN)な場合は「見つかりません」画面になる', () => {
  mockUseLocalSearchParams.mockReturnValue({ sessionId: 'abc' });
  const root = render();
  expect(root.findByProps({ children: 'トレーニングが見つかりません' })).toBeDefined();
});

test('ルーティンが0件なら空状態を表示し、戻るボタンでrouter.backする', () => {
  const root = render();
  expect(root.findByProps({ children: 'ルーティンがまだありません' })).toBeDefined();

  const backBtn = root
    .findAllByType(TouchableOpacity)
    .find((btn) => btn.props.accessibilityLabel === '戻る')!;
  act(() => {
    backBtn.props.onPress();
  });
  expect(mockBack).toHaveBeenCalled();
});

test('ルーティン一覧をカードで表示する(名前+種目数+カテゴリ)', () => {
  mockUseRoutines.mockReturnValue({ routines: [baseRoutine({ id: 1, name: '胸トレ' })] });
  mockUseRoutineExerciseSummaries.mockReturnValue(new Map([[1, { exerciseCount: 3, categories: ['chest'] }]]));
  const root = render();

  expect(root.findByProps({ children: '胸トレ' })).toBeDefined();
  expect(findTextByJoinedChildren(root, '3種目')).toBeDefined();
});

test('summariesに該当データが無いルーティンは種目数0・カテゴリ無しでフォールバック表示する', () => {
  mockUseRoutines.mockReturnValue({ routines: [baseRoutine({ id: 1, name: '胸トレ' })] });
  mockUseRoutineExerciseSummaries.mockReturnValue(new Map());
  const root = render();

  expect(findTextByJoinedChildren(root, '0種目')).toBeDefined();
});

test('カードをタップするとルーティン内の種目を選ぶ画面へ、sessionId・routineId・routineName付きで遷移する', () => {
  mockUseRoutines.mockReturnValue({ routines: [baseRoutine({ id: 5, name: '胸トレ' })] });
  mockUseRoutineExerciseSummaries.mockReturnValue(new Map([[5, { exerciseCount: 2, categories: ['chest'] }]]));
  const root = render();

  const card = findCardByLabel(root, '胸トレ')!;
  act(() => {
    card.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/workout/routine-load',
    params: { sessionId: '99', routineId: '5', routineName: '胸トレ' },
  });
});

test('複数ルーティンが表示された状態で、押したカードに対応するroutineIdが渡る（先頭固定になっていないことの確認）', () => {
  mockUseRoutines.mockReturnValue({
    routines: [baseRoutine({ id: 1, name: '胸トレ' }), baseRoutine({ id: 2, name: '背中トレ' })],
  });
  mockUseRoutineExerciseSummaries.mockReturnValue(
    new Map([
      [1, { exerciseCount: 2, categories: ['chest'] }],
      [2, { exerciseCount: 3, categories: ['back'] }],
    ]),
  );
  const root = render();

  const card = findCardByLabel(root, '背中トレ')!;
  act(() => {
    card.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/workout/routine-load',
    params: { sessionId: '99', routineId: '2', routineName: '背中トレ' },
  });
});

test('カードを連打してもpushは1回しか呼ばれない（useDebouncedPushによる二重遷移防止）', () => {
  mockUseRoutines.mockReturnValue({ routines: [baseRoutine({ id: 1, name: '胸トレ' })] });
  mockUseRoutineExerciseSummaries.mockReturnValue(new Map([[1, { exerciseCount: 1, categories: [] }]]));
  const root = render();

  const card = findCardByLabel(root, '胸トレ')!;
  act(() => {
    card.props.onPress();
    card.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledTimes(1);
});
