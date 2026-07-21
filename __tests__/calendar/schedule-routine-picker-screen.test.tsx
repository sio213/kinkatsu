const mockBack = jest.fn();
const mockPush = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockUseRoutines = jest.fn();
const mockUseRoutineExerciseSummaries = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  Stack: {
    Screen: ({ options }: { options?: { headerTitle?: () => unknown } }) =>
      options?.headerTitle ? options.headerTitle() : null,
  },
}));

jest.mock('@/hooks/use-routines', () => ({
  useRoutines: () => mockUseRoutines(),
  useRoutineExerciseSummaries: () => mockUseRoutineExerciseSummaries(),
}));

import ScheduleRoutinePickerScreen from '@/app/calendar/schedule-routine-picker';
import type { Routine } from '@/db/schema';
import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';

function baseRoutine(overrides: Partial<Routine> = {}): Routine {
  return { id: 1, name: '胸の日', orderIndex: 0, createdAt: 0, updatedAt: 0, ...overrides };
}

function render() {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(ScheduleRoutinePickerScreen));
  });
  return instance.root;
}

function findCardByLabel(root: ReactTestInstance, label: string) {
  return root
    .findAllByType(TouchableOpacity)
    .find((btn) => typeof btn.props.accessibilityLabel === 'string' && btn.props.accessibilityLabel.includes(label));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseLocalSearchParams.mockReturnValue({ dateKey: '2026-07-25' });
  mockUseRoutines.mockReturnValue({ routines: [] });
  mockUseRoutineExerciseSummaries.mockReturnValue(new Map());
});

test('ヘッダーに選択日をサブタイトルとして表示する', () => {
  const root = render();
  expect(root.findByProps({ children: '7月25日（土）' })).toBeDefined();
});

test('ルーティンが0件なら空状態を表示し、戻るボタンでrouter.backする', () => {
  const root = render();
  expect(root.findByProps({ children: 'ルーティンがまだありません' })).toBeDefined();

  const backBtn = root.findAllByType(TouchableOpacity).find((btn) => btn.props.accessibilityLabel === '戻る')!;
  act(() => {
    backBtn.props.onPress();
  });
  expect(mockBack).toHaveBeenCalled();
});

test('カードをタップすると時刻選択画面へ、dateKey・routineId・routineName付きで遷移する', () => {
  mockUseRoutines.mockReturnValue({ routines: [baseRoutine({ id: 10, name: '胸の日' })] });
  mockUseRoutineExerciseSummaries.mockReturnValue(new Map([[10, { exerciseCount: 2, categories: ['chest'] }]]));
  const root = render();

  const card = findCardByLabel(root, '胸の日')!;
  act(() => {
    card.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/calendar/schedule-time-picker',
    params: { dateKey: '2026-07-25', routineId: '10', routineName: '胸の日' },
  });
});

test('複数ルーティンが表示された状態で、押したカードに対応するroutineIdが渡る（先頭固定になっていないことの確認）', () => {
  mockUseRoutines.mockReturnValue({
    routines: [baseRoutine({ id: 10, name: '胸の日' }), baseRoutine({ id: 20, name: '脚の日' })],
  });
  mockUseRoutineExerciseSummaries.mockReturnValue(
    new Map([
      [10, { exerciseCount: 2, categories: ['chest'] }],
      [20, { exerciseCount: 3, categories: ['leg'] }],
    ]),
  );
  const root = render();

  const card = findCardByLabel(root, '脚の日')!;
  act(() => {
    card.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/calendar/schedule-time-picker',
    params: { dateKey: '2026-07-25', routineId: '20', routineName: '脚の日' },
  });
});

test('カードを連打してもpushは1回しか呼ばれない（useDebouncedPushによる二重遷移防止）', () => {
  mockUseRoutines.mockReturnValue({ routines: [baseRoutine({ id: 10, name: '胸の日' })] });
  mockUseRoutineExerciseSummaries.mockReturnValue(new Map([[10, { exerciseCount: 1, categories: [] }]]));
  const root = render();

  const card = findCardByLabel(root, '胸の日')!;
  act(() => {
    card.props.onPress();
    card.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledTimes(1);
});

test('dateKeyが不正な形式の場合は「見つかりません」画面になる（parseDateKeyへ渡してクラッシュしないためのガード）', () => {
  mockUseLocalSearchParams.mockReturnValue({ dateKey: 'not-a-date' });
  mockUseRoutines.mockReturnValue({ routines: [baseRoutine({ id: 10, name: '胸の日' })] });
  const root = render();
  expect(root.findByProps({ children: '日付が見つかりません' })).toBeDefined();
  expect(() => root.findByProps({ children: '胸の日' })).toThrow();
});

test('dateKeyが無い(undefined)場合も「見つかりません」画面になり、戻るボタンでrouter.backする', () => {
  mockUseLocalSearchParams.mockReturnValue({ dateKey: undefined });
  const root = render();
  expect(root.findByProps({ children: '日付が見つかりません' })).toBeDefined();
  const backBtn = root.findAllByType(TouchableOpacity).find((btn) => btn.props.accessibilityLabel === '戻る')!;
  act(() => {
    backBtn.props.onPress();
  });
  expect(mockBack).toHaveBeenCalled();
});

// 「今回だけ差し替え」（PR10-6b）は2026-07-22に⋮メニュー撤去と合わせて廃止した（@ユーザー指摘）。
// この画面は常に見出し「ルーティンを選択」・dateKey/routineId/routineNameのみを次画面へ渡す
test('見出しは常に「ルーティンを選択」', () => {
  const root = render();
  expect(root.findByProps({ children: 'ルーティンを選択' })).toBeDefined();
});
