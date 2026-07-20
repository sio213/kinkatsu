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

import ScheduleWorkoutRoutinePickerScreen from '@/app/calendar/schedule-workout-routine-picker';
import type { Routine } from '@/db/schema';
import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';

function baseRoutine(overrides: Partial<Routine> = {}): Routine {
  return { id: 1, name: '胸トレ', orderIndex: 0, createdAt: 0, updatedAt: 0, ...overrides };
}

function render() {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(ScheduleWorkoutRoutinePickerScreen));
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
  mockUseLocalSearchParams.mockReturnValue({ scheduledWorkoutId: '5' });
  mockUseRoutines.mockReturnValue({ routines: [] });
  mockUseRoutineExerciseSummaries.mockReturnValue(new Map());
});

// ヘッダー⋮「ルーティンから読み込む」フローの画面2。app/workout/routine-picker.tsxのカレンダー版
// （2026-07-21新設）
describe('ScheduleWorkoutRoutinePickerScreen', () => {
  test('scheduledWorkoutIdが不正(NaN)な場合は「見つかりません」画面になる', () => {
    mockUseLocalSearchParams.mockReturnValue({ scheduledWorkoutId: 'abc' });
    const root = render();
    expect(root.findByProps({ children: '予定が見つかりません' })).toBeDefined();
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

  test('カードをタップするとルーティン内の種目を選ぶ画面へ、scheduledWorkoutId・routineId・routineName付きで遷移する', () => {
    mockUseRoutines.mockReturnValue({ routines: [baseRoutine({ id: 5, name: '胸トレ' })] });
    mockUseRoutineExerciseSummaries.mockReturnValue(new Map([[5, { exerciseCount: 2, categories: ['chest'] }]]));
    const root = render();

    const card = findCardByLabel(root, '胸トレ')!;
    act(() => {
      card.props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/calendar/schedule-workout-routine-load',
      params: { scheduledWorkoutId: '5', routineId: '5', routineName: '胸トレ' },
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
});
