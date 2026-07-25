const mockBack = jest.fn();
const mockPush = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockUseExercises = jest.fn();
const mockAddExercisesToScheduledWorkout = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  useFocusEffect: (effect: () => (() => void) | void) => {
    effect();
  },
}));

jest.mock('@/hooks/use-exercises', () => ({
  useExercises: () => mockUseExercises(),
}));

jest.mock('@/hooks/use-exercise-usage-stats', () => ({
  useExerciseUsageStats: () => new Map(),
}));

jest.mock('@/lib/calendar/scheduled-workout-detail', () => ({
  addExercisesToScheduledWorkout: (...args: unknown[]) => mockAddExercisesToScheduledWorkout(...args),
}));

import ScheduleWorkoutAddExerciseScreen from '@/app/calendar/schedule-workout-add-exercise';
import { useExerciseSortStore } from '@/lib/exercises/sort-store';
import React from 'react';
import { Alert, Text, TouchableOpacity } from 'react-native';
import { act, create, type ReactTestInstance } from 'react-test-renderer';

// 既存予定への種目追加画面。ExercisePickerViewを共有する4画面のうち、この画面と
// schedule-workout-exercise-swap.tsxだけテストが無く、共通化の影響を直接受けるのに
// リグレッション網に穴が空いていたため追加した（@reviewer指摘）。
// 連打防止と失敗時のAlertはExercisePickerView側が持つ契約になっており、その配線を確かめる

const benchPress = {
  id: 10,
  name: 'ベンチプレス',
  category: 'chest',
  measurementType: 'weight_reps',
  source: 'preset',
  slug: 'bench_press',
  favorite: false,
};
const squat = {
  id: 11,
  name: 'スクワット',
  category: 'leg',
  measurementType: 'weight_reps',
  source: 'preset',
  slug: 'squat',
  favorite: false,
};
const benchPressLabel = 'ベンチプレス、胸';
const squatLabel = 'スクワット、脚';

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
    currentInstance = create(React.createElement(ScheduleWorkoutAddExerciseScreen));
  });
  return currentInstance!.root;
}

function selectRow(root: ReactTestInstance, label: string) {
  act(() => {
    root.findByProps({ accessibilityLabel: label }).props.onPress();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseLocalSearchParams.mockReturnValue({ scheduledWorkoutId: '7' });
  mockUseExercises.mockReturnValue({ exercises: [benchPress, squat] });
  mockAddExercisesToScheduledWorkout.mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  useExerciseSortStore.setState({ listSortBy: 'category', pickerSortBy: 'frequent', swapSortBy: 'frequent' });
});

afterEach(() => {
  act(() => {
    currentInstance?.unmount();
  });
  currentInstance = undefined;
  jest.restoreAllMocks();
});

test('選択して確定すると、予定idと選択順の種目idでaddExercisesToScheduledWorkoutが呼ばれ、戻る', async () => {
  const root = render();
  selectRow(root, squatLabel);
  selectRow(root, benchPressLabel);

  await act(async () => {
    findButtonByLabel(root, '2件を追加')!.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(mockAddExercisesToScheduledWorkout).toHaveBeenCalledWith(7, [11, 10]);
  expect(mockBack).toHaveBeenCalled();
});

test('未選択のときは確定ボタンが無効で、addExercisesToScheduledWorkoutは呼ばれない', () => {
  const root = render();
  const button = findButtonByLabel(root, '追加')!;

  expect(button.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));

  act(() => {
    button.props.onPress();
  });

  expect(mockAddExercisesToScheduledWorkout).not.toHaveBeenCalled();
});

test('追加が失敗した場合はエラーAlertを表示し、router.backは呼ばれない', async () => {
  mockAddExercisesToScheduledWorkout.mockRejectedValueOnce(new Error('db error'));
  const root = render();
  selectRow(root, benchPressLabel);

  await act(async () => {
    findButtonByLabel(root, '1件を追加')!.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(Alert.alert).toHaveBeenCalledWith('エラー', '種目を追加できませんでした。');
  expect(mockBack).not.toHaveBeenCalled();
});

test('確定ボタンを連打してもaddExercisesToScheduledWorkoutは1回しか呼ばれない', async () => {
  let resolveAdd!: () => void;
  mockAddExercisesToScheduledWorkout.mockReturnValue(
    new Promise<void>((resolve) => {
      resolveAdd = resolve;
    }),
  );
  const root = render();
  selectRow(root, benchPressLabel);

  act(() => {
    const button = findButtonByLabel(root, '1件を追加')!;
    button.props.onPress();
    button.props.onPress();
  });

  expect(mockAddExercisesToScheduledWorkout).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolveAdd();
  });
  expect(mockBack).toHaveBeenCalledTimes(1);
});
